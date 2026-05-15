-- 039_vacancy_on_trip.sql
-- Auto-suspend a driver's vacancy when they accept a conflicting trip.
--
-- New status: 'on_trip' — the vacancy is owned by an accepted trip and is hidden
-- from agent/driver "find a driver in city X" searches, but still shown to the
-- driver themselves (so the IAmAvailableCard can render the "you've accepted X,
-- this vacancy will be removed when the trip starts" banner).
--
-- linked_trip_id is the FK back to the trip that took the slot; the trips edge
-- function uses it to expire/revert the vacancy on trip start/cancel/unselect.

ALTER TABLE public.vacancies
  DROP CONSTRAINT IF EXISTS vacancies_status_check;

ALTER TABLE public.vacancies
  ADD CONSTRAINT vacancies_status_check
  CHECK (status IN ('active', 'matched', 'on_trip', 'expired', 'cancelled'));

ALTER TABLE public.vacancies
  ADD COLUMN IF NOT EXISTS linked_trip_id UUID
  REFERENCES public.trips(id) ON DELETE SET NULL;

-- Hot path: the /start, /cancel, /unselect handlers look up by linked_trip_id
-- among on_trip rows. Tiny set; partial index keeps it cheap.
CREATE INDEX IF NOT EXISTS idx_vacancies_linked_trip
  ON public.vacancies(linked_trip_id)
  WHERE status = 'on_trip';

ANALYZE public.vacancies;
