-- Driver presence — the "I'm Online" runtime for Auto-dispatch (PR1 schema;
-- BEHAVIOUR-NEUTRAL: table + RLS only, no engine yet).
--
-- One row per driver. Pure presence + live GPS heartbeat + the hidden global
-- token. The presence engine (go-online/offline/heartbeat RPCs, the dispatch
-- offer loop) lands in later PRs; this PR just establishes the schema.
--
-- Three runtime states are DERIVED by the API, not stored:
--   online  = is_online AND heartbeat fresh
--   grace   = NOT is_online AND now() < grace_expires_at   (keeps token, hidden from queues, no offers)
--   offline = otherwise / grace expired (token cleared)

create table if not exists public.driver_presence (
  driver_id         uuid primary key references public.drivers(id) on delete cascade,
  is_online         boolean not null default false,
  token             bigint,                                   -- nextval('driver_token_seq'); null when fully offline / grace-expired
  online_since      timestamptz,
  last_heartbeat_at timestamptz,
  current_lat       numeric(9,6),
  current_lng       numeric(9,6),
  current_city_id   uuid references public.cities(id),
  went_offline_at   timestamptz,
  grace_expires_at  timestamptz,
  vehicle_id        uuid references public.vehicles(id),
  busy_trip_id      uuid references public.trips(id),         -- non-null while on an accepted/in-progress trip
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Generated geography point for radius matching (mirror drivers.geog, migration 011).
alter table public.driver_presence
  add column if not exists geog geography(Point, 4326)
  generated always as (
    case when current_lat is not null and current_lng is not null
      then st_setsrid(st_makepoint(current_lng, current_lat), 4326)::geography end
  ) stored;

drop trigger if exists driver_presence_set_updated_at on public.driver_presence;
create trigger driver_presence_set_updated_at before update on public.driver_presence
  for each row execute function public.set_updated_at();

create index if not exists idx_presence_online_token on public.driver_presence (token) where is_online;
create index if not exists idx_presence_grace        on public.driver_presence (grace_expires_at) where grace_expires_at is not null;
create index if not exists idx_presence_geog         on public.driver_presence using gist (geog);
create index if not exists idx_presence_busy         on public.driver_presence (busy_trip_id) where busy_trip_id is not null;

alter table public.driver_presence enable row level security;
-- A driver (or admin) may READ their own presence. Other drivers never see raw
-- rows — aggregate "X of N nearby" is computed server-side in the edge fn.
-- WRITES are service-role only (the edge functions); the browser never touches
-- the DB directly (architecture rule #1).
drop policy if exists "presence owner/admin read" on public.driver_presence;
create policy "presence owner/admin read" on public.driver_presence
  for select to authenticated using (public.owns_driver(driver_id) or public.is_admin());

analyze public.driver_presence;
