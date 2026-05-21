-- 20260521_delete_trip_consumed_vacancies.sql
--
-- Timestamped name (not NNN) deliberately: two parallel branches both took migration 071, so a
-- numeric name would collide on merge. This sorts after all NNN_ files and is order-independent.
--
-- syncVacanciesForTrip('start') now DELETES the linked vacancy when a trip starts (the slot is
-- consumed) instead of marking it 'expired'. Previously-started trips left their vacancies as
-- status='expired' with linked_trip_id set — these surface in the driver's "I'm vacant" tab under
-- "EXPIRED — please remove or repost" even when the window is still in the future (e.g. Driver Vasu).
--
-- Clean them up: delete vacancies that were expired *by a trip start* — i.e. status='expired' AND
-- linked_trip_id IS NOT NULL. (Time-expired vacancies have linked_trip_id NULL — left untouched;
-- those legitimately want a repost. The 'revert' path nulls linked_trip_id on cancel.)
-- vacancy_destinations rows cascade (migration 003 ON DELETE CASCADE).

DELETE FROM public.vacancies
WHERE status = 'expired'
  AND linked_trip_id IS NOT NULL;

ANALYZE public.vacancies;
