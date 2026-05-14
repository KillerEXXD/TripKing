-- TripKing — migration 024: bug-report tracker.
--
-- Adds:
--   * users.can_report_bugs flag (per-user gate; admins always allowed)
--   * bug_reports, bug_attachments, bug_comments
--   * bug-number sequence + BUG-001 trigger
--   * RLS (reporter sees own; admin sees all)
--   * notifications.type gains 'bug_resolved' & 'bug_reported'
--   * private storage bucket 'bug-attachments' + RLS

-- ── per-user gate ────────────────────────────────────────────────────────────
alter table public.users add column if not exists can_report_bugs boolean not null default false;

-- ── bug-number sequence + helper ─────────────────────────────────────────────
create sequence if not exists public.bug_number_seq start 1;
create or replace function public.next_bug_number()
returns text language sql volatile as $$
  select 'BUG-' || lpad(nextval('public.bug_number_seq')::text, 3, '0');
$$;

-- ── bug_reports ──────────────────────────────────────────────────────────────
create table if not exists public.bug_reports (
  id                    uuid primary key default gen_random_uuid(),
  bug_number            text not null unique,
  title                 text not null,
  description           text not null default '',
  steps_to_reproduce    text not null default '',
  expected              text not null default '',
  actual                text not null default '',
  priority              text not null default 'medium' check (priority in ('low','medium','high','critical')),
  category              text not null default 'other' check (category in (
                          'auth_otp','trip_post','trip_apply','kyc_docs','video_call',
                          'vehicle_eligibility','map_location','notification','ui','other'
                        )),
  status                text not null default 'open' check (status in (
                          'open','in_progress','needs_info','resolved','verified','reopened','closed'
                        )),
  reporter_id           uuid references public.users(id) on delete set null,
  reporter_role         text not null default '',
  reporter_phone        text not null default '',
  reporter_name         text not null default '',
  page_url              text not null default '',
  route                 text not null default '',
  browser_info          jsonb not null default '{}'::jsonb,
  app_version           text not null default '',
  console_logs          text not null default '',
  breadcrumbs           jsonb not null default '[]'::jsonb,
  context               jsonb not null default '{}'::jsonb,
  query_cache_snapshot  jsonb not null default '[]'::jsonb,
  sentry_replay_url     text,
  posthog_session_url   text,
  posthog_session_id    text,
  assigned_to           uuid references public.users(id) on delete set null,
  resolution_notes      text not null default '',
  resolved_at           timestamptz,
  resolved_by           uuid references public.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- assign BUG-NNN on insert
create or replace function public.set_bug_number()
returns trigger language plpgsql as $$
begin
  if new.bug_number is null or new.bug_number = '' then
    new.bug_number := public.next_bug_number();
  end if;
  return new;
end;
$$;
drop trigger if exists bug_reports_set_number on public.bug_reports;
create trigger bug_reports_set_number before insert on public.bug_reports
  for each row execute function public.set_bug_number();

drop trigger if exists bug_reports_set_updated_at on public.bug_reports;
create trigger bug_reports_set_updated_at before update on public.bug_reports
  for each row execute function public.set_updated_at();

create index if not exists idx_bug_reports_status_created on public.bug_reports (status, created_at desc);
create index if not exists idx_bug_reports_reporter on public.bug_reports (reporter_id, created_at desc);
create index if not exists idx_bug_reports_priority_status on public.bug_reports (priority, status);
create index if not exists idx_bug_reports_category on public.bug_reports (category);

-- ── bug_attachments ──────────────────────────────────────────────────────────
create table if not exists public.bug_attachments (
  id            uuid primary key default gen_random_uuid(),
  bug_id        uuid not null references public.bug_reports(id) on delete cascade,
  storage_path  text not null,
  file_name     text not null default '',
  file_size     integer not null default 0,
  content_type  text not null default '',
  uploaded_by   uuid references public.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists idx_bug_attachments_bug on public.bug_attachments (bug_id, created_at);

-- ── bug_comments ─────────────────────────────────────────────────────────────
create table if not exists public.bug_comments (
  id          uuid primary key default gen_random_uuid(),
  bug_id      uuid not null references public.bug_reports(id) on delete cascade,
  user_id     uuid references public.users(id) on delete set null,
  user_name   text not null default '',
  user_role   text not null default '',
  content     text not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_bug_comments_bug on public.bug_comments (bug_id, created_at);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.bug_reports enable row level security;
alter table public.bug_attachments enable row level security;
alter table public.bug_comments enable row level security;

drop policy if exists "bug_reports reporter or admin read" on public.bug_reports;
create policy "bug_reports reporter or admin read" on public.bug_reports for select to authenticated
  using (reporter_id = auth.uid() or public.is_admin());

drop policy if exists "bug_reports reporter insert" on public.bug_reports;
create policy "bug_reports reporter insert" on public.bug_reports for insert to authenticated
  with check (reporter_id = auth.uid() or public.is_admin());

drop policy if exists "bug_reports admin update" on public.bug_reports;
create policy "bug_reports admin update" on public.bug_reports for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "bug_reports admin delete" on public.bug_reports;
create policy "bug_reports admin delete" on public.bug_reports for delete to authenticated
  using (public.is_admin());

drop policy if exists "bug_attachments reporter or admin read" on public.bug_attachments;
create policy "bug_attachments reporter or admin read" on public.bug_attachments for select to authenticated
  using (public.is_admin() or exists (select 1 from public.bug_reports b where b.id = bug_id and b.reporter_id = auth.uid()));

drop policy if exists "bug_attachments reporter or admin write" on public.bug_attachments;
create policy "bug_attachments reporter or admin write" on public.bug_attachments for insert to authenticated
  with check (public.is_admin() or exists (select 1 from public.bug_reports b where b.id = bug_id and b.reporter_id = auth.uid()));

drop policy if exists "bug_comments reporter or admin read" on public.bug_comments;
create policy "bug_comments reporter or admin read" on public.bug_comments for select to authenticated
  using (public.is_admin() or exists (select 1 from public.bug_reports b where b.id = bug_id and b.reporter_id = auth.uid()));

drop policy if exists "bug_comments reporter or admin write" on public.bug_comments;
create policy "bug_comments reporter or admin write" on public.bug_comments for insert to authenticated
  with check (
    (public.is_admin() or exists (select 1 from public.bug_reports b where b.id = bug_id and b.reporter_id = auth.uid()))
    and (user_id = auth.uid() or public.is_admin())
  );

-- ── notifications.type — extend with bug events (preserve existing types) ────
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'alert_match',
  'kyc_status_change',
  'trip_assigned',
  'trip_cancelled',
  'trip_completed',
  'review_received',
  'account_status_change',
  'trip_invitation',
  'invitation_accepted',
  'invitation_declined',
  'bug_reported',
  'bug_resolved',
  'bug_commented'
));

-- ── storage bucket: bug-attachments (private, 10 MB cap) ─────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('bug-attachments', 'bug-attachments', false, 10485760,
   array['image/jpeg','image/png','image/webp','image/gif','application/pdf','text/plain','application/json'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Path layout: <bug_id>/<filename>. The first folder segment is the bug id; we
-- look up reporter_id on bug_reports to decide write access.
drop policy if exists "bug-attachments reporter or admin write" on storage.objects;
create policy "bug-attachments reporter or admin write" on storage.objects for all to authenticated
  using (
    bucket_id = 'bug-attachments'
    and (public.is_admin() or exists (
      select 1 from public.bug_reports b
      where b.id = public.storage_owner_uuid(name) and b.reporter_id = auth.uid()
    ))
  )
  with check (
    bucket_id = 'bug-attachments'
    and (public.is_admin() or exists (
      select 1 from public.bug_reports b
      where b.id = public.storage_owner_uuid(name) and b.reporter_id = auth.uid()
    ))
  );

analyze public.bug_reports;
analyze public.bug_attachments;
analyze public.bug_comments;
analyze public.users;
