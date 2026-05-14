-- Migration 030 — Phase 1 of the trip-assignment two-step handshake.
--
-- Per docs/TRIP_ASSIGNMENT_WORKFLOW.md §9 and §14: add the storage fields
-- + broaden the trips.status CHECK to allow the new `selected` state.
-- This migration is BEHAVIOUR-NEUTRAL: nothing in the edge functions or
-- frontend uses these fields yet. Phase 2 (POST /trips/:id/accept etc.)
-- wires them up. Backfill leaves existing rows in a sane state.
--
-- Columns added on `trips`:
--   acceptance_window_minutes  int 5–30, default 15  — set at post time
--   acceptance_deadline_at     timestamptz null      — stamped on /assign
--   driver_acceptance_status   text null             — pending|accepted|declined|expired
--
-- The CHECK on `trips.status` is broadened from
--   ('open','has_applicants','assigned','in_progress','completed','cancelled')
-- to ALSO include `'selected'` (the new intermediate state).

alter table public.trips
  add column if not exists acceptance_window_minutes int not null default 15
    check (acceptance_window_minutes between 5 and 30);

alter table public.trips
  add column if not exists acceptance_deadline_at timestamptz;

alter table public.trips
  add column if not exists driver_acceptance_status text
    check (driver_acceptance_status in ('pending', 'accepted', 'declined', 'expired'));

-- broaden the status CHECK
alter table public.trips drop constraint if exists trips_status_check;
alter table public.trips add constraint trips_status_check
  check (status in ('open', 'has_applicants', 'selected', 'assigned',
                    'in_progress', 'completed', 'cancelled'));

-- backfill: any existing 'assigned'/in_progress/completed row is treated as
-- having been accepted (so analytics + later filtering see a sensible value).
update public.trips
   set driver_acceptance_status = 'accepted'
 where status in ('assigned', 'in_progress', 'completed')
   and driver_acceptance_status is null;

comment on column public.trips.acceptance_window_minutes is
  'How long the driver has to Accept after the agent selects them. 5–30 min, default 15. Phase 1 of the two-step handshake (see docs/TRIP_ASSIGNMENT_WORKFLOW.md).';
comment on column public.trips.acceptance_deadline_at is
  'Set by POST /trips/:id/assign (Phase 2) to now() + acceptance_window_minutes. NULL otherwise.';
comment on column public.trips.driver_acceptance_status is
  'Phase 2 enum: pending | accepted | declined | expired. NULL on trips before this migration.';
