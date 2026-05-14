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
  | 'bug_commented';

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
