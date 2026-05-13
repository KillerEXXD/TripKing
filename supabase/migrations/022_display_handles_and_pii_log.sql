-- TripKing — migration 022: stable anonymous handles + PII access audit.
--
-- Anti-disintermediation: name/phone/email/photo of drivers and agents are gated
-- behind a platform action (apply / invite-accept). Pre-reveal, both sides see a
-- stable opaque handle (e.g. "A3E5A6E") plus trust signals. This migration adds:
--
--   * public.users.display_handle  — text, unique, populated on insert by trigger.
--                                    Format: 'A' + 6 upper-case hex chars (drawn
--                                    from gen_random_bytes(3)), e.g. "A3E5A6E". Stable
--                                    per-user across sessions so a viewer can
--                                    mentally track "this is the same person" without
--                                    learning identity. Backfilled for existing rows.
--   * public.pii_access_log        — one row per PII reveal in a GET response (viewer,
--                                    target, surface, optional trip_id, created_at).
--                                    Indexed on (viewer_user_id, created_at) so the
--                                    upcoming admin dashboard can ask "how many reveals
--                                    this month for agent X?" cheaply. RLS: admin-only.
--   * public.can_reveal_driver / can_reveal_agent — SQL predicates used by the
--                                    _shared/pii.ts helper to decide per (viewer,
--                                    target) whether PII should be present in the
--                                    response. Self / admin / mutual-trip / past-apply
--                                    all unlock.
--
-- Enforcement of redaction lives in the edge functions — this migration only
-- provides the columns / trigger / audit table / predicate functions.

set search_path = public, extensions, pg_catalog;

-- ── display_handle column + trigger ─────────────────────────────────────────
alter table public.users
  add column if not exists display_handle text unique;

create or replace function public.gen_display_handle()
returns text language sql volatile set search_path = public, extensions, pg_catalog as $$
  select 'A' || upper(encode(extensions.gen_random_bytes(3), 'hex'));
$$;

create or replace function public.users_set_display_handle()
returns trigger language plpgsql as $$
declare
  candidate text;
  attempt   integer := 0;
begin
  if new.display_handle is not null and new.display_handle <> '' then
    return new;
  end if;
  loop
    candidate := public.gen_display_handle();
    exit when not exists (select 1 from public.users where display_handle = candidate);
    attempt := attempt + 1;
    if attempt > 8 then
      raise exception 'failed to allocate unique display_handle after % attempts', attempt;
    end if;
  end loop;
  new.display_handle := candidate;
  return new;
end
$$;

drop trigger if exists users_assign_display_handle on public.users;
create trigger users_assign_display_handle
  before insert on public.users
  for each row execute function public.users_set_display_handle();

-- backfill any existing rows that don't have a handle yet
do $$
declare
  r record;
  candidate text;
begin
  for r in select id from public.users where display_handle is null loop
    loop
      candidate := public.gen_display_handle();
      exit when not exists (select 1 from public.users where display_handle = candidate);
    end loop;
    update public.users set display_handle = candidate where id = r.id;
  end loop;
end
$$;

alter table public.users
  alter column display_handle set not null;

-- ── pii_access_log ──────────────────────────────────────────────────────────
create table if not exists public.pii_access_log (
  id              uuid primary key default gen_random_uuid(),
  viewer_user_id  uuid not null references public.users(id) on delete cascade,
  target_user_id  uuid not null references public.users(id) on delete cascade,
  surface         text not null check (length(surface) between 1 and 64),
  trip_id         uuid references public.trips(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_pii_access_log_viewer
  on public.pii_access_log (viewer_user_id, created_at desc);
create index if not exists idx_pii_access_log_target
  on public.pii_access_log (target_user_id, created_at desc);

alter table public.pii_access_log enable row level security;

drop policy if exists pii_access_log_admin_read on public.pii_access_log;
create policy pii_access_log_admin_read on public.pii_access_log
  for select using (public.is_admin());

-- writes happen through the service-role key in edge functions (bypasses RLS);
-- no client-facing INSERT policy is intentional.

-- ── reveal predicates (used by _shared/pii.ts) ──────────────────────────────
-- True when the viewer should see the driver's PII. Rules:
--   * self                          → reveal
--   * viewer is an admin            → reveal
--   * viewer is the agent of a trip this driver has any acceptance row against
--   * viewer's trip is assigned/in_progress/completed to this driver
-- Otherwise: hide.

create or replace function public.can_reveal_driver(p_viewer uuid, p_driver_user uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p_viewer is null or p_driver_user is null then false
    when p_viewer = p_driver_user then true
    when exists (select 1 from public.users where id = p_viewer and role = 'admin') then true
    when exists (
      select 1
      from public.trip_acceptances ta
      join public.drivers d on d.id = ta.driver_id and d.user_id = p_driver_user
      join public.trips    t on t.id = ta.trip_id   and t.posted_by_user_id = p_viewer
    ) then true
    when exists (
      select 1
      from public.trips t
      join public.drivers d on d.id = t.assigned_driver_id and d.user_id = p_driver_user
      where t.posted_by_user_id = p_viewer
        and t.status in ('assigned','in_progress','completed')
    ) then true
    else false
  end;
$$;

-- Symmetric: true when the viewer (typically a driver) should see the agent's PII.
create or replace function public.can_reveal_agent(p_viewer uuid, p_agent_user uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p_viewer is null or p_agent_user is null then false
    when p_viewer = p_agent_user then true
    when exists (select 1 from public.users where id = p_viewer and role = 'admin') then true
    when exists (
      select 1
      from public.trip_acceptances ta
      join public.drivers d on d.id = ta.driver_id and d.user_id = p_viewer
      join public.trips    t on t.id = ta.trip_id   and t.posted_by_user_id = p_agent_user
    ) then true
    else false
  end;
$$;

grant execute on function public.can_reveal_driver(uuid, uuid) to authenticated, service_role;
grant execute on function public.can_reveal_agent (uuid, uuid) to authenticated, service_role;
