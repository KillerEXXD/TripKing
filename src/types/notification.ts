export type NotificationType =
  | 'alert_match'
  | 'kyc_status_change'
  | 'trip_assigned'
  | 'trip_cancelled'
  | 'trip_completed'
  | 'review_received'
  | 'account_status_change'
  | 'trip_invitation'
  | 'invitation_accepted'
  | 'invitation_declined'
  | 'bug_reported'
  | 'bug_resolved'
  | 'bug_commented'
  // Phase 3 of the two-step handshake (migration 032):
  | 'trip_selected'
  | 'trip_assignment_cancelled'
  | 'selection_expired'
  | 'driver_declined'
  // Migration 060: the trip poster edited an open trip with applicants/invitees;
  // payload_json carries `{ changes: [{ field, before, after, label }, …] }` so the
  // recipient's trip-detail page can render a diff inline.
  | 'trip_updated';

/** Concrete shape of the `payload_json` carried by a `trip_updated` notification.
 *  Drives the driver-side diff banner ("Pickup moved from X → Y"). */
export interface TripUpdatedChange {
  field: 'pickup_at' | 'expected_end_at' | 'rate_per_km' | 'driver_bata' | 'gst_amount' | 'commission_pct' | 'car_type_id' | 'seats_required' | 'ac_required';
  before: string | number | boolean | null;
  after: string | number | boolean | null;
  /** Human-readable label for the field — server-supplied so the frontend doesn't need a switch. */
  label: string;
}
export interface TripUpdatedPayload {
  trip_id: string;
  changes: TripUpdatedChange[];
}

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  payloadJson: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
}
