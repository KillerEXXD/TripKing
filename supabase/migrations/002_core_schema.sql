-- TripKing — migration 002: core entity schema (users, drivers, trip managers, vehicles,
-- the trip lifecycle: trips / trip_acceptances / trip_executions). Vacancies, alerts,
-- reviews and notifications follow in migration 003.
-- Conventions per migration 001 + CLAUDE.md §"Database": TEXT+CHECK (never ENUM); uuid PKs;
-- created_at/updated_at + update trigger on every mutable table; RLS on every table with
-- SECURITY DEFINER helpers for predicates; vehicle eligibility is DERIVED (year vs
-- app_settings.min_vehicle_year), never stored; trips.driver_payout and trips.applicant_count
-- are denormalised and maintained by triggers (no client-side math).
-- (set_updated_at() and pg_trgm already exist from migration 001.)

-- ─────────────────────────────────────────────────────────────────────────────
-- users  (1:1 with auth.users)
-- ─────────────────────────────────────────────────────────────────────────────
create table public.users (
  id                  uuid primary key references auth.users(id) on delete cascade,
  role                text not null default 'driver' check (role in ('driver','trip_manager','admin')),
  phone               text not null default '',
  email               text,
  display_name        text not null default '',
  preferred_language  text not null default 'en' references public.languages(code) on update cascade,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
alter table public.users enable row level security;
create trigger users_set_updated_at before update on public.users for each row execute function public.set_updated_at();
create index idx_users_role on public.users (role);

-- admin predicate — SECURITY DEFINER so RLS policies referencing it don't recurse
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users where id = auth.uid() and role = 'admin');
$$;

-- create a public.users row whenever a new auth user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, phone, display_name, role)
  values (new.id, coalesce(new.phone, ''), coalesce(new.raw_user_meta_data->>'display_name',''), coalesce(new.raw_user_meta_data->>'role','driver'))
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────────
-- drivers
-- ─────────────────────────────────────────────────────────────────────────────
create table public.drivers (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null unique references public.users(id) on delete cascade,
  full_name             text not null default '',
  phone                 text not null default '',
  email                 text,
  home_city_id          uuid references public.cities(id),
  current_city_id       uuid references public.cities(id),
  current_lat           numeric(9,6),
  current_lng           numeric(9,6),
  current_location_at   timestamptz,
  profile_photo_url     text not null default '',
  kyc_status            text not null default 'pending'
                          check (kyc_status in ('pending','docs_submitted','video_pending','approved','rejected','resubmit_required')),
  rating_avg            numeric(3,2) not null default 0,
  rating_count          integer not null default 0,
  rating_distribution   jsonb not null default '{"1":0,"2":0,"3":0,"4":0,"5":0}',
  top_tags              text[] not null default '{}',          -- top positive passenger→driver tags
  manager_top_tags      text[] not null default '{}',          -- top positive agent→driver tags
  total_trips_completed integer not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
alter table public.drivers enable row level security;
create trigger drivers_set_updated_at before update on public.drivers for each row execute function public.set_updated_at();
create index idx_drivers_user on public.drivers (user_id);
create index idx_drivers_current_city on public.drivers (current_city_id);
create index idx_drivers_name_trgm on public.drivers using gin (full_name gin_trgm_ops);

create or replace function public.owns_driver(p_driver_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.drivers where id = p_driver_id and user_id = auth.uid());
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- trip_managers (a.k.a. agents)
-- ─────────────────────────────────────────────────────────────────────────────
create table public.trip_managers (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null unique references public.users(id) on delete cascade,
  full_name           text not null default '',
  phone               text not null default '',
  email               text,
  business_name       text,
  business_city_id    uuid references public.cities(id),
  profile_photo_url   text not null default '',
  kyc_status          text not null default 'pending'
                        check (kyc_status in ('pending','docs_submitted','video_pending','approved','rejected','resubmit_required')),
  top_tags            text[] not null default '{}',            -- top positive driver→agent tags
  total_trips_posted  integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
alter table public.trip_managers enable row level security;
create trigger trip_managers_set_updated_at before update on public.trip_managers for each row execute function public.set_updated_at();
create index idx_trip_managers_user on public.trip_managers (user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- vehicles  (FK lookups: make/model/car_type/fuel_type → migration-001 tables)
-- eligibility_status is DERIVED (year vs app_settings.min_vehicle_year), not stored.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.vehicles (
  id                   uuid primary key default gen_random_uuid(),
  driver_id            uuid not null references public.drivers(id) on delete cascade,
  make_id              uuid references public.vehicle_makes(id),
  model_id             uuid references public.vehicle_models(id),
  year                 integer not null,
  car_type_id          uuid not null references public.car_types(id),
  seats                integer not null default 4,
  ac                   boolean not null default true,
  fuel_type_id         uuid references public.fuel_types(id),
  registration_number  text not null default '',
  photo_front_url      text not null default '',
  photo_back_url       text not null default '',
  photo_left_url       text not null default '',
  photo_right_url      text not null default '',
  photo_interior_url   text,
  rc_book_url          text not null default '',
  insurance_url        text not null default '',
  insurance_expiry     date,
  permit_url           text,
  permit_expiry        date,
  is_primary           boolean not null default false,
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
alter table public.vehicles enable row level security;
create trigger vehicles_set_updated_at before update on public.vehicles for each row execute function public.set_updated_at();
create index idx_vehicles_driver on public.vehicles (driver_id);
create index idx_vehicles_make on public.vehicles (make_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- trips
-- ─────────────────────────────────────────────────────────────────────────────
create table public.trips (
  id                       uuid primary key default gen_random_uuid(),
  posted_by_user_id        uuid not null references public.users(id) on delete cascade,
  posted_by_role           text not null default 'trip_manager' check (posted_by_role in ('driver','trip_manager')),
  posted_by_name           text not null default '',
  posted_by_phone          text,
  from_city_id             uuid not null references public.cities(id),
  to_city_id               uuid not null references public.cities(id),
  pickup_at                timestamptz not null,
  expected_distance_km     numeric(8,1) not null,
  car_type_id              uuid not null references public.car_types(id),
  seats_required           integer not null default 4,
  ac_required              boolean not null default true,
  rate_per_km              numeric(10,2) not null,
  total_fare               numeric(12,2) not null,
  commission_pct           numeric(5,2) not null default 10,
  gst_amount               numeric(12,2) not null default 0,         -- flat ₹ amount
  driver_bata              numeric(10,2) not null default 300,
  extras_paid_by_passenger boolean not null default true,
  driver_instructions      text,
  driver_payout            numeric(12,2) not null default 0,         -- derived by trigger; never set by the client
  passenger_name           text not null default '',
  passenger_phone          text not null default '',
  passenger_count          integer not null default 1,
  luggage_notes            text,
  special_requests         text,
  status                   text not null default 'open'
                             check (status in ('open','has_applicants','assigned','in_progress','completed','cancelled')),
  assigned_driver_id       uuid references public.drivers(id),
  assigned_vehicle_id      uuid references public.vehicles(id),
  assigned_acceptance_id   uuid,                                     -- denormalised; FK added after trip_acceptances exists
  assigned_at              timestamptz,
  passenger_otp_hash       text,
  show_fare_to_passenger   boolean not null default true,
  hide_passenger_phone     boolean not null default false,
  cancelled_at             timestamptz,
  cancel_reason_id         uuid references public.cancel_reasons(id),
  applicant_count          integer not null default 0,               -- denormalised; maintained by a trigger on trip_acceptances
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
alter table public.trips enable row level security;
create trigger trips_set_updated_at before update on public.trips for each row execute function public.set_updated_at();
create index idx_trips_status_pickup on public.trips (status, pickup_at);
create index idx_trips_from_city on public.trips (from_city_id);
create index idx_trips_to_city on public.trips (to_city_id);
create index idx_trips_posted_by on public.trips (posted_by_user_id);
create index idx_trips_assigned_driver on public.trips (assigned_driver_id);
create index idx_trips_car_type on public.trips (car_type_id);

-- driver payout is purely a function of the other columns — compute it server-side, always.
create or replace function public.compute_trip_payout()
returns trigger language plpgsql as $$
begin
  new.driver_payout := round(
    coalesce(new.total_fare,0)
    - coalesce(new.total_fare,0) * coalesce(new.commission_pct,0) / 100.0
    - coalesce(new.gst_amount,0)
    + coalesce(new.driver_bata,0), 2);
  return new;
end;
$$;
create trigger trips_compute_payout before insert or update of total_fare, commission_pct, gst_amount, driver_bata on public.trips
  for each row execute function public.compute_trip_payout();

create or replace function public.owns_trip(p_trip_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.trips where id = p_trip_id and posted_by_user_id = auth.uid());
$$;

create or replace function public.is_assigned_driver(p_trip_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.trips t join public.drivers d on d.id = t.assigned_driver_id
    where t.id = p_trip_id and d.user_id = auth.uid()
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- trip_acceptances  (a driver applying to a trip; one active row per (trip, driver))
-- ─────────────────────────────────────────────────────────────────────────────
create table public.trip_acceptances (
  id                            uuid primary key default gen_random_uuid(),
  trip_id                       uuid not null references public.trips(id) on delete cascade,
  driver_id                     uuid not null references public.drivers(id) on delete cascade,
  vehicle_id                    uuid references public.vehicles(id),
  status                        text not null default 'applied' check (status in ('applied','selected','rejected','withdrawn','expired')),
  applicant_message             text,
  applicant_quoted_rate_per_km  numeric(10,2),
  applied_at                    timestamptz not null default now(),
  decision_at                   timestamptz,
  decision_note                 text,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  unique (trip_id, driver_id)
);
alter table public.trip_acceptances enable row level security;
create trigger trip_acceptances_set_updated_at before update on public.trip_acceptances for each row execute function public.set_updated_at();
create index idx_trip_acceptances_trip on public.trip_acceptances (trip_id, status);
create index idx_trip_acceptances_driver on public.trip_acceptances (driver_id, status);
alter table public.trips add constraint trips_assigned_acceptance_fk
  foreign key (assigned_acceptance_id) references public.trip_acceptances(id) on delete set null;

-- keep trips.applicant_count = count of trip_acceptances with status='applied'
create or replace function public.refresh_trip_applicant_count()
returns trigger language plpgsql as $$
declare v_trip uuid;
begin
  v_trip := coalesce(new.trip_id, old.trip_id);
  update public.trips
    set applicant_count = (select count(*) from public.trip_acceptances where trip_id = v_trip and status = 'applied')
    where id = v_trip;
  return null;
end;
$$;
create trigger trip_acceptances_count_aiud after insert or update or delete on public.trip_acceptances
  for each row execute function public.refresh_trip_applicant_count();

-- ─────────────────────────────────────────────────────────────────────────────
-- trip_executions  (start/complete + odometer captures + driver notes)
-- ─────────────────────────────────────────────────────────────────────────────
create table public.trip_executions (
  trip_id              uuid primary key references public.trips(id) on delete cascade,
  started_at           timestamptz,
  completed_at         timestamptz,
  start_odo_url        text,
  start_odo_reading    integer,
  start_odo_at         timestamptz,
  end_odo_url          text,
  end_odo_reading      integer,
  end_odo_at           timestamptz,
  actual_distance_km   numeric(8,1) generated always as (
    case when end_odo_reading is not null and start_odo_reading is not null then end_odo_reading - start_odo_reading end
  ) stored,
  driver_notes         text,
  cancelled_at         timestamptz,
  cancel_reason_id     uuid references public.cancel_reasons(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
alter table public.trip_executions enable row level security;
create trigger trip_executions_set_updated_at before update on public.trip_executions for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS policies
-- ─────────────────────────────────────────────────────────────────────────────

-- users — anyone authenticated can read (marketplace shows poster/driver names); self/admin update; self insert
create policy "users read" on public.users for select to authenticated using (true);
create policy "users self insert" on public.users for insert to authenticated with check (id = auth.uid());
create policy "users self/admin update" on public.users for update to authenticated using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

-- drivers / trip_managers — public profiles in the marketplace; owner or admin writes
create policy "drivers read" on public.drivers for select to authenticated using (true);
create policy "drivers owner insert" on public.drivers for insert to authenticated with check (user_id = auth.uid());
create policy "drivers owner/admin update" on public.drivers for update to authenticated using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());

create policy "trip_managers read" on public.trip_managers for select to authenticated using (true);
create policy "trip_managers owner insert" on public.trip_managers for insert to authenticated with check (user_id = auth.uid());
create policy "trip_managers owner/admin update" on public.trip_managers for update to authenticated using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());

-- vehicles — readable by all (agents see a driver's car); owning driver or admin writes
create policy "vehicles read" on public.vehicles for select to authenticated using (true);
create policy "vehicles owner insert" on public.vehicles for insert to authenticated with check (public.owns_driver(driver_id));
create policy "vehicles owner/admin update" on public.vehicles for update to authenticated using (public.owns_driver(driver_id) or public.is_admin()) with check (public.owns_driver(driver_id) or public.is_admin());
create policy "vehicles owner/admin delete" on public.vehicles for delete to authenticated using (public.owns_driver(driver_id) or public.is_admin());

-- trips — readable by all; poster inserts; poster, assigned driver, or admin updates
create policy "trips read" on public.trips for select to authenticated using (true);
create policy "trips poster insert" on public.trips for insert to authenticated with check (posted_by_user_id = auth.uid());
create policy "trips poster/driver/admin update" on public.trips for update to authenticated
  using (posted_by_user_id = auth.uid() or public.is_assigned_driver(id) or public.is_admin())
  with check (posted_by_user_id = auth.uid() or public.is_assigned_driver(id) or public.is_admin());

-- trip_acceptances — visible to the applying driver, the trip poster, or admin
create policy "acceptances read" on public.trip_acceptances for select to authenticated
  using (public.owns_driver(driver_id) or public.owns_trip(trip_id) or public.is_admin());
create policy "acceptances driver insert" on public.trip_acceptances for insert to authenticated with check (public.owns_driver(driver_id));
create policy "acceptances driver/poster/admin update" on public.trip_acceptances for update to authenticated
  using (public.owns_driver(driver_id) or public.owns_trip(trip_id) or public.is_admin())
  with check (public.owns_driver(driver_id) or public.owns_trip(trip_id) or public.is_admin());

-- trip_executions — assigned driver, trip poster, or admin
create policy "executions read" on public.trip_executions for select to authenticated
  using (public.is_assigned_driver(trip_id) or public.owns_trip(trip_id) or public.is_admin());
create policy "executions driver insert" on public.trip_executions for insert to authenticated
  with check (public.is_assigned_driver(trip_id) or public.is_admin());
create policy "executions driver/admin update" on public.trip_executions for update to authenticated
  using (public.is_assigned_driver(trip_id) or public.is_admin())
  with check (public.is_assigned_driver(trip_id) or public.is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- deferred admin-write RLS on the migration-001 lookup tables (now that is_admin() exists)
-- ─────────────────────────────────────────────────────────────────────────────
create policy "car_types admin write" on public.car_types for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "fuel_types admin write" on public.fuel_types for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "vehicle_makes admin write" on public.vehicle_makes for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "vehicle_models admin write" on public.vehicle_models for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "seat_options admin write" on public.seat_options for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "cities admin write" on public.cities for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "languages admin write" on public.languages for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "review_tags admin write" on public.review_tags for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "cancel_reasons admin write" on public.cancel_reasons for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "app_settings admin write" on public.app_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- admin_audit_log — readable by admins only
create policy "admin_audit_log admin read" on public.admin_audit_log for select to authenticated using (public.is_admin());

analyze;
