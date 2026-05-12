-- TripKing — migration 011: maps-backed locations (Phase B of the locations epic).
-- A `places` table (provider-geocoded points + a PostGIS geography), nullable `*_place_id`
-- FKs alongside the existing `*_city_id` columns (both kept — the curated cities list stays),
-- and a generated `geog` on drivers for the later "drivers within N km" filters (Phase D).
-- Apply with: node scripts/db.cjs --file supabase/migrations/011_places.sql

create extension if not exists postgis;

-- ── places ──────────────────────────────────────────────────────────────────
create table public.places (
  id                 uuid primary key default gen_random_uuid(),
  provider           text not null,                         -- 'locationiq' | 'geoapify' | 'nominatim' | 'google' | …
  provider_place_id  text,                                  -- the provider's stable id (null for ad-hoc points)
  name               text not null,
  formatted_address  text,
  state              text,
  country            text not null default 'IN',
  lat                numeric(9,6) not null,
  lng                numeric(9,6) not null,
  geog               geography(Point,4326) generated always as (st_setsrid(st_makepoint(lng, lat), 4326)::geography) stored,
  city_id            uuid references public.cities(id),     -- optional link to the curated city list
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create trigger places_set_updated_at before update on public.places for each row execute function public.set_updated_at();
create unique index places_provider_uniq on public.places (provider, provider_place_id) where provider_place_id is not null;
create index places_geog_gix on public.places using gist (geog);
create index idx_places_active on public.places (is_active);

-- RLS — same shape as the other lookup tables: anon (API-key) reads active rows; any authed
-- user can INSERT (the find-or-create path); admins can do everything (incl. read inactive).
alter table public.places enable row level security;
create policy "places public read"   on public.places for select to anon, authenticated using (is_active);
create policy "places authed insert"  on public.places for insert to authenticated with check (true);
create policy "places admin write"    on public.places for all    to authenticated using (public.is_admin()) with check (public.is_admin());
grant select on public.places to anon, authenticated;
grant insert, update, delete on public.places to authenticated;

-- ── place_id FKs alongside the existing *_city_id columns (keep BOTH) ───────
alter table public.vacancies            add column current_place_id  uuid references public.places(id);
alter table public.vacancy_destinations add column place_id          uuid references public.places(id);
alter table public.trips                add column from_place_id     uuid references public.places(id);
alter table public.trips                add column to_place_id       uuid references public.places(id);
alter table public.alerts               add column from_place_id     uuid references public.places(id);
alter table public.alerts               add column to_place_id       uuid references public.places(id);
alter table public.drivers              add column current_place_id  uuid references public.places(id);
alter table public.drivers              add column home_place_id     uuid references public.places(id);

-- ── drivers.geog (generated from current_lat/current_lng) — for "drivers within N km" (Phase D) ──
alter table public.drivers add column geog geography(Point,4326)
  generated always as (case when current_lat is not null and current_lng is not null
    then st_setsrid(st_makepoint(current_lng, current_lat), 4326)::geography end) stored;
create index drivers_geog_gix on public.drivers using gist (geog);

analyze public.places;
analyze public.drivers;
