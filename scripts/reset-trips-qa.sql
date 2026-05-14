-- One-shot QA reset — wipes every trip and trip-adjacent row so the team can
-- start fresh tomorrow. Lives outside supabase/migrations/ because it's a
-- data operation, not a schema-versioned migration (the migrations stay as
-- the source of truth for fresh-environment deploys).
--
-- Preserves: users, drivers, trip_managers, vehicles, KYC progress, all admin
--            reference data (cities/car_types/etc.), api_metrics, rate_limits,
--            admin_audit_log, video_verifications, bug_reports.
--
-- Run with:
--   node scripts/db.cjs --file scripts/reset-trips-qa.sql
--
-- The DO block at the end asserts every counter is 0 — if any check fails the
-- whole transaction rolls back, so a partial wipe is impossible.

BEGIN;

-- Trip-adjacent rows with hard FKs to trips will go via ON DELETE CASCADE
-- (trip_acceptances, trip_invitations, trip_waypoints, trip_executions,
-- reviews). The single DELETE FROM trips below takes that whole family.
DELETE FROM public.trips;

-- No FK from notifications to trips — wipe them explicitly. All of them, per
-- the reset intent (most reference now-deleted trips → broken inbox links).
DELETE FROM public.notifications;

-- Vacancies + their destinations (CASCADE), driver "I'm available" posts.
DELETE FROM public.vacancies;

-- Saved searches.
DELETE FROM public.alerts;

-- Passenger directory (auto-built from trip submissions; orphaned after wipe).
DELETE FROM public.passengers;

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
  SELECT count(*) INTO c FROM public.notifications;     IF c <> 0 THEN RAISE EXCEPTION 'notifications left: %', c; END IF;
  SELECT count(*) INTO c FROM public.vacancies;         IF c <> 0 THEN RAISE EXCEPTION 'vacancies left: %', c; END IF;
  SELECT count(*) INTO c FROM public.alerts;            IF c <> 0 THEN RAISE EXCEPTION 'alerts left: %', c; END IF;
  SELECT count(*) INTO c FROM public.passengers;        IF c <> 0 THEN RAISE EXCEPTION 'passengers left: %', c; END IF;
END $$;

COMMIT;
