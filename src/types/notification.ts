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
  | 'driver_declined';

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
