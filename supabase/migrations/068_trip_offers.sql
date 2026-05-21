-- Trip offers — the Auto-dispatch offer log (PR1 schema; BEHAVIOUR-NEUTRAL:
-- table + RLS + Realtime publication only, no engine yet).
--
-- One row per (trip, driver, pass). Records every 60s offer and its outcome;
-- drives the driver's "Missed Trips" list and the "one live offer at a time"
-- rule. On accept the engine ALSO writes the existing trip_acceptances(accepted)
-- + trips.assigned_*, so the downstream lifecycle is unchanged.

create table if not exists public.trip_offers (
  id             uuid primary key default gen_random_uuid(),
  trip_id        uuid not null references public.trips(id) on delete cascade,
  driver_id      uuid not null references public.drivers(id),
  token_at_offer bigint,
  pass_number    integer not null,
  offered_at     timestamptz not null default now(),
  deadline_at    timestamptz not null,
  status         text not null check (status in ('offered','accepted','declined','missed','superseded')),
  responded_at   timestamptz,
  unique (trip_id, driver_id, pass_number)
);

create index if not exists idx_trip_offers_trip   on public.trip_offers (trip_id, pass_number);
create index if not exists idx_trip_offers_driver on public.trip_offers (driver_id, status);  -- missed list + "any live offer?" check
create index if not exists idx_trip_offers_live   on public.trip_offers (driver_id) where status = 'offered';

alter table public.trip_offers enable row level security;
-- The offered driver, the trip poster, and admins may READ. WRITES are
-- service-role only (the dispatch engine in the edge functions).
drop policy if exists "trip_offers read offered/poster/admin" on public.trip_offers;
create policy "trip_offers read offered/poster/admin" on public.trip_offers
  for select to authenticated
  using (public.owns_driver(driver_id) or public.owns_trip(trip_id) or public.is_admin());

-- Realtime: surface offer changes as a "refetch now" SIGNAL only (payload is
-- never rendered; data still flows through the REST API + transforms — the
-- documented carve-out to rule #1, see migration 063 / PR #324). REPLICA
-- IDENTITY FULL lets Realtime evaluate RLS + emit old-row ids on UPDATE/DELETE.
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trip_offers'
  ) then
    alter publication supabase_realtime add table public.trip_offers;
  end if;
end $$;
alter table public.trip_offers replica identity full;

analyze public.trip_offers;
