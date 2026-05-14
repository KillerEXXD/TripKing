-- Migration 033 — Phase 4 of the two-step handshake: trip_invitations.
-- See docs/TRIP_ASSIGNMENT_WORKFLOW.md §7. Agent can invite specific drivers
-- to view a trip without making it private. Invited drivers see it on a new
-- "Invited" tab (filter: GET /trips?invited=me) with the agent's name + phone
-- pre-revealed. When they apply, the standard handshake kicks in and the
-- invitation row flips to 'applied'.
--
-- Mirrors public.vacancy_invitations (migration 023) — same shape, different
-- direction. Trigger keeps the invitation status in sync with the matching
-- trip_acceptances row.

set search_path = public, pg_catalog;

create table if not exists public.trip_invitations (
  id                  uuid primary key default gen_random_uuid(),
  trip_id             uuid not null references public.trips(id) on delete cascade,
  driver_id           uuid not null references public.drivers(id) on delete cascade,
  invited_by_user_id  uuid not null references public.users(id) on delete cascade,
  status              text not null default 'pending'
                        check (status in ('pending', 'applied', 'declined', 'withdrawn', 'expired')),
  declined_reason     text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (trip_id, driver_id)
);

create trigger trip_invitations_set_updated_at
  before update on public.trip_invitations
  for each row execute function public.set_updated_at();

create index if not exists idx_trip_inv_driver_status
  on public.trip_invitations (driver_id, status, created_at desc);
create index if not exists idx_trip_inv_trip
  on public.trip_invitations (trip_id);
create index if not exists idx_trip_inv_invited_by
  on public.trip_invitations (invited_by_user_id, created_at desc);

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table public.trip_invitations enable row level security;

-- Drivers see their own pending/applied invitations. Trip posters see all
-- invitations for trips they posted. Admin sees everything.
drop policy if exists trip_invitations_select on public.trip_invitations;
create policy trip_invitations_select on public.trip_invitations
  for select to public
  using (
       public.is_admin()
    or invited_by_user_id = auth.uid()
    or driver_id in (select id from public.drivers where user_id = auth.uid())
  );

-- All writes go through the edge function (service-role); no direct-from-client
-- inserts/updates. Keep an admin-only policy in case a script needs to fix data.
drop policy if exists trip_invitations_write on public.trip_invitations;
create policy trip_invitations_write on public.trip_invitations
  for all to public
  using (public.is_admin())
  with check (public.is_admin());

-- ── auto-flip invitation → 'applied' when the driver applies to the trip ──
create or replace function public.sync_trip_invitation_on_apply() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'applied' then
    update public.trip_invitations
       set status = 'applied'
     where trip_id = new.trip_id
       and driver_id = new.driver_id
       and status = 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists trip_invitations_sync_on_apply on public.trip_acceptances;
create trigger trip_invitations_sync_on_apply
  after insert or update of status on public.trip_acceptances
  for each row execute function public.sync_trip_invitation_on_apply();
