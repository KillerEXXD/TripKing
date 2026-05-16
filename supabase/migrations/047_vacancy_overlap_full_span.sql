-- TripKing — migration 047: vacancy overlap honours trip.expected_end_at.
--
-- Migration 039 introduced vacancies.status='on_trip' and the syncVacanciesForTrip()
-- side-effect in supabase/functions/trips/index.ts: when a driver is selected for a
-- trip, any of *their own* active vacancies whose window covers the trip flip to
-- 'on_trip' (hidden from agent search). The original overlap test only required
-- `available_until >= trip.pickup_at` — so a vacancy whose window ended *between*
-- pickup_at and expected_end_at (multi-day trip case) silently stayed 'active' and
-- agents could still pick the driver for a clashing second trip.
--
-- Edge function fix lands alongside this migration; this one-shot sweep catches the
-- drift on already-accepted/in-flight trips, mirroring migration 040.

BEGIN;

-- Pre-start: still 'accepted' — flip to on_trip so agents stop seeing it.
UPDATE public.vacancies v
   SET status         = 'on_trip',
       linked_trip_id = t.id,
       updated_at     = now()
  FROM public.trips t
 WHERE t.status            = 'accepted'
   AND t.assigned_driver_id = v.driver_id
   AND v.status            = 'active'
   AND v.available_from   <= t.pickup_at
   AND (v.available_until IS NULL OR v.available_until >= t.expected_end_at);

-- In flight: trip has started — slot is consumed, expire it (matches syncVacanciesForTrip('start')).
UPDATE public.vacancies v
   SET status         = 'expired',
       linked_trip_id = t.id,
       updated_at     = now()
  FROM public.trips t
 WHERE t.status            = 'in_progress'
   AND t.assigned_driver_id = v.driver_id
   AND v.status            = 'active'
   AND v.available_from   <= t.pickup_at
   AND (v.available_until IS NULL OR v.available_until >= t.expected_end_at);

COMMIT;
