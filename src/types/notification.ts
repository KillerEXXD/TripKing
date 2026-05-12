export type NotificationType =
  | 'alert_match'
  | 'kyc_status_change'
  | 'trip_assigned'
  | 'trip_cancelled'
  | 'trip_completed'
  | 'review_received';

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
