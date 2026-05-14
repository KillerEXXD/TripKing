-- Migration 031 — Phase 2 of the trip-assignment two-step handshake.
-- Cron-driven auto-expiry of `selected` trips whose acceptance_deadline_at has
-- passed without the driver tapping /accept. See docs/TRIP_ASSIGNMENT_WORKFLOW.md
-- §3 + §5 + §9. The job runs every minute (pg_cron); the function is idempotent.
--
-- Effect of expiry on a single trip:
--   trips.status                    'selected'  → 'has_applicants' (or 'open' if no applicants left)
--   trips.assigned_driver_id        cleared
--   trips.assigned_vehicle_id       cleared
--   trips.assigned_acceptance_id    cleared
--   trips.assigned_at               cleared
--   trips.acceptance_deadline_at    cleared
--   trips.driver_acceptance_status  'expired'  — kept so analytics can count expirations
--   trip_acceptances (selected one) → 'expired' (driver is OUT of the pool for this trip)
--
-- Notifications are NOT inserted from here (the function stays SQL-only — no
-- dependency on the notifications schema). Phase 3 / a follow-up will wire a
-- trigger that fires `selection_expired` notifications when a trip transitions
-- from 'selected' → 'has_applicants' with driver_acceptance_status='expired'.

create extension if not exists pg_cron;

create or replace function public.expire_stale_selections() returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  expired_count int;
begin
  -- First flip the matching trip_acceptances rows to 'expired'. We do this BEFORE
  -- touching the trip so the row identity is still resolvable via assigned_acceptance_id.
  update public.trip_acceptances
     set status = 'expired',
         decision_at = now()
   where id in (
     select t.assigned_acceptance_id
       from public.trips t
      where t.status = 'selected'
        and t.acceptance_deadline_at is not null
        and t.acceptance_deadline_at < now()
        and t.assigned_acceptance_id is not null
   );

  -- Then reset the trip rows. Use the COUNT to keep the cron output traceable.
  with stale as (
    select id, trip_id
      from (
        select t.id,
               t.id as trip_id,
               (select count(*) from public.trip_acceptances ta
                 where ta.trip_id = t.id and ta.status = 'applied') as still_applied
          from public.trips t
         where t.status = 'selected'
           and t.acceptance_deadline_at is not null
           and t.acceptance_deadline_at < now()
      ) s
  )
  update public.trips t
     set status = case
                    when (select count(*) from public.trip_acceptances ta
                            where ta.trip_id = t.id and ta.status = 'applied') > 0
                    then 'has_applicants'
                    else 'open'
                  end,
         assigned_driver_id     = null,
         assigned_vehicle_id    = null,
         assigned_acceptance_id = null,
         assigned_at            = null,
         acceptance_deadline_at = null,
         driver_acceptance_status = 'expired'
   where t.id in (select id from stale);

  get diagnostics expired_count = row_count;
  if expired_count > 0 then
    raise notice 'expire_stale_selections: % trip(s) reset to has_applicants/open', expired_count;
  end if;
end;
$$;

comment on function public.expire_stale_selections is
  'Phase 2 of the two-step handshake (migration 031). Cron-scheduled every minute. Resets selected trips whose acceptance_deadline_at has elapsed back to has_applicants (or open if no applicants remain) and marks the driver_acceptance_status as expired so analytics can count it.';

-- Schedule it (idempotent: cron.schedule errors if the job name already exists,
-- so guard with a SELECT-from-cron.job).
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'trips_expire_stale_selections') then
    perform cron.schedule(
      'trips_expire_stale_selections',
      '* * * * *',  -- every minute
      'select public.expire_stale_selections()'
    );
  end if;
end$$;
