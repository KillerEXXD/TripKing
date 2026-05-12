-- TripKing — migration 001: reference / master-data tables (the Administration subject).
-- Conventions (CLAUDE.md §"Database"): TEXT + CHECK (never native ENUM); uuid PKs
-- (except natural codes); created_at/updated_at + update trigger; soft-disable
-- (is_active) never hard-delete; RLS on every table.
--
-- RLS posture for migration 001: every table is RLS-enabled with a public SELECT
-- policy (anon + authenticated read all rows; the /admin and public REST endpoints
-- filter is_active themselves). There are NO write policies yet — mutations go
-- through the /admin/* edge functions with the service-role key. Admin-role-scoped
-- write policies land with the migration that creates public.users.

-- ── one-time cleanup ────────────────────────────────────────────────────────
-- This Supabase project was provisioned with an earlier prototype schema (a full
-- set of marketplace tables). The production build is rebuilt from migration 001
-- onward, so drop that schema here. (No real data — it only carried seed rows.)
drop trigger if exists on_auth_user_created on auth.users;
drop table if exists
  public.kyc_submissions, public.notifications, public.reviews, public.alerts,
  public.vacancy_destinations, public.vacancies, public.trip_executions, public.trip_acceptances,
  public.trips, public.vehicles, public.trip_managers, public.drivers, public.profiles,
  public.app_settings, public.cities
  cascade;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.is_admin() cascade;
drop function if exists public.owns_driver(uuid) cascade;
drop function if exists public.owns_trip(uuid) cascade;
drop function if exists public.is_assigned_driver(uuid) cascade;

-- ── extensions & helpers ────────────────────────────────────────────────────
create extension if not exists pg_trgm;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

-- Convenience: declare a standard lookup table (uuid id, label, sort_order, is_active, timestamps).
-- (Written out per-table below rather than via a macro, for clarity.)

-- ── car_types ───────────────────────────────────────────────────────────────
create table public.car_types (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.car_types enable row level security;
create policy "car_types public read" on public.car_types for select to anon, authenticated using (true);
create trigger car_types_set_updated_at before update on public.car_types for each row execute function public.set_updated_at();
create index idx_car_types_active_order on public.car_types (is_active, sort_order);
create unique index uq_car_types_label on public.car_types (lower(label));

-- ── fuel_types ──────────────────────────────────────────────────────────────
create table public.fuel_types (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.fuel_types enable row level security;
create policy "fuel_types public read" on public.fuel_types for select to anon, authenticated using (true);
create trigger fuel_types_set_updated_at before update on public.fuel_types for each row execute function public.set_updated_at();
create index idx_fuel_types_active_order on public.fuel_types (is_active, sort_order);
create unique index uq_fuel_types_label on public.fuel_types (lower(label));

-- ── vehicle_makes ───────────────────────────────────────────────────────────
create table public.vehicle_makes (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.vehicle_makes enable row level security;
create policy "vehicle_makes public read" on public.vehicle_makes for select to anon, authenticated using (true);
create trigger vehicle_makes_set_updated_at before update on public.vehicle_makes for each row execute function public.set_updated_at();
create index idx_vehicle_makes_active_order on public.vehicle_makes (is_active, sort_order);
create unique index uq_vehicle_makes_name on public.vehicle_makes (lower(name));

-- ── vehicle_models (belong to a make; may pre-fill car type & seats) ────────
create table public.vehicle_models (
  id                    uuid primary key default gen_random_uuid(),
  make_id               uuid not null references public.vehicle_makes(id) on delete restrict,
  name                  text not null,
  default_car_type_id   uuid references public.car_types(id) on delete set null,
  default_seats         integer,
  sort_order            integer not null default 0,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (make_id, name)
);
alter table public.vehicle_models enable row level security;
create policy "vehicle_models public read" on public.vehicle_models for select to anon, authenticated using (true);
create trigger vehicle_models_set_updated_at before update on public.vehicle_models for each row execute function public.set_updated_at();
create index idx_vehicle_models_make on public.vehicle_models (make_id, is_active, sort_order);
create index idx_vehicle_models_name_trgm on public.vehicle_models using gin (name gin_trgm_ops);

-- ── seat_options (natural key) ──────────────────────────────────────────────
create table public.seat_options (
  value       integer primary key,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table public.seat_options enable row level security;
create policy "seat_options public read" on public.seat_options for select to anon, authenticated using (true);

-- ── cities (service area — lat/lng mandatory for radius matching) ───────────
create table public.cities (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  state       text not null,
  lat         numeric(9,6) not null,
  lng         numeric(9,6) not null,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.cities enable row level security;
create policy "cities public read" on public.cities for select to anon, authenticated using (true);
create trigger cities_set_updated_at before update on public.cities for each row execute function public.set_updated_at();
create index idx_cities_active_order on public.cities (is_active, sort_order);
create index idx_cities_name_trgm on public.cities using gin (name gin_trgm_ops);
create unique index uq_cities_name_state on public.cities (lower(name), lower(state));

-- ── languages (natural BCP-47 short code) ───────────────────────────────────
create table public.languages (
  code           text primary key,
  native_name    text not null,
  english_name   text not null,
  display_order  integer not null default 0,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table public.languages enable row level security;
create policy "languages public read" on public.languages for select to anon, authenticated using (true);
create trigger languages_set_updated_at before update on public.languages for each row execute function public.set_updated_at();

-- ── review_tags (one table, three vocabularies) ─────────────────────────────
create table public.review_tags (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  category    text not null check (category in ('passenger_to_driver','manager_to_driver','driver_to_manager')),
  sentiment   text not null default 'positive' check (sentiment in ('positive','neutral','negative')),
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.review_tags enable row level security;
create policy "review_tags public read" on public.review_tags for select to anon, authenticated using (true);
create trigger review_tags_set_updated_at before update on public.review_tags for each row execute function public.set_updated_at();
create index idx_review_tags_category on public.review_tags (category, is_active, sort_order);
create unique index uq_review_tags_category_label on public.review_tags (category, lower(label));

-- ── cancel_reasons ──────────────────────────────────────────────────────────
create table public.cancel_reasons (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  applies_to  text not null check (applies_to in ('agent','driver','both')),
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.cancel_reasons enable row level security;
create policy "cancel_reasons public read" on public.cancel_reasons for select to anon, authenticated using (true);
create trigger cancel_reasons_set_updated_at before update on public.cancel_reasons for each row execute function public.set_updated_at();
create index idx_cancel_reasons_applies on public.cancel_reasons (applies_to, is_active, sort_order);

-- ── app_settings (single-row config) ────────────────────────────────────────
-- default_gst_pct is a PERCENTAGE (decided per §7.5 row 16).
create table public.app_settings (
  id                              smallint primary key default 1 check (id = 1),
  min_vehicle_year                integer not null default 2015,
  vehicle_expiry_warning_days     integer not null default 90,
  default_alert_radius_km         integer not null default 25,
  default_commission_pct          numeric(5,2) not null default 10,
  default_gst_pct                 numeric(5,2) not null default 5,
  default_driver_bata             numeric(10,2) not null default 300,
  default_extras_paid_by_passenger boolean not null default true,
  default_driver_instructions     text not null default
    '1. Call the customer before arrival' || E'\n' ||
    '2. Reach the pickup point 10 minutes early' || E'\n' ||
    '3. Follow the Google Maps route',
  updated_at                      timestamptz not null default now()
);
alter table public.app_settings enable row level security;
create policy "app_settings public read" on public.app_settings for select to anon, authenticated using (true);
create trigger app_settings_set_updated_at before update on public.app_settings for each row execute function public.set_updated_at();

-- ── admin_audit_log (every /admin mutation appends a row) ───────────────────
-- actor_user_id is a plain uuid for now; FK → public.users added with that table.
create table public.admin_audit_log (
  id              uuid primary key default gen_random_uuid(),
  actor_user_id   uuid,
  action          text not null,                 -- e.g. 'create' | 'update' | 'reorder' | 'disable'
  entity          text not null,                 -- e.g. 'car_types' | 'cities' | 'app_settings'
  entity_id       text,
  before_json     jsonb,
  after_json      jsonb,
  created_at      timestamptz not null default now()
);
alter table public.admin_audit_log enable row level security;
-- No public policy — the audit log is admin-only; readable via service role / a future
-- admin-role SELECT policy when public.users exists.
create index idx_admin_audit_log_entity on public.admin_audit_log (entity, created_at desc);
create index idx_admin_audit_log_actor on public.admin_audit_log (actor_user_id, created_at desc);

-- ════════════════════════════════════════════════════════════════════════════
-- SEED (the prototype's hard-coded unions/defaults, per §7)
-- ════════════════════════════════════════════════════════════════════════════

insert into public.car_types (label, sort_order) values
  ('Hatchback', 10), ('Sedan', 20), ('SUV', 30), ('Innova', 40), ('Tempo Traveller', 50), ('Mini Bus', 60);

insert into public.fuel_types (label, sort_order) values
  ('Petrol', 10), ('Diesel', 20), ('CNG', 30), ('EV', 40), ('LPG (Indane)', 50);

insert into public.vehicle_makes (name, sort_order) values
  ('Maruti Suzuki', 10), ('Hyundai', 20), ('Tata', 30), ('Toyota', 40), ('Mahindra', 50),
  ('Honda', 60), ('Kia', 70), ('Renault', 80), ('MG', 90), ('Ford', 100);

-- vehicle_models — looked up by make name + car type label so the FKs resolve.
insert into public.vehicle_models (make_id, name, default_car_type_id, default_seats, sort_order)
select mk.id, m.name, ct.id, m.seats, m.ord
from (values
  -- make,            model,            car_type,          seats, ord
  ('Maruti Suzuki', 'Swift',          'Hatchback',        4,  10),
  ('Maruti Suzuki', 'Dzire',          'Sedan',            4,  20),
  ('Maruti Suzuki', 'Wagon R',        'Hatchback',        4,  30),
  ('Maruti Suzuki', 'Baleno',         'Hatchback',        4,  40),
  ('Maruti Suzuki', 'Ertiga',         'SUV',              7,  50),
  ('Maruti Suzuki', 'Eeco',           'Tempo Traveller',  7,  60),
  ('Hyundai',       'Aura',           'Sedan',            4,  10),
  ('Hyundai',       'Xcent',          'Sedan',            4,  20),
  ('Hyundai',       'i20',            'Hatchback',        4,  30),
  ('Hyundai',       'Verna',          'Sedan',            4,  40),
  ('Hyundai',       'Creta',          'SUV',              5,  50),
  ('Tata',          'Tiago',          'Hatchback',        4,  10),
  ('Tata',          'Tigor',          'Sedan',            4,  20),
  ('Tata',          'Nexon',          'SUV',              5,  30),
  ('Toyota',        'Etios',          'Sedan',            4,  10),
  ('Toyota',        'Glanza',         'Hatchback',        4,  20),
  ('Toyota',        'Innova Crysta',  'Innova',           7,  30),
  ('Toyota',        'Innova Hycross', 'Innova',           7,  40),
  ('Mahindra',      'Bolero',         'SUV',              7,  10),
  ('Mahindra',      'Marazzo',        'Innova',           7,  20),
  ('Mahindra',      'Scorpio',        'SUV',              7,  30),
  ('Mahindra',      'XUV500',         'SUV',              7,  40),
  ('Honda',         'Amaze',          'Sedan',            4,  10),
  ('Honda',         'City',           'Sedan',            4,  20),
  ('Kia',           'Carens',         'SUV',              7,  10),
  ('Kia',           'Sonet',          'SUV',              5,  20),
  ('Renault',       'Kwid',           'Hatchback',        4,  10),
  ('Renault',       'Triber',         'SUV',              7,  20),
  ('MG',            'Hector',         'SUV',              5,  10),
  ('Ford',          'Aspire',         'Sedan',            4,  10),
  ('Ford',          'Figo',           'Hatchback',        4,  20)
) as m(make, name, car_type, seats, ord)
join public.vehicle_makes mk on lower(mk.name) = lower(m.make)
left join public.car_types ct on lower(ct.label) = lower(m.car_type);

insert into public.seat_options (value) values (4), (5), (6), (7), (8), (9), (12), (15);

insert into public.cities (name, state, lat, lng, sort_order) values
  ('Vellore',      'Tamil Nadu',      12.916500, 79.132500, 10),
  ('Chennai',      'Tamil Nadu',      13.082700, 80.270700, 20),
  ('Pondicherry',  'Puducherry',      11.941600, 79.808300, 30),
  ('Bangalore',    'Karnataka',       12.971600, 77.594600, 40),
  ('Tirupati',     'Andhra Pradesh',  13.628800, 79.419200, 50),
  ('Salem',        'Tamil Nadu',      11.664300, 78.146000, 60),
  ('Coimbatore',   'Tamil Nadu',      11.016800, 76.955800, 70),
  ('Madurai',      'Tamil Nadu',       9.925200, 78.119800, 80),
  ('Tiruchirappalli','Tamil Nadu',    10.790500, 78.704700, 90),
  ('Hosur',        'Tamil Nadu',      12.740900, 77.825300, 100);

insert into public.languages (code, native_name, english_name, display_order) values
  ('en', 'English',  'English', 10),
  ('ta', 'தமிழ்',     'Tamil',   20),
  ('hi', 'हिन्दी',    'Hindi',   30);

insert into public.review_tags (label, category, sentiment, sort_order) values
  -- passenger → driver
  ('Punctual',          'passenger_to_driver', 'positive', 10),
  ('Clean car',         'passenger_to_driver', 'positive', 20),
  ('Polite',            'passenger_to_driver', 'positive', 30),
  ('Safe driver',       'passenger_to_driver', 'positive', 40),
  ('Knew the route',    'passenger_to_driver', 'positive', 50),
  ('Late',              'passenger_to_driver', 'negative', 60),
  ('Rude',              'passenger_to_driver', 'negative', 70),
  ('Reckless',          'passenger_to_driver', 'negative', 80),
  -- agent (trip manager) → driver
  ('Punctual',          'manager_to_driver',   'positive', 10),
  ('No no-shows',       'manager_to_driver',   'positive', 20),
  ('Reachable',         'manager_to_driver',   'positive', 30),
  ('Reliable',          'manager_to_driver',   'positive', 40),
  ('Professional',      'manager_to_driver',   'positive', 50),
  ('Cancelled',         'manager_to_driver',   'negative', 60),
  ('Unreachable',       'manager_to_driver',   'negative', 70),
  -- driver → agent (trip manager)
  ('Pays on time',      'driver_to_manager',   'positive', 10),
  ('Clear instructions','driver_to_manager',   'positive', 20),
  ('Fair bata',         'driver_to_manager',   'positive', 30),
  ('Easy to reach',     'driver_to_manager',   'positive', 40),
  ('Late payment',      'driver_to_manager',   'negative', 50),
  ('Vague details',     'driver_to_manager',   'negative', 60);

insert into public.cancel_reasons (label, applies_to, sort_order) values
  ('Passenger cancelled',     'agent',  10),
  ('Trip no longer needed',   'agent',  20),
  ('No suitable applicants',  'agent',  30),
  ('Posted by mistake',       'agent',  40),
  ('Vehicle breakdown',       'driver', 10),
  ('Personal emergency',      'driver', 20),
  ('Double-booked',           'driver', 30),
  ('Weather / road closure',  'both',   10),
  ('Fare dispute',            'both',   20);

insert into public.app_settings (id) values (1);

analyze;
