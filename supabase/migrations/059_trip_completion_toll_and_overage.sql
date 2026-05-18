-- TripKing — migration 059: trip completion enrichments
--
-- Adds toll capture + extra-KM overage to the trip-completion flow so the
-- driver's final payout reflects what actually happened on the road:
--   • toll paid by the driver is reimbursed 100% (passed through to the
--     passenger's bill — agent commission is NOT taken on toll);
--   • when actual distance (end_odo - start_odo) exceeds the accepted
--     expected_distance_km, the extra kilometres are billed at the same
--     rate_per_km the trip was posted at, and the payout is recomputed.
--
-- Denormalised result columns live on `trips` so list endpoints don't have
-- to join `trip_executions`. They are populated by a trigger that fires
-- after the trip_executions row is finalised (end_odo present + completed_at
-- set). The columns are nullable so pre-completion behaviour is unchanged.

------------------------------------------------------------------------------
-- 1. trip_executions: toll + driver's private note to the agent
------------------------------------------------------------------------------
alter table public.trip_executions
  add column if not exists toll_paid_by_driver  numeric(10,2) not null default 0
    check (toll_paid_by_driver >= 0),
  add column if not exists driver_review_note   text,
  add column if not exists end_odo_finalized_at timestamptz;

comment on column public.trip_executions.toll_paid_by_driver is
  'Toll amount the driver paid out-of-pocket during the trip. 100% reimbursed in the final driver payout and passed through to the passenger bill.';
comment on column public.trip_executions.driver_review_note is
  'Private note from the driver to the trip-posting agent (not the public review).';
comment on column public.trip_executions.end_odo_finalized_at is
  'Timestamp when the driver completed the end-of-trip wizard step 1 (odo + toll).';

------------------------------------------------------------------------------
-- 2. trips: denormalised final-cost columns
------------------------------------------------------------------------------
alter table public.trips
  add column if not exists final_total_fare    numeric(12,2),
  add column if not exists extra_distance_km   numeric(8,1),
  add column if not exists extra_km_fare       numeric(10,2),
  add column if not exists toll_amount         numeric(10,2),
  add column if not exists final_driver_payout numeric(12,2);

comment on column public.trips.final_total_fare    is 'Final passenger-facing bill = total_fare + extra_km_fare + toll_amount. Set on completion.';
comment on column public.trips.extra_distance_km   is 'max(0, actual_distance_km - expected_distance_km). Set on completion.';
comment on column public.trips.extra_km_fare       is 'extra_distance_km * rate_per_km, 2dp. Set on completion.';
comment on column public.trips.toll_amount         is 'Toll paid by driver, passed through to passenger and reimbursed in payout.';
comment on column public.trips.final_driver_payout is
  'Driver take-home after extra-KM, commission, GST and bata recompute, plus 100% toll reimbursement. Use this in place of driver_payout for completed trips.';

------------------------------------------------------------------------------
-- 3. Trigger: recompute final cost columns when execution is finalised
------------------------------------------------------------------------------
-- Fires after a trip_executions upsert where end_odo_reading and completed_at
-- are both set. Idempotent — overwrites the row's final_* columns with the
-- canonical computation (no early-return). The /trips/:id/complete edge
-- function should always upsert trip_executions BEFORE flipping
-- trips.status to 'completed' so the wallet-charge trigger (migration 044)
-- sees the final numbers already in place.
create or replace function public.compute_trip_final_payout()
returns trigger language plpgsql as $$
declare
  v_trip            public.trips%rowtype;
  v_extra_km        numeric(8,1);
  v_extra_fare      numeric(10,2);
  v_toll            numeric(10,2);
  v_final_fare      numeric(12,2);
  v_final_payout    numeric(12,2);
begin
  if new.end_odo_reading is null or new.start_odo_reading is null or new.completed_at is null then
    return new;
  end if;

  select * into v_trip from public.trips where id = new.trip_id for update;
  if not found then return new; end if;

  v_extra_km   := greatest(0, coalesce(new.actual_distance_km, 0) - coalesce(v_trip.expected_distance_km, 0));
  v_extra_fare := round(v_extra_km * coalesce(v_trip.rate_per_km, 0), 2);
  v_toll       := coalesce(new.toll_paid_by_driver, 0);
  v_final_fare := round(coalesce(v_trip.total_fare, 0) + v_extra_fare + v_toll, 2);
  -- payout: commission applies to (base + extra-KM); toll is 100% pass-through.
  v_final_payout := round(
      (coalesce(v_trip.total_fare, 0) + v_extra_fare)
    - (coalesce(v_trip.total_fare, 0) + v_extra_fare) * coalesce(v_trip.commission_pct, 0) / 100.0
    - coalesce(v_trip.gst_amount, 0)
    + coalesce(v_trip.driver_bata, 0)
    + v_toll
  , 2);

  update public.trips
     set extra_distance_km   = v_extra_km,
         extra_km_fare       = v_extra_fare,
         toll_amount         = v_toll,
         final_total_fare    = v_final_fare,
         final_driver_payout = v_final_payout
   where id = new.trip_id;

  return new;
end;
$$;

drop trigger if exists trip_executions_compute_final_payout on public.trip_executions;
create trigger trip_executions_compute_final_payout
  after insert or update of end_odo_reading, start_odo_reading, toll_paid_by_driver, completed_at
  on public.trip_executions
  for each row execute function public.compute_trip_final_payout();

------------------------------------------------------------------------------
-- 4. Storage bucket: trip-executions-photos (start/end odometer photos)
------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('trip-executions-photos', 'trip-executions-photos', false, 5242880,
   array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Path convention: <trip_id>/start_odo  or  <trip_id>/end_odo
drop policy if exists "trip-executions-photos driver write" on storage.objects;
create policy "trip-executions-photos driver write" on storage.objects for all to authenticated
  using      (bucket_id = 'trip-executions-photos'
              and public.is_assigned_driver(public.storage_owner_uuid(name)))
  with check (bucket_id = 'trip-executions-photos'
              and public.is_assigned_driver(public.storage_owner_uuid(name)));

drop policy if exists "trip-executions-photos agent read" on storage.objects;
create policy "trip-executions-photos agent read" on storage.objects for select to authenticated
  using (bucket_id = 'trip-executions-photos'
         and (public.owns_trip(public.storage_owner_uuid(name)) or public.is_admin()));

------------------------------------------------------------------------------
-- 5. RLS on the new trip_executions columns is covered by the existing
--    table-level policies (assigned driver / trip poster / admin); no change.
------------------------------------------------------------------------------

analyze public.trip_executions;
analyze public.trips;
