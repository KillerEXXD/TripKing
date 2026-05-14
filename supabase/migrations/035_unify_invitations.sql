-- Migration 034 — unify invitations into trip_invitations + add radius gate.
--
-- Background: we had two parallel invite flows — `vacancy_invitations` (agent
-- pings a driver's "I'm available" post; migration 023) and `trip_invitations`
-- (agent invites drivers to a specific trip; migration 033). Both already
-- required a trip, so they are the SAME product concept ("agent invites driver
-- to a trip") wearing two table hats. Per the platform owner's decision,
-- there is no "ping without a trip" feature, so `trip_invitations` is the
-- single source of truth.
--
-- This migration:
--   1. adds `app_settings.invite_max_radius_km` (default 15) — the trip's
--      pickup must be within this many km of the driver's vacancy city
--      when the invite originates from a vacancy entry point.
--   2. backfills pending vacancy_invitations into trip_invitations.
--   3. drops the vacancy_invitations table (CASCADE — its trigger / indexes
--      / RLS / FKs go with it).

set search_path = public, pg_catalog;

-- ── 1. invite_max_radius_km on app_settings ────────────────────────────────
alter table public.app_settings
  add column if not exists invite_max_radius_km int not null default 15
    check (invite_max_radius_km between 1 and 200);

comment on column public.app_settings.invite_max_radius_km is
  'When an agent invites a driver from the driver''s "I''m available" vacancy, the trip''s pickup must be within this many km of the vacancy''s announced city. Drivers without an active vacancy are not radius-checked. Default 15.';

-- ── 2. backfill pending vacancy_invitations → trip_invitations ─────────────
insert into public.trip_invitations (trip_id, driver_id, invited_by_user_id, status, created_at, updated_at)
  select vi.trip_id, vi.driver_id, vi.invited_by_user_id, 'pending', vi.created_at, now()
    from public.vacancy_invitations vi
    where vi.status = 'pending'
      and vi.trip_id is not null
      -- only backfill if the underlying trip is still in an inviteable state
      and exists (
        select 1 from public.trips t
         where t.id = vi.trip_id
           and t.status in ('open', 'has_applicants')
      )
  on conflict (trip_id, driver_id) do nothing;

-- ── 3. drop the table — its writes only ever came from the dedicated edge
-- function (service-role) which is also being deleted in this PR.
drop table if exists public.vacancy_invitations cascade;

-- Note: the three notification types (`trip_invitation`, `invitation_accepted`,
-- `invitation_declined`) are SHARED with the trip_invitations flow — they
-- stay in the notifications_type_check CHECK constraint (added by
-- migration 032). No change needed there.
