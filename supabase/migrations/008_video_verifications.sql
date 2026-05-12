-- TripKing — migration 008: video-call KYC verification.
--   video_call_availability — admin-defined recurring weekly windows; the edge function
--     expands the next N days of these into concrete 15-min slots (minus already-booked ones).
--   video_verifications    — one row per scheduled call (driver OR manager); the admin
--     "Video Call Console" ticks the three gates (face match / documents / liveness) and
--     finalizes → on outcome='approved' the subject's kyc_status flips to 'approved'.
-- Conventions per migrations 001/002. (set_updated_at(), is_admin(), owns_driver() exist.)

-- ─────────────────────────────────────────────────────────────────────────────
-- owns_trip_manager(): RLS predicate (SECURITY DEFINER to avoid recursion), mirror of owns_driver()
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.owns_trip_manager(p_manager_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.trip_managers where id = p_manager_id and user_id = auth.uid());
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- video_call_availability  (admin reference data — recurring weekly windows)
-- ─────────────────────────────────────────────────────────────────────────────
create table public.video_call_availability (
  id            uuid primary key default gen_random_uuid(),
  weekday       integer not null check (weekday between 0 and 6),     -- 0=Sun … 6=Sat (JS Date#getDay)
  start_time    time not null,
  end_time      time not null check (end_time > start_time),
  slot_minutes  integer not null default 15 check (slot_minutes between 5 and 60),
  capacity      integer not null default 1 check (capacity >= 1),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.video_call_availability enable row level security;
create trigger video_call_availability_set_updated_at before update on public.video_call_availability for each row execute function public.set_updated_at();
create index idx_video_call_availability_weekday on public.video_call_availability (weekday, is_active);

create policy "video_call_availability read" on public.video_call_availability for select to authenticated using (true);
create policy "video_call_availability admin write" on public.video_call_availability for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- seed: Mon–Sat, 10:00–18:00 IST, 15-min slots, one at a time
insert into public.video_call_availability (weekday, start_time, end_time, slot_minutes, capacity)
values (1,'10:00','18:00',15,1),(2,'10:00','18:00',15,1),(3,'10:00','18:00',15,1),
       (4,'10:00','18:00',15,1),(5,'10:00','18:00',15,1),(6,'10:00','18:00',15,1);

-- ─────────────────────────────────────────────────────────────────────────────
-- video_verifications
-- ─────────────────────────────────────────────────────────────────────────────
create table public.video_verifications (
  id                    uuid primary key default gen_random_uuid(),
  driver_id             uuid references public.drivers(id) on delete cascade,
  manager_id            uuid references public.trip_managers(id) on delete cascade,
  status                text not null default 'scheduled'
                          check (status in ('scheduled','completed','failed','cancelled','no_show')),
  scheduled_at          timestamptz not null,
  slot_minutes          integer not null default 15,
  meeting_provider      text not null default 'jitsi',
  meeting_url           text not null default '',
  conducted_by          uuid references public.users(id) on delete set null,
  conducted_at          timestamptz,
  face_match_confirmed  boolean not null default false,
  documents_confirmed   boolean not null default false,
  liveness_check_passed boolean not null default false,
  outcome               text check (outcome in ('approved','rejected','resubmit_required')),
  notes                 text,
  recording_path        text,                                          -- object path in bucket 'video-recordings'
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint vv_exactly_one_subject check ((driver_id is not null) <> (manager_id is not null))
);
alter table public.video_verifications enable row level security;
create trigger video_verifications_set_updated_at before update on public.video_verifications for each row execute function public.set_updated_at();
create index idx_video_verifications_status_at on public.video_verifications (status, scheduled_at);
create index idx_video_verifications_driver on public.video_verifications (driver_id);
create index idx_video_verifications_manager on public.video_verifications (manager_id);
-- one live (scheduled) call per subject
create unique index uq_video_verifications_active_driver  on public.video_verifications (driver_id)  where status = 'scheduled' and driver_id  is not null;
create unique index uq_video_verifications_active_manager on public.video_verifications (manager_id) where status = 'scheduled' and manager_id is not null;

create or replace function public.owns_video_verification(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.video_verifications v
    where v.id = p_id and (public.owns_driver(v.driver_id) or public.owns_trip_manager(v.manager_id))
  );
$$;

create policy "video_verifications read" on public.video_verifications for select to authenticated
  using (public.owns_driver(driver_id) or public.owns_trip_manager(manager_id) or conducted_by = auth.uid() or public.is_admin());
create policy "video_verifications owner insert" on public.video_verifications for insert to authenticated
  with check (public.owns_driver(driver_id) or public.owns_trip_manager(manager_id));
create policy "video_verifications owner/admin update" on public.video_verifications for update to authenticated
  using (public.owns_video_verification(id) or public.is_admin())
  with check (public.owns_video_verification(id) or public.is_admin());

analyze public.video_call_availability;
analyze public.video_verifications;
