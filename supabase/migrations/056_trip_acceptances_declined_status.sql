-- 056 — add 'declined' to the trip_acceptances.status CHECK enum
--
-- The /trips/:id/decline edge function (introduced when the two-step handshake landed)
-- already writes `status = 'declined'` on the assigned acceptance row when the selected
-- driver declines a pick. The original CHECK constraint from migration 003 / 037 didn't
-- include 'declined' in its enum, so the UPDATE silently failed on production —
-- the trip-level fields got reset (assigned_driver_id cleared, status → has_applicants)
-- but the acceptance row stayed in 'selected'. Surfaced when wiring the new
-- "decline-after-selected" UI (PR #256) and writing tests against the real DB.
--
-- Fix: drop + re-add the CHECK with 'declined' in the allowed set. Pre-existing
-- 'declined' rows (if any wrote through anyway) are still valid; no data backfill.

ALTER TABLE public.trip_acceptances DROP CONSTRAINT IF EXISTS trip_acceptances_status_check;
ALTER TABLE public.trip_acceptances
  ADD CONSTRAINT trip_acceptances_status_check
  CHECK (status = ANY (ARRAY['applied'::text, 'selected'::text, 'accepted'::text, 'rejected'::text, 'withdrawn'::text, 'expired'::text, 'declined'::text]));
