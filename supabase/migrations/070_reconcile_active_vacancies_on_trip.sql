-- 070_reconcile_active_vacancies_on_trip.sql
--
-- One-off reconcile for the "driver on a trip still shows as vacant" bug.
--
-- syncVacanciesForTrip('accept') used to flip a vacancy to 'on_trip' only when the vacancy window
-- FULLY CONTAINED the trip (available_until >= expected_end_at). Drivers who posted a shorter
-- availability than the trip runs were left 'active' and leaked into the agent vacant-driver feed.
-- The edge function now uses an interval-OVERLAP gate; this migration heals rows already stuck.
--
-- Flip 'active' vacancies to 'on_trip' (linking the trip) where the driver has a committed
-- (accepted / in_progress) trip whose [pickup_at, expected_end_at] overlaps the vacancy window
-- [available_from, available_until] (available_until NULL = open-ended). Idempotent: only touches
-- status='active' rows, safe to re-run.

UPDATE public.vacancies v
SET    status = 'on_trip',
       linked_trip_id = t.id,
       updated_at = now()
FROM   public.trips t
WHERE  v.status = 'active'
  AND  t.assigned_driver_id = v.driver_id
  AND  t.status IN ('accepted', 'in_progress')
  AND  t.expected_end_at > now()
  AND  v.available_from <= t.expected_end_at
  AND  (v.available_until IS NULL OR v.available_until >= t.pickup_at);

ANALYZE public.vacancies;
