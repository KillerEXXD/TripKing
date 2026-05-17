-- 056_design_preview_allowlist.sql
--
-- Admin-managed allowlist of phone numbers that can see the in-app
-- "Design previews" tile. Lets the operator collect design feedback
-- from teammates / select beta users WITHOUT shipping the previews
-- to the whole user base.
--
-- Driven by:
--   - /admin/design-preview-allowlist endpoints (generic admin LIST handler)
--   - Admin UI in /administration/config under a new "Design preview allowlist" section
--   - /auth/me stamps user.feature_flags.design_previews = true when the user's
--     phone is in this table with is_active = true
--   - HomeTileRow renders a 4th "Design previews" tile conditionally on that flag

create table if not exists public.design_preview_allowlist (
  id          uuid        primary key default gen_random_uuid(),
  phone       text        not null unique,
  note        text,                       -- free-form: name of the person, why they're on the list
  is_active   boolean     not null default true,
  sort_order  int         not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.design_preview_allowlist is
  'Admin-managed phone allowlist for the in-app Design Previews tile. Auth /me checks this table and stamps user.feature_flags.design_previews.';

create index if not exists idx_design_preview_allowlist_phone_active
  on public.design_preview_allowlist (phone) where is_active;

-- The standard updated_at trigger pattern from the rest of the schema (see 001_reference_data.sql).
drop trigger if exists design_preview_allowlist_set_updated_at on public.design_preview_allowlist;
create trigger design_preview_allowlist_set_updated_at
  before update on public.design_preview_allowlist
  for each row execute function public.set_updated_at();

-- RLS: admin-only writes (mirrors every other admin master-data table);
-- SELECT is restricted to admins too — the table contains personal phone numbers,
-- shouldn't leak to non-admin users. The /auth/me check runs as the service role
-- so it bypasses RLS.
alter table public.design_preview_allowlist enable row level security;

create policy "Admins can SELECT design_preview_allowlist"
  on public.design_preview_allowlist for select
  using (
    exists (select 1 from public.users where users.id = auth.uid() and users.role = 'admin')
  );

create policy "Admins can INSERT design_preview_allowlist"
  on public.design_preview_allowlist for insert
  with check (
    exists (select 1 from public.users where users.id = auth.uid() and users.role = 'admin')
  );

create policy "Admins can UPDATE design_preview_allowlist"
  on public.design_preview_allowlist for update
  using (
    exists (select 1 from public.users where users.id = auth.uid() and users.role = 'admin')
  );

create policy "Admins can DELETE design_preview_allowlist"
  on public.design_preview_allowlist for delete
  using (
    exists (select 1 from public.users where users.id = auth.uid() and users.role = 'admin')
  );
