-- Narrow-scope QA reset — wipes ONLY trips and the rows that cascade off them.
-- Lives alongside scripts/reset-trips-qa.sql (the full-reset variant). Use this
-- one when you want to clear test trip data but KEEP driver/agent notifications,
-- vacancy posts, saved alerts, and the passenger directory.
--
-- Preserves on top of the full-reset's preservation list:
--   - notifications (inbox stays, including alert_match / kyc_status_change / trip_assigned / etc.)
--   - vacancies + vacancy_destinations (driver "I'm available" posts)
--   - alerts (saved searches)
--   - passengers (auto-built from past trip posts — their first_trip_id is
--     SET NULL by the FK rule, so rows survive with that column nullified)
--
-- Run with:
--   node scripts/db.cjs --file scripts/reset-trips-only.sql
--
-- The DO block at the end asserts every counter is 0 — if any check fails the
-- whole transaction rolls back, so a partial wipe is impossible.

BEGIN;

-- All trip-adjacent rows with hard FKs to trips go via ON DELETE CASCADE:
--   trip_acceptances, trip_invitations, trip_waypoints, trip_executions, reviews.
-- The single DELETE FROM trips below takes that whole family with it.
-- Two SET NULL columns (passengers.first_trip_id, pii_access_log.trip_id) are
-- nullified by the FK rule; rows in those tables survive.
DELETE FROM public.trips;

-- Verification — fail loudly if any of these aren't 0, rolls back the whole transaction.
DO $$
DECLARE c int;
BEGIN
  SELECT count(*) INTO c FROM public.trips;             IF c <> 0 THEN RAISE EXCEPTION 'trips left: %', c; END IF;
  SELECT count(*) INTO c FROM public.trip_acceptances;  IF c <> 0 THEN RAISE EXCEPTION 'trip_acceptances left: %', c; END IF;
  SELECT count(*) INTO c FROM public.trip_invitations;  IF c <> 0 THEN RAISE EXCEPTION 'trip_invitations left: %', c; END IF;
  SELECT count(*) INTO c FROM public.trip_waypoints;    IF c <> 0 THEN RAISE EXCEPTION 'trip_waypoints left: %', c; END IF;
  SELECT count(*) INTO c FROM public.trip_executions;   IF c <> 0 THEN RAISE EXCEPTION 'trip_executions left: %', c; END IF;
  SELECT count(*) INTO c FROM public.reviews;           IF c <> 0 THEN RAISE EXCEPTION 'reviews left: %', c; END IF;
END $$;

COMMIT;
