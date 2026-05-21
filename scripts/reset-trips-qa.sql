-- Full-scope QA reset — wipes trips + every adjacent feature table that "all
-- things related to trips" should reasonably cover. Use this when the team
-- wants a clean slate for testing (e.g. before a demo / release rehearsal).
--
-- Run with:
--   node scripts/db.cjs --file scripts/reset-trips-qa.sql
--
-- WIPED (10 tables):
--   trips                       (and via ON DELETE CASCADE:)
--     ├─ trip_acceptances
--     ├─ trip_invitations
--     ├─ trip_waypoints
--     ├─ trip_executions
--     ├─ trip_offers
--     ├─ reviews
--     └─ platform_fee_charges
--   notifications
--   vacancies                   (and via CASCADE: vacancy_destinations)
--   alerts
--   passengers
--
-- PRESERVED (identity / reference / financial / audit):
--   users, auth.users, drivers, trip_managers, vehicles, KYC docs,
--   admin reference data (car_types, fuel_types, vehicle_makes/models,
--     seat_options, cities, languages, review_tags, cancel_reasons,
--     app_settings), admin_audit_log, video_verifications, bug_reports,
--   api_metrics, rate_limits,
--   referral_ledger             (financial — trip_id is SET NULL by FK)
--   pii_access_log              (audit trail — trip_id is SET NULL by FK)
--
-- SET NULL side-effects you should expect (handled by FK rules, no DELETE needed):
--   passengers.first_trip_id   → NULL (but we wipe passengers anyway)
--   pii_access_log.trip_id     → NULL (rows survive)
--   referral_ledger.trip_id    → NULL (rows survive)
--   vacancies.linked_trip_id   → NULL (but we wipe vacancies anyway)
--
-- The DO block at the end asserts every counter is 0 — if any check fails the
-- whole transaction rolls back, so a partial wipe is impossible.

BEGIN;

-- driver_presence.busy_trip_id is NO ACTION → clear it first so a surviving
-- driver's presence row can't block the trips delete below.
UPDATE public.driver_presence SET busy_trip_id = NULL WHERE busy_trip_id IS NOT NULL;

-- One DELETE pulls trip_acceptances / trip_invitations / trip_waypoints /
-- trip_executions / trip_offers / reviews / platform_fee_charges with it via CASCADE.
DELETE FROM public.trips;

-- Adjacent feature tables (no FK to trips, so each needs its own DELETE):
DELETE FROM public.notifications;
DELETE FROM public.vacancies;            -- CASCADE wipes vacancy_destinations
DELETE FROM public.alerts;
DELETE FROM public.passengers;

-- Verification — fail loudly if any of these aren't 0, rolls back the whole transaction.
DO $$
DECLARE c int;
BEGIN
  SELECT count(*) INTO c FROM public.trips;                 IF c <> 0 THEN RAISE EXCEPTION 'trips left: %', c; END IF;
  SELECT count(*) INTO c FROM public.trip_acceptances;      IF c <> 0 THEN RAISE EXCEPTION 'trip_acceptances left: %', c; END IF;
  SELECT count(*) INTO c FROM public.trip_invitations;      IF c <> 0 THEN RAISE EXCEPTION 'trip_invitations left: %', c; END IF;
  SELECT count(*) INTO c FROM public.trip_waypoints;        IF c <> 0 THEN RAISE EXCEPTION 'trip_waypoints left: %', c; END IF;
  SELECT count(*) INTO c FROM public.trip_executions;       IF c <> 0 THEN RAISE EXCEPTION 'trip_executions left: %', c; END IF;
  SELECT count(*) INTO c FROM public.trip_offers;           IF c <> 0 THEN RAISE EXCEPTION 'trip_offers left: %', c; END IF;
  SELECT count(*) INTO c FROM public.reviews;               IF c <> 0 THEN RAISE EXCEPTION 'reviews left: %', c; END IF;
  SELECT count(*) INTO c FROM public.platform_fee_charges;  IF c <> 0 THEN RAISE EXCEPTION 'platform_fee_charges left: %', c; END IF;
  SELECT count(*) INTO c FROM public.notifications;         IF c <> 0 THEN RAISE EXCEPTION 'notifications left: %', c; END IF;
  SELECT count(*) INTO c FROM public.vacancies;             IF c <> 0 THEN RAISE EXCEPTION 'vacancies left: %', c; END IF;
  SELECT count(*) INTO c FROM public.vacancy_destinations;  IF c <> 0 THEN RAISE EXCEPTION 'vacancy_destinations left: %', c; END IF;
  SELECT count(*) INTO c FROM public.alerts;                IF c <> 0 THEN RAISE EXCEPTION 'alerts left: %', c; END IF;
  SELECT count(*) INTO c FROM public.passengers;            IF c <> 0 THEN RAISE EXCEPTION 'passengers left: %', c; END IF;
END $$;

COMMIT;
