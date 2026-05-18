-- 060_trip_updated_notification.sql
--
-- Adds `trip_updated` to the notifications.type CHECK constraint.
--
-- Background:
--   When the trip poster edits a posted trip via PATCH /trips/:id (e.g. moves the
--   pickup time, changes the rate), every applicant + every pending invitee gets
--   alerted so they can re-evaluate whether they still want the trip. The
--   notification's `payload_json` carries a `changes` array of `{ field, before,
--   after, label }` records so the driver-side trip-detail page can render the
--   diff inline ("Pickup moved from 16 May 10AM → 18 May 2PM").
--
-- Already applied to project saxcbebqxgatiktsebxw on 2026-05-18 — re-running is
-- idempotent (DROP IF EXISTS then re-add with the full union of allowed values).

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
    -- existing
    'alert_match', 'kyc_status_change', 'trip_assigned', 'trip_cancelled',
    'trip_completed', 'review_received', 'account_status_change',
    'trip_invitation', 'invitation_accepted', 'invitation_declined',
    'bug_reported', 'bug_resolved', 'bug_commented',
    'trip_selected', 'trip_assignment_cancelled', 'selection_expired',
    'driver_declined',
    'referral_signup',
    'referral_verified',
    'referral_promo_exhausted',
    'referral_first_eligible_trip',
    'referral_qualified',
    'referral_earning',
    'referral_released',
    'referral_cap_reached',
    'withdrawal_requested',
    'withdrawal_approved',
    'withdrawal_paid',
    'withdrawal_rejected',
    -- 060: trip details edited by the poster while applicants/invitees exist
    'trip_updated'
  ]));
