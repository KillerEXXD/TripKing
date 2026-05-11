-- Trip King — initial schema
-- Conventions (mirroring the TournamentPro/hudr stack):
--   • TEXT + CHECK constraints, never enums
--   • uuid primary keys, gen_random_uuid()
--   • RLS enabled on every table, with explicit policies
--   • updated_at maintained by trigger
--   • foreign keys + indexes on every fk and common filter column

-- ─────────────────────────────────────────────────────────────────────────────
-- helpers
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- cities (public reference data)
-- ─────────────────────────────────────────────────────────────────────────────
create table public.cities (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  state       text not null,
  lat         double precision not null,
  lng         double precision not null,
  created_at  timestamptz not null default now()
);
alter table public.cities enable row level security;
create index idx_cities_name on public.cities (lower(name));

-- ─────────────────────────────────────────────────────────────────────────────
-- profiles (1:1 with auth.users)
-- ─────────────────────────────────────────────────────────────────────────────
create table public.profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  role                text not null default 'driver' check (role in ('driver','trip_manager','admin')),
  phone               text not null default '',
  email               text,
  display_name        text not null default '',
  preferred_language  text not null default 'en' check (preferred_language in ('en','ta','hi')),
  is_active           boolean not null default true,
  onboarded_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
alter table public.profiles enable row level security;
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- is_admin() — SECURITY DEFINER so it can read profiles without tripping RLS recursion
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- create a profiles row whenever a new auth user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, phone, display_name)
  values (new.id, coalesce(new.phone, ''), coalesce(new.raw_user_meta_data->>'display_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────────
-- drivers
-- ─────────────────────────────────────────────────────────────────────────────
create table public.drivers (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null unique references public.profiles(id) on delete cascade,
  full_name             text not null default '',
  phone                 text not null default '',
  email                 text,
  home_city_id          uuid references public.cities(id),
  current_city_id       uuid references public.cities(id),
  profile_photo_url     text not null default '',
  kyc_status            text not null default 'pending'
                          check (kyc_status in ('pending','docs_submitted','video_pending','approved','rejected','resubmit_required')),
  rating_avg            numeric(3,2) not null default 0,
  rating_count          integer not null default 0,
  rating_dist           jsonb not null default '{"1":0,"2":0,"3":0,"4":0,"5":0}',
  top_tags              text[] not null default '{}',
  total_trips_completed integer not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
alter table public.drivers enable row level security;
create trigger drivers_set_updated_at before update on public.drivers
  for each row execute function public.set_updated_at();
create index idx_drivers_user on public.drivers (user_id);
create index idx_drivers_current_city on public.drivers (current_city_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- trip_managers
-- ─────────────────────────────────────────────────────────────────────────────
create table public.trip_managers (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null unique references public.profiles(id) on delete cascade,
  full_name           text not null default '',
  phone               text not null default '',
  email               text,
  business_name       text,
  business_city_id    uuid references public.cities(id),
  profile_photo_url   text not null default '',
  kyc_status          text not null default 'pending'
                        check (kyc_status in ('pending','docs_submitted','video_pending','approved','rejected','resubmit_required')),
  total_trips_posted  integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
alter table public.trip_managers enable row level security;
create trigger trip_managers_set_updated_at before update on public.trip_managers
  for each row execute function public.set_updated_at();
create index idx_trip_managers_user on public.trip_managers (user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- vehicles
-- ─────────────────────────────────────────────────────────────────────────────
create table public.vehicles (
  id                   uuid primary key default gen_random_uuid(),
  driver_id            uuid not null references public.drivers(id) on delete cascade,
  make                 text not null default '',
  model                text not null default '',
  year                 integer not null,
  retirement_year      integer not null,
  eligibility_status   text not null default 'eligible' check (eligibility_status in ('eligible','expiring_soon','expired')),
  registration_number  text not null default '',
  car_type             text not null check (car_type in ('Hatchback','Sedan','SUV','Innova','Tempo Traveller','Mini Bus')),
  seats                integer not null default 4,
  ac                   boolean not null default true,
  fuel_type            text not null default 'Petrol' check (fuel_type in ('Petrol','Diesel','CNG','EV')),
  photo_front_url      text not null default '',
  photo_back_url       text not null default '',
  photo_left_url       text not null default '',
  photo_right_url      text not null default '',
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
create trigger vehicles_set_updated_at before update on public.vehicles
  for each row execute function public.set_updated_at();
create index idx_vehicles_driver on public.vehicles (driver_id);

-- driver-ownership helper (does the given driver belong to the current user?)
create or replace function public.owns_driver(p_driver_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.drivers where id = p_driver_id and user_id = auth.uid());
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- trips
-- ─────────────────────────────────────────────────────────────────────────────
create table public.trips (
  id                       uuid primary key default gen_random_uuid(),
  posted_by_user_id        uuid not null references public.profiles(id) on delete cascade,
  posted_by_role           text not null default 'trip_manager' check (posted_by_role in ('driver','trip_manager')),
  posted_by_name           text not null default '',
  posted_by_phone          text,
  from_city_id             uuid not null references public.cities(id),
  to_city_id               uuid not null references public.cities(id),
  pickup_at                timestamptz not null,
  expected_distance_km     integer not null,
  car_type_required        text not null check (car_type_required in ('Hatchback','Sedan','SUV','Innova','Tempo Traveller','Mini Bus')),
  seats_required           integer not null default 4,
  ac_required              boolean not null default true,
  rate_per_km              numeric not null,
  total_fare               numeric not null,
  commission_pct           numeric not null default 10,
  gst_amount               numeric not null default 0,
  driver_bata              numeric not null default 300,
  extras_paid_by_passenger boolean not null default true,
  driver_instructions      text,
  driver_payout            numeric not null,
  passenger_name           text not null default '',
  passenger_phone          text not null default '',
  passenger_count          integer not null default 1,
  luggage_notes            text,
  special_requests         text,
  status                   text not null default 'open'
                             check (status in ('open','has_applicants','assigned','in_progress','completed','cancelled')),
  assigned_driver_id       uuid references public.drivers(id),
  assigned_vehicle_id      uuid references public.vehicles(id),
  assigned_acceptance_id   uuid,                              -- denormalized; fk added after trip_acceptances exists
  passenger_otp            text,
  show_fare_to_passenger   boolean not null default true,
  hide_passenger_phone     boolean not null default false,
  cancelled_at             timestamptz,
  cancel_reason            text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
alter table public.trips enable row level security;
create trigger trips_set_updated_at before update on public.trips
  for each row execute function public.set_updated_at();
create index idx_trips_status on public.trips (status);
create index idx_trips_from_city on public.trips (from_city_id);
create index idx_trips_to_city on public.trips (to_city_id);
create index idx_trips_posted_by on public.trips (posted_by_user_id);
create index idx_trips_assigned_driver on public.trips (assigned_driver_id);
create index idx_trips_pickup_at on public.trips (pickup_at);

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
-- trip_acceptances (a driver applying to a trip)
-- ─────────────────────────────────────────────────────────────────────────────
create table public.trip_acceptances (
  id                         uuid primary key default gen_random_uuid(),
  trip_id                    uuid not null references public.trips(id) on delete cascade,
  driver_id                  uuid not null references public.drivers(id) on delete cascade,
  vehicle_id                 uuid references public.vehicles(id),
  status                     text not null default 'applied' check (status in ('applied','selected','rejected','withdrawn','expired')),
  applicant_message          text,
  applicant_quoted_rate_per_km numeric,
  applied_at                 timestamptz not null default now(),
  decision_at                timestamptz,
  decision_note              text,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  unique (trip_id, driver_id)
);
alter table public.trip_acceptances enable row level security;
create trigger trip_acceptances_set_updated_at before update on public.trip_acceptances
  for each row execute function public.set_updated_at();
create index idx_trip_acceptances_trip on public.trip_acceptances (trip_id);
create index idx_trip_acceptances_driver on public.trip_acceptances (driver_id);
alter table public.trips
  add constraint trips_assigned_acceptance_fk
  foreign key (assigned_acceptance_id) references public.trip_acceptances(id) on delete set null;

-- ─────────────────────────────────────────────────────────────────────────────
-- trip_executions (start/complete + odometer photos + driver notes)
-- ─────────────────────────────────────────────────────────────────────────────
create table public.trip_executions (
  id                     uuid primary key default gen_random_uuid(),
  trip_id                uuid not null unique references public.trips(id) on delete cascade,
  started_at             timestamptz,
  completed_at           timestamptz,
  start_odo_url          text,
  start_odo_at           timestamptz,
  start_odo_reading      integer,
  end_odo_url            text,
  end_odo_at             timestamptz,
  end_odo_reading        integer,
  driver_notes           text,
  driver_cancelled_at    timestamptz,
  driver_cancel_reason   text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
alter table public.trip_executions enable row level security;
create trigger trip_executions_set_updated_at before update on public.trip_executions
  for each row execute function public.set_updated_at();
create index idx_trip_executions_trip on public.trip_executions (trip_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- vacancies (a driver advertising availability) + destination junction
-- ─────────────────────────────────────────────────────────────────────────────
create table public.vacancies (
  id                uuid primary key default gen_random_uuid(),
  driver_id         uuid not null references public.drivers(id) on delete cascade,
  vehicle_id        uuid references public.vehicles(id),
  current_city_id   uuid not null references public.cities(id),
  available_from    timestamptz not null default now(),
  available_until   timestamptz,
  min_rate_per_km   numeric,
  notes             text,
  status            text not null default 'active' check (status in ('active','matched','expired','cancelled')),
  cancelled_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
alter table public.vacancies enable row level security;
create trigger vacancies_set_updated_at before update on public.vacancies
  for each row execute function public.set_updated_at();
create index idx_vacancies_driver on public.vacancies (driver_id);
create index idx_vacancies_current_city on public.vacancies (current_city_id);
create index idx_vacancies_status on public.vacancies (status);

create table public.vacancy_destinations (
  vacancy_id  uuid not null references public.vacancies(id) on delete cascade,
  city_id     uuid not null references public.cities(id),
  primary key (vacancy_id, city_id)
);
alter table public.vacancy_destinations enable row level security;
create index idx_vacancy_destinations_city on public.vacancy_destinations (city_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- alerts (saved searches that notify on a match)
-- ─────────────────────────────────────────────────────────────────────────────
create table public.alerts (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.profiles(id) on delete cascade,
  name                 text not null default '',
  from_city_id         uuid not null references public.cities(id),
  from_radius_km       integer not null default 25,
  to_city_id           uuid references public.cities(id),
  to_radius_km         integer,
  min_rate_per_km      numeric,
  min_commission_pct   numeric,
  car_types            text[] not null default '{}',
  pickup_window_start  timestamptz,
  pickup_window_end    timestamptz,
  notify_via           text[] not null default '{in_app}',
  is_active            boolean not null default true,
  paused_at            timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
alter table public.alerts enable row level security;
create trigger alerts_set_updated_at before update on public.alerts
  for each row execute function public.set_updated_at();
create index idx_alerts_user on public.alerts (user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- reviews (manager↔driver + passenger→driver)
-- ─────────────────────────────────────────────────────────────────────────────
create table public.reviews (
  id              uuid primary key default gen_random_uuid(),
  trip_id         uuid not null references public.trips(id) on delete cascade,
  rater_user_id   uuid references public.profiles(id) on delete set null,  -- null for anonymous passenger reviews
  rater_role      text not null default 'passenger' check (rater_role in ('driver','trip_manager','admin','passenger')),
  ratee_user_id   uuid references public.profiles(id) on delete cascade,
  direction       text not null check (direction in ('manager_to_driver','driver_to_manager','passenger_to_driver')),
  score           integer not null check (score between 1 and 5),
  comment         text not null default '',
  tags            text[] not null default '{}',
  is_published    boolean not null default true,
  is_flagged      boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (trip_id, direction)
);
alter table public.reviews enable row level security;
create trigger reviews_set_updated_at before update on public.reviews
  for each row execute function public.set_updated_at();
create index idx_reviews_trip on public.reviews (trip_id);
create index idx_reviews_ratee on public.reviews (ratee_user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- notifications
-- ─────────────────────────────────────────────────────────────────────────────
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  type        text not null check (type in ('alert_match','kyc_status_change','trip_assigned','trip_cancelled','trip_completed','review_received')),
  title       text not null default '',
  body        text not null default '',
  payload     jsonb not null default '{}',
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);
alter table public.notifications enable row level security;
create index idx_notifications_user on public.notifications (user_id, is_read);

-- ─────────────────────────────────────────────────────────────────────────────
-- kyc_submissions
-- ─────────────────────────────────────────────────────────────────────────────
create table public.kyc_submissions (
  id                       uuid primary key default gen_random_uuid(),
  subject_user_id          uuid not null references public.profiles(id) on delete cascade,
  subject_role             text not null check (subject_role in ('driver','trip_manager')),
  status                   text not null default 'pending'
                             check (status in ('pending','docs_submitted','video_pending','approved','rejected','resubmit_required')),
  aadhaar_last4            text,
  voter_id_last4           text,
  license_last4            text,
  doc_urls                 jsonb not null default '{}',
  video_call_scheduled_at  timestamptz,
  video_call_at            timestamptz,
  reviewer_user_id         uuid references public.profiles(id) on delete set null,
  review_note              text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
alter table public.kyc_submissions enable row level security;
create trigger kyc_submissions_set_updated_at before update on public.kyc_submissions
  for each row execute function public.set_updated_at();
create index idx_kyc_submissions_subject on public.kyc_submissions (subject_user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- app_settings (singleton)
-- ─────────────────────────────────────────────────────────────────────────────
create table public.app_settings (
  id                          smallint primary key default 1 check (id = 1),
  min_vehicle_year            integer not null default 2014,
  vehicle_expiry_warning_days integer not null default 30,
  default_alert_radius_km     integer not null default 25,
  default_commission_pct      numeric not null default 10,
  default_gst_pct             numeric not null default 5,
  updated_at                  timestamptz not null default now()
);
alter table public.app_settings enable row level security;
create trigger app_settings_set_updated_at before update on public.app_settings
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS policies
-- ─────────────────────────────────────────────────────────────────────────────

-- cities, app_settings — public reference data: everyone reads, admin writes
create policy "cities read" on public.cities for select to authenticated using (true);
create policy "cities admin write" on public.cities for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "app_settings read" on public.app_settings for select to authenticated using (true);
create policy "app_settings admin write" on public.app_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- profiles — anyone authenticated can read (marketplace shows poster names); self/admin can update
create policy "profiles read" on public.profiles for select to authenticated using (true);
create policy "profiles self insert" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "profiles self/admin update" on public.profiles for update to authenticated using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

-- drivers / trip_managers — public profiles (marketplace); owner or admin writes
create policy "drivers read" on public.drivers for select to authenticated using (true);
create policy "drivers owner insert" on public.drivers for insert to authenticated with check (user_id = auth.uid());
create policy "drivers owner/admin update" on public.drivers for update to authenticated using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());

create policy "trip_managers read" on public.trip_managers for select to authenticated using (true);
create policy "trip_managers owner insert" on public.trip_managers for insert to authenticated with check (user_id = auth.uid());
create policy "trip_managers owner/admin update" on public.trip_managers for update to authenticated using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());

-- vehicles — readable by all (managers see a driver's car); owning driver or admin writes
create policy "vehicles read" on public.vehicles for select to authenticated using (true);
create policy "vehicles owner insert" on public.vehicles for insert to authenticated with check (public.owns_driver(driver_id));
create policy "vehicles owner/admin update" on public.vehicles for update to authenticated using (public.owns_driver(driver_id) or public.is_admin()) with check (public.owns_driver(driver_id) or public.is_admin());

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

-- vacancies — readable by all (managers browse); owning driver or admin writes
create policy "vacancies read" on public.vacancies for select to authenticated using (true);
create policy "vacancies owner insert" on public.vacancies for insert to authenticated with check (public.owns_driver(driver_id));
create policy "vacancies owner/admin update" on public.vacancies for update to authenticated using (public.owns_driver(driver_id) or public.is_admin()) with check (public.owns_driver(driver_id) or public.is_admin());
create policy "vacancy_destinations read" on public.vacancy_destinations for select to authenticated using (true);
create policy "vacancy_destinations owner write" on public.vacancy_destinations for all to authenticated
  using (exists (select 1 from public.vacancies v where v.id = vacancy_id and (public.owns_driver(v.driver_id) or public.is_admin())))
  with check (exists (select 1 from public.vacancies v where v.id = vacancy_id and (public.owns_driver(v.driver_id) or public.is_admin())));

-- alerts — own rows only (+ admin read)
create policy "alerts owner read" on public.alerts for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "alerts owner insert" on public.alerts for insert to authenticated with check (user_id = auth.uid());
create policy "alerts owner update" on public.alerts for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "alerts owner delete" on public.alerts for delete to authenticated using (user_id = auth.uid());

-- reviews — published reviews readable by all; parties see their own; rater inserts; admin moderates
create policy "reviews read" on public.reviews for select to authenticated
  using (is_published or rater_user_id = auth.uid() or ratee_user_id = auth.uid() or public.is_admin());
create policy "reviews rater insert" on public.reviews for insert to authenticated
  with check (rater_user_id = auth.uid() or rater_user_id is null);
create policy "reviews admin update" on public.reviews for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "reviews admin delete" on public.reviews for delete to authenticated using (public.is_admin());

-- notifications — own rows
create policy "notifications owner read" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "notifications owner update" on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- kyc_submissions — subject sees their own; admin sees all and reviews
create policy "kyc subject/admin read" on public.kyc_submissions for select to authenticated using (subject_user_id = auth.uid() or public.is_admin());
create policy "kyc subject insert" on public.kyc_submissions for insert to authenticated with check (subject_user_id = auth.uid());
create policy "kyc subject/admin update" on public.kyc_submissions for update to authenticated using (subject_user_id = auth.uid() or public.is_admin()) with check (subject_user_id = auth.uid() or public.is_admin());
