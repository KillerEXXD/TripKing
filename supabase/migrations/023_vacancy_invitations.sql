-- TripKing — migration 023: vacancy_invitations (agent → driver invite from a vacancy).
--
-- Vacancies ("I'm available") have no apply mechanism today, so they're a dead-end
-- for the PII gate — an agent who sees a useful vacancy has no platform action to
-- prove commitment. This migration adds the invite flow:
--
--   * public.vacancy_invitations  — one row per invite. status:
--       pending   → driver hasn't responded yet
--       accepted  → driver agreed; the edge function also inserts a
--                   trip_acceptances(status='applied') row, which is the PII reveal gate
--       declined  → driver said no
--       expired   → never answered before expires_at (or the trip closed)
--
-- Enforcement lives in the new vacancy-invitations edge function (this migration
-- only provides the table + indexes + RLS).

set search_path = public, pg_catalog;

create table if not exists public.vacancy_invitations (
  id                  uuid primary key default gen_random_uuid(),
  vacancy_id          uuid not null references public.vacancies(id) on delete cascade,
  trip_id             uuid not null references public.trips(id) on delete cascade,
  invited_by_user_id  uuid not null references public.users(id) on delete cascade,
  driver_id           uuid not null references public.drivers(id) on delete cascade,
  status              text not null default 'pending'
                        check (status in ('pending','accepted','declined','expired')),
  message             text,
  expires_at          timestamptz not null default (now() + interval '48 hours'),
  decided_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (vacancy_id, trip_id)
);

create trigger vacancy_invitations_set_updated_at
  before update on public.vacancy_invitations
  for each row execute function public.set_updated_at();

create index if not exists idx_vac_inv_driver_status
  on public.vacancy_invitations (driver_id, status, created_at desc);
create index if not exists idx_vac_inv_invited_by
  on public.vacancy_invitations (invited_by_user_id, created_at desc);
create index if not exists idx_vac_inv_trip
  on public.vacancy_invitations (trip_id);

alter table public.vacancy_invitations enable row level security;

-- driver can read/respond to their own invites; agent can read invites they sent;
-- admin sees everything. Writes go through the edge function (service-role).
drop policy if exists vac_inv_read_own on public.vacancy_invitations;
create policy vac_inv_read_own on public.vacancy_invitations
  for select using (
    public.is_admin()
    or invited_by_user_id = auth.uid()
    or driver_id in (select id from public.drivers where user_id = auth.uid())
  );

-- notifications.type gains 'trip_invitation' (sent to the driver when an invite is created)
-- and 'invitation_accepted' / 'invitation_declined' (sent to the agent on driver response).
-- Preserves the 7 types from migration 017.
alter table public.notifications
  drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check check (type in (
    'alert_match',
    'kyc_status_change',
    'trip_assigned',
    'trip_cancelled',
    'trip_completed',
    'review_received',
    'account_status_change',
    'trip_invitation',
    'invitation_accepted',
    'invitation_declined'
  ));
