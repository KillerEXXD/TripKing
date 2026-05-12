-- TripKing — migration 003: vacancies (+ destinations), alerts, reviews, notifications.
-- Conventions per migrations 001/002. (set_updated_at(), is_admin(), owns_driver() exist already.)

-- ─────────────────────────────────────────────────────────────────────────────
-- vacancies  ("I'm available in city X, willing to go to one of these cities")
-- ─────────────────────────────────────────────────────────────────────────────
create table public.vacancies (
  id                uuid primary key default gen_random_uuid(),
  driver_id         uuid not null references public.drivers(id) on delete cascade,
  vehicle_id        uuid references public.vehicles(id),
  current_city_id   uuid not null references public.cities(id),
  available_from    timestamptz not null default now(),
  available_until   timestamptz,
  min_rate_per_km   numeric(10,2),
  notes             text,
  status            text not null default 'active' check (status in ('active','matched','expired','cancelled')),
  cancelled_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
alter table public.vacancies enable row level security;
create trigger vacancies_set_updated_at before update on public.vacancies for each row execute function public.set_updated_at();
create index idx_vacancies_city_status on public.vacancies (current_city_id, status);
create index idx_vacancies_driver on public.vacancies (driver_id, status);

create table public.vacancy_destinations (
  vacancy_id  uuid not null references public.vacancies(id) on delete cascade,
  city_id     uuid not null references public.cities(id),
  primary key (vacancy_id, city_id)
);
alter table public.vacancy_destinations enable row level security;
create index idx_vacancy_destinations_city on public.vacancy_destinations (city_id);

-- vacancies — readable by all (agents browse); owning driver or admin writes
create policy "vacancies read" on public.vacancies for select to authenticated using (true);
create policy "vacancies owner insert" on public.vacancies for insert to authenticated with check (public.owns_driver(driver_id));
create policy "vacancies owner/admin update" on public.vacancies for update to authenticated using (public.owns_driver(driver_id) or public.is_admin()) with check (public.owns_driver(driver_id) or public.is_admin());
create policy "vacancies owner/admin delete" on public.vacancies for delete to authenticated using (public.owns_driver(driver_id) or public.is_admin());
create policy "vacancy_destinations read" on public.vacancy_destinations for select to authenticated using (true);
create policy "vacancy_destinations owner write" on public.vacancy_destinations for all to authenticated
  using (exists (select 1 from public.vacancies v where v.id = vacancy_id and (public.owns_driver(v.driver_id) or public.is_admin())))
  with check (exists (select 1 from public.vacancies v where v.id = vacancy_id and (public.owns_driver(v.driver_id) or public.is_admin())));

-- ─────────────────────────────────────────────────────────────────────────────
-- alerts  (saved searches that notify on a match)
-- ─────────────────────────────────────────────────────────────────────────────
create table public.alerts (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.users(id) on delete cascade,
  name                 text not null default '',
  from_city_id         uuid not null references public.cities(id),
  from_radius_km       integer not null default 25,
  to_city_id           uuid references public.cities(id),
  to_radius_km         integer,
  min_rate_per_km      numeric(10,2),
  min_commission_pct   numeric(5,2),
  car_type_ids         uuid[] not null default '{}',          -- references car_types (no FK on arrays)
  pickup_window_start  timestamptz,
  pickup_window_end    timestamptz,
  notify_via           text[] not null default '{in_app}' check (notify_via <@ array['push','sms','email','in_app']),
  is_active            boolean not null default true,
  paused_at            timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
alter table public.alerts enable row level security;
create trigger alerts_set_updated_at before update on public.alerts for each row execute function public.set_updated_at();
create index idx_alerts_user on public.alerts (user_id, is_active);

-- alerts — own rows only (+ admin read)
create policy "alerts owner read" on public.alerts for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "alerts owner insert" on public.alerts for insert to authenticated with check (user_id = auth.uid());
create policy "alerts owner update" on public.alerts for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "alerts owner delete" on public.alerts for delete to authenticated using (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- reviews  (passenger→driver, manager→driver, driver→manager)
-- ─────────────────────────────────────────────────────────────────────────────
create table public.reviews (
  id              uuid primary key default gen_random_uuid(),
  trip_id         uuid not null references public.trips(id) on delete cascade,
  rater_user_id   uuid references public.users(id) on delete set null,   -- null for anonymous passenger reviews
  rater_role      text not null default 'passenger' check (rater_role in ('driver','trip_manager','admin','passenger')),
  ratee_user_id   uuid references public.users(id) on delete cascade,
  direction       text not null check (direction in ('passenger_to_driver','manager_to_driver','driver_to_manager')),
  score           integer not null check (score between 1 and 5),
  comment         text not null default '',
  tag_ids         uuid[] not null default '{}',                          -- references review_tags
  is_published    boolean not null default true,
  is_flagged      boolean not null default false,
  flag_reason     text,
  moderated_by    uuid references public.users(id) on delete set null,
  moderated_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (trip_id, direction)
);
alter table public.reviews enable row level security;
create trigger reviews_set_updated_at before update on public.reviews for each row execute function public.set_updated_at();
create index idx_reviews_trip on public.reviews (trip_id);
create index idx_reviews_ratee on public.reviews (ratee_user_id);

-- reviews — published readable by all; parties see their own; rater inserts (anon passenger reviews come via an edge function with service role); admin moderates
create policy "reviews read" on public.reviews for select to authenticated
  using (is_published or rater_user_id = auth.uid() or ratee_user_id = auth.uid() or public.is_admin());
create policy "reviews rater insert" on public.reviews for insert to authenticated with check (rater_user_id = auth.uid());
create policy "reviews admin update" on public.reviews for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "reviews admin delete" on public.reviews for delete to authenticated using (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- notifications  (log of fired alerts + system messages; inserts via triggers / edge functions)
-- ─────────────────────────────────────────────────────────────────────────────
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  type        text not null check (type in ('alert_match','kyc_status_change','trip_assigned','trip_cancelled','trip_completed','review_received')),
  title       text not null default '',
  body        text not null default '',
  payload_json jsonb not null default '{}',
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);
alter table public.notifications enable row level security;
create index idx_notifications_user on public.notifications (user_id, is_read);

-- notifications — own rows (read + mark-read)
create policy "notifications owner read" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "notifications owner update" on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

analyze;
