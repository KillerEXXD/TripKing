-- Combined QA reset — wipes ALL trips + every adjacent feature table AND the
-- E2E test profiles (drivers / agents) that the Playwright suite mints. Use this
-- when the team wants a clean QA slate: no trips, no vacancies, no test users —
-- while every REAL driver/agent profile and all identity/reference data survive.
--
-- Run with:
--   node scripts/db.cjs --file scripts/reset-qa-trips-and-e2e-profiles.sql
--
-- WIPED:
--   trips                       (and via ON DELETE CASCADE:)
--     ├─ trip_acceptances
--     ├─ trip_invitations
--     ├─ trip_waypoints
--     ├─ trip_executions
--     ├─ trip_offers            (newer CASCADE child — migration that added trip_offers)
--     ├─ reviews
--     └─ platform_fee_charges
--   notifications
--   vacancies                   (and via CASCADE: vacancy_destinations)
--   alerts
--   passengers
--   users WHERE display_name LIKE 'e2e-%'   (and via CASCADE: their drivers /
--     trip_managers / vehicles / driver_presence / video_verifications / any
--     residual notifications) — same predicate as migration 054's nightly
--     e2e_purge_old_users() cron, minus the 7-day age window (immediate wipe).
--
-- PRESERVED (identity / reference / financial / audit / REAL profiles):
--   real users + auth.users, real drivers / trip_managers / vehicles, KYC docs,
--   admin reference data (car_types, fuel_types, vehicle_makes/models, seat_options,
--     cities, languages, review_tags, cancel_reasons, app_settings),
--   admin_audit_log, api_metrics, rate_limits, bug_reports,
--   referral_ledger             (financial — trip_id is SET NULL by FK),
--   pii_access_log              (audit trail — trip_id is SET NULL by FK)
--
-- ORDER MATTERS (FK rules from the live schema):
--   - driver_presence.busy_trip_id is NO ACTION → cleared first so a surviving
--     (real) driver's presence row can't block DELETE FROM trips.
--   - trips.driver_id → drivers is NO ACTION → trips wiped before any profile delete.
--   - trips.posted_by_user_id → users is CASCADE, drivers.user_id /
--     trip_managers.user_id / notifications.user_id → users is CASCADE → deleting
--     an e2e user removes its profile + notifications automatically.
--
-- The DO block at the end asserts every counter is 0 — if any check fails the
-- whole transaction rolls back, so a partial wipe is impossible.

BEGIN;

-- 1. Defensively clear the only NO ACTION reference into trips (surviving real
--    driver_presence rows would otherwise block the trips delete).
UPDATE public.driver_presence SET busy_trip_id = NULL WHERE busy_trip_id IS NOT NULL;

-- 2. All trips — CASCADE pulls trip_acceptances / trip_invitations /
--    trip_waypoints / trip_executions / trip_offers / reviews / platform_fee_charges.
DELETE FROM public.trips;

-- 3. Adjacent feature tables (no FK to trips, so each needs its own DELETE):
DELETE FROM public.notifications;
DELETE FROM public.vacancies;            -- CASCADE wipes vacancy_destinations
DELETE FROM public.alerts;
DELETE FROM public.passengers;

-- 4. E2E test profiles only — CASCADE wipes their drivers / trip_managers /
--    vehicles / driver_presence / video_verifications / residual notifications.
DELETE FROM public.users WHERE display_name LIKE 'e2e-%';

-- 5. Verification — fail loudly if anything is left, rolls back the whole transaction.
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
  SELECT count(*) INTO c FROM public.users WHERE display_name LIKE 'e2e-%';
    IF c <> 0 THEN RAISE EXCEPTION 'e2e users left: %', c; END IF;
  SELECT count(*) INTO c FROM public.drivers d WHERE d.user_id IN (SELECT id FROM public.users WHERE display_name LIKE 'e2e-%');
    IF c <> 0 THEN RAISE EXCEPTION 'e2e-linked drivers left: %', c; END IF;
  SELECT count(*) INTO c FROM public.trip_managers tm WHERE tm.user_id IN (SELECT id FROM public.users WHERE display_name LIKE 'e2e-%');
    IF c <> 0 THEN RAISE EXCEPTION 'e2e-linked trip_managers left: %', c; END IF;
END $$;

COMMIT;
