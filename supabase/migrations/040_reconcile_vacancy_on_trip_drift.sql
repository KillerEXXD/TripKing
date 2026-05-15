-- 040_reconcile_vacancy_on_trip_drift.sql
--
-- One-shot reconcile for vacancies that drifted out of sync with their driver's
-- accepted trip. PR #116 added syncVacanciesForTrip() in the /trips edge function;
-- a handful of acceptances landed *just before* the new code deployed, so those
-- vacancies stayed 'active' with linked_trip_id NULL when they should have moved
-- to 'on_trip' or 'expired'. Mirror the runtime helper's two write paths exactly.
--
-- Run once; safe to re-run (the WHERE clauses are idempotent — they only match
-- rows still drifted, never the ones already reconciled).

BEGIN;

-- action='accept' — driver committed but the trip hasn't started yet.
UPDATE public.vacancies v
   SET status         = 'on_trip',
       linked_trip_id = t.id,
       updated_at     = now()
  FROM public.trip_acceptances ta
  JOIN public.trips t ON t.id = ta.trip_id
 WHERE v.driver_id      = ta.driver_id
   AND ta.status        = 'accepted'
   AND t.status         = 'accepted'
   AND v.status         = 'active'
   AND v.linked_trip_id IS NULL
   AND t.pickup_at      >= v.available_from
   AND (v.available_until IS NULL OR t.pickup_at <= v.available_until);

-- action='start' — trip already in flight; the slot is consumed.
UPDATE public.vacancies v
   SET status         = 'expired',
       linked_trip_id = t.id,
       updated_at     = now()
  FROM public.trip_acceptances ta
  JOIN public.trips t ON t.id = ta.trip_id
 WHERE v.driver_id      = ta.driver_id
   AND ta.status        = 'accepted'
   AND t.status         = 'in_progress'
   AND v.status         = 'active'
   AND v.linked_trip_id IS NULL
   AND t.pickup_at      >= v.available_from
   AND (v.available_until IS NULL OR t.pickup_at <= v.available_until);

COMMIT;
