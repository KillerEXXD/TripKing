-- TripKing — migration 024: trip types (one_way / round_trip / multi_way) + waypoints + multi-day duration.
--
-- Today a trip is a single A→B leg. This migration generalises it to an ordered list of
-- waypoints (origin → 0..N stops → final destination), enabling:
--
--   * one_way      — A→B (today's shape)
--   * round_trip   — A→…→A (last waypoint's city/place == first)
--   * multi_way    — A→B→C→D… (3+ distinct waypoints, last ≠ first)
--
-- Every type can carry intermediate stops. The trip's denormalised `from_*` / `to_*` /
-- `expected_end_at` mirror the first + last waypoint, kept in sync by a trigger so that
-- existing list queries (?from_city_id=…) keep working without joining trip_waypoints.
--
-- Multi-day support: pickup_at (trip start) + expected_end_at (trip end). Driver bata is
-- now per-day; the compute_trip_payout trigger multiplies by the day count.

set search_path = public, pg_catalog;

-- ── 1. trips.trip_type ──────────────────────────────────────────────────────
alter table public.trips
  add column if not exists trip_type text not null default 'one_way'
    check (trip_type in ('one_way','round_trip','multi_way'));

-- ── 2. trips.expected_end_at (trip end / return time) ──────────────────────
alter table public.trips
  add column if not exists expected_end_at timestamptz;

-- Backfill: existing single-leg rows estimate end = pickup + 1 day so the new per-day
-- bata math leaves their payouts unchanged. The agent can edit later if it was wrong.
update public.trips
   set expected_end_at = pickup_at + interval '1 day'
 where expected_end_at is null;

alter table public.trips
  alter column expected_end_at set not null;

alter table public.trips
  drop constraint if exists trips_end_after_start;
alter table public.trips
  add constraint trips_end_after_start
    check (expected_end_at > pickup_at);

-- ── 3. driver_bata semantics change ─────────────────────────────────────────
-- NOT renaming the column (every existing code path inserts/reads `driver_bata`); just
-- changing the SEMANTICS to per-day. compute_trip_payout (below) multiplies by day count.
-- Existing rows have expected_end_at = pickup_at + 1 day ⇒ multiplier = 1 ⇒ payout unchanged.
-- A future migration can do the rename once every code reference flips in one PR.

-- ── 4. trip_waypoints ───────────────────────────────────────────────────────
create table if not exists public.trip_waypoints (
  id              uuid primary key default gen_random_uuid(),
  trip_id         uuid not null references public.trips(id) on delete cascade,
  seq             smallint not null,                       -- 0 = origin; max(seq) = final destination
  city_id         uuid references public.cities(id),
  place_id        uuid references public.places(id),
  arrive_at       timestamptz,                             -- expected arrival; NULL for seq=0 (origin time = trips.pickup_at)
  wait_minutes    integer not null default 0 check (wait_minutes >= 0),
  is_destination  boolean not null default false,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (trip_id, seq),
  check (city_id is not null or place_id is not null)
);

create index if not exists idx_trip_waypoints_trip_seq
  on public.trip_waypoints (trip_id, seq);
create index if not exists idx_trip_waypoints_city
  on public.trip_waypoints (city_id) where city_id is not null;
create index if not exists idx_trip_waypoints_place
  on public.trip_waypoints (place_id) where place_id is not null;

create trigger trip_waypoints_set_updated_at
  before update on public.trip_waypoints
  for each row execute function public.set_updated_at();

-- ── 5. Backfill: every existing trip gets 2 waypoint rows (seq 0 = from_*, seq 1 = to_*) ──
insert into public.trip_waypoints (trip_id, seq, city_id, place_id, arrive_at, wait_minutes, is_destination)
select t.id, 0, t.from_city_id, t.from_place_id, null, 0, false
  from public.trips t
 where not exists (select 1 from public.trip_waypoints w where w.trip_id = t.id and w.seq = 0);

insert into public.trip_waypoints (trip_id, seq, city_id, place_id, arrive_at, wait_minutes, is_destination)
select t.id, 1, t.to_city_id, t.to_place_id, t.expected_end_at, 0, true
  from public.trips t
 where not exists (select 1 from public.trip_waypoints w where w.trip_id = t.id and w.seq = 1);

-- ── 6. Mirror trigger: trip_waypoints (insert/update/delete) → trips.from_*/to_*/expected_end_at ──
create or replace function public.trip_waypoints_mirror_trip()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_trip_id uuid;
  v_min_seq smallint;
  v_max_seq smallint;
  v_from_city uuid;
  v_from_place uuid;
  v_to_city uuid;
  v_to_place uuid;
  v_last_arrive timestamptz;
  v_last_wait int;
  v_end_at timestamptz;
begin
  v_trip_id := coalesce(new.trip_id, old.trip_id);
  if v_trip_id is null then return null; end if;

  select min(seq), max(seq) into v_min_seq, v_max_seq
    from public.trip_waypoints where trip_id = v_trip_id;

  -- if no waypoints remain (mass delete), leave the trip's denormalised cols alone
  if v_min_seq is null then return null; end if;

  select city_id, place_id into v_from_city, v_from_place
    from public.trip_waypoints where trip_id = v_trip_id and seq = v_min_seq;
  select city_id, place_id, arrive_at, wait_minutes into v_to_city, v_to_place, v_last_arrive, v_last_wait
    from public.trip_waypoints where trip_id = v_trip_id and seq = v_max_seq;

  v_end_at := coalesce(v_last_arrive + make_interval(mins => coalesce(v_last_wait,0)), null);

  update public.trips
     set from_city_id    = v_from_city,
         from_place_id   = v_from_place,
         to_city_id      = v_to_city,
         to_place_id     = v_to_place,
         expected_end_at = coalesce(v_end_at, expected_end_at)
   where id = v_trip_id;

  return null;
end;
$$;

drop trigger if exists trip_waypoints_mirror_trip on public.trip_waypoints;
create trigger trip_waypoints_mirror_trip
  after insert or update or delete on public.trip_waypoints
  for each row execute function public.trip_waypoints_mirror_trip();

-- ── 7. Per-day bata in driver_payout: replace the old compute_trip_payout ──
-- Adds: driver_bata_per_day × ceil(days(expected_end_at − pickup_at)) to the payout.
-- Existing rows: expected_end_at = pickup_at + 1 day → multiplier = 1 → payouts unchanged.
create or replace function public.compute_trip_payout()
returns trigger language plpgsql as $$
declare
  v_days int;
begin
  -- expected_end_at is NOT NULL after this migration; coalesce defends against pre-trigger nulls.
  v_days := greatest(1, ceil(extract(epoch from (coalesce(new.expected_end_at, new.pickup_at + interval '1 day') - new.pickup_at)) / 86400.0)::int);
  new.driver_payout := round(
    coalesce(new.total_fare,0)
    - coalesce(new.total_fare,0) * coalesce(new.commission_pct,0) / 100.0
    - coalesce(new.gst_amount,0)
    + coalesce(new.driver_bata,0) * v_days,
    2);
  return new;
end;
$$;

drop trigger if exists trips_compute_payout on public.trips;
create trigger trips_compute_payout
  before insert or update of total_fare, commission_pct, gst_amount, driver_bata, expected_end_at, pickup_at
  on public.trips
  for each row execute function public.compute_trip_payout();

-- Recompute every existing row so driver_payout matches the new formula.
-- (Multiplier is 1 for one-day rows so values stay identical; this is a no-op pass that
--  also guards against any stale rows whose payout was set before the trigger existed.)
update public.trips set total_fare = total_fare where total_fare is not null;

-- ── 8. app_settings: wait rate + max trip duration ──────────────────────────
alter table public.app_settings
  add column if not exists wait_rate_per_min      numeric(10,2) not null default 5,
  add column if not exists max_trip_duration_days integer       not null default 14;

-- ── 9. RLS on trip_waypoints ────────────────────────────────────────────────
alter table public.trip_waypoints enable row level security;

drop policy if exists waypoints_read on public.trip_waypoints;
create policy waypoints_read on public.trip_waypoints
  for select using (true);   -- waypoints are public route data; no PII

drop policy if exists waypoints_owner_write on public.trip_waypoints;
create policy waypoints_owner_write on public.trip_waypoints
  for all using (
    public.is_admin()
    or trip_id in (select id from public.trips where posted_by_user_id = auth.uid())
  ) with check (
    public.is_admin()
    or trip_id in (select id from public.trips where posted_by_user_id = auth.uid())
  );

analyze public.trips;
analyze public.trip_waypoints;
