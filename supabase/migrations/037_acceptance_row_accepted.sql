-- Migration 037 — add 'accepted' to trip_acceptances.status, backfill stale rows.
--
-- Background: when a driver hits POST /trips/:id/accept the trip flips to
-- 'accepted' but the trip_acceptances row stayed at status='selected'. That
-- divergence broke the driver-home "Awaiting decision" card — it kept showing
-- a trip the driver had already accepted because the acceptance row still
-- read 'selected'. The client worked around it with a compound filter
-- (PR #74) but the row's truth and the trip's truth should agree.
--
-- This migration:
--   1. broadens the CHECK to allow 'accepted'.
--   2. backfills the rows that historically should have flipped: for trips
--      now at status IN ('accepted','in_progress','completed'), the
--      assigned_acceptance_id row → 'accepted'.

set search_path = public, pg_catalog;

alter table public.trip_acceptances drop constraint if exists trip_acceptances_status_check;
alter table public.trip_acceptances add constraint trip_acceptances_status_check
  check (status in ('applied','selected','accepted','rejected','withdrawn','expired'));

update public.trip_acceptances ta
   set status = 'accepted'
  from public.trips t
 where t.assigned_acceptance_id = ta.id
   and t.status in ('accepted','in_progress','completed')
   and ta.status = 'selected';
