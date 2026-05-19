/** Review + notification transforms — strict on the keys the app needs. */
import { ApiTransformError } from '@/lib/api/transforms/base';
import { addDataBreadcrumb } from '@/lib/sentry';
import type { Notification, NotificationType, RaterRole, Review, ReviewDirection, ReviewInput, ReviewScore } from '@/types';

export type ReviewTransformErrorCode = 'MISSING_ID' | 'MISSING_TRIP_ID' | 'BAD_DIRECTION' | 'BAD_SCORE';
export class ReviewTransformError extends ApiTransformError<ReviewTransformErrorCode> {}
type Api = Record<string, unknown>;
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}
function strArray(v: unknown): string[] {
  return Array.isArray(v) ? (v as unknown[]).filter((x): x is string => typeof x === 'string') : [];
}
const DIRECTIONS: readonly ReviewDirection[] = ['passenger_to_driver', 'manager_to_driver', 'driver_to_manager'];
const RATER_ROLES: readonly RaterRole[] = ['driver', 'trip_manager', 'admin', 'passenger'];

export function transformReview(api: Api): Review {
  const id = str(api.id);
  if (!id) throw new ReviewTransformError('review has no id', 'MISSING_ID', { api });
  const tripId = str(api.trip_id);
  if (!tripId) throw new ReviewTransformError('review has no trip_id', 'MISSING_TRIP_ID', { id });
  const direction = str(api.direction);
  if (!direction || !DIRECTIONS.includes(direction as ReviewDirection)) throw new ReviewTransformError(`bad review direction "${direction}"`, 'BAD_DIRECTION', { id });
  const score = typeof api.score === 'number' ? api.score : NaN;
  if (!Number.isInteger(score) || score < 1 || score > 5) throw new ReviewTransformError(`bad review score "${api.score}"`, 'BAD_SCORE', { id });
  const role = str(api.rater_role);
  return {
    id,
    tripId,
    raterUserId: str(api.rater_user_id),
    raterRole: (role && RATER_ROLES.includes(role as RaterRole) ? role : 'passenger') as RaterRole,
    rateeUserId: str(api.ratee_user_id),
    direction: direction as ReviewDirection,
    score: score as ReviewScore,
    comment: str(api.comment) ?? '',
    tagIds: strArray(api.tag_ids),
    isPublished: typeof api.is_published === 'boolean' ? api.is_published : true,
    isFlagged: typeof api.is_flagged === 'boolean' ? api.is_flagged : false,
    flagReason: str(api.flag_reason),
    createdAt: str(api.created_at) ?? new Date().toISOString(),
  };
}
export function toApiReview(input: ReviewInput): Record<string, unknown> {
  return {
    trip_id: input.tripId,
    ratee_user_id: input.rateeUserId ?? null,
    direction: input.direction,
    score: input.score,
    comment: input.comment ?? '',
    tag_ids: input.tagIds ?? [],
  };
}

const NOTIFICATION_TYPES: readonly NotificationType[] = [
  'alert_match', 'kyc_status_change', 'trip_assigned', 'trip_cancelled', 'trip_completed', 'review_received',
  'account_status_change', 'trip_invitation', 'invitation_accepted', 'invitation_declined',
  'bug_reported', 'bug_resolved', 'bug_commented',
  // Phase 3 of the two-step handshake (migration 032):
  'trip_selected', 'trip_assignment_cancelled', 'selection_expired', 'driver_declined',
  // Migration 060 + referral / withdrawal lifecycle:
  'trip_updated',
  'referral_signup', 'referral_verified', 'referral_qualified', 'referral_first_eligible_trip',
  'referral_earning', 'referral_released', 'referral_cap_reached',
  'withdrawal_requested', 'withdrawal_approved', 'withdrawal_rejected', 'withdrawal_paid',
  'unknown',
];
export function transformNotification(api: Api): Notification {
  const id = str(api.id);
  if (!id) throw new Error('notification has no id');
  const userId = str(api.user_id);
  if (!userId) throw new Error(`notification ${id} has no user_id`);
  const rawType = str(api.type);
  // Lenient on enum drift: a server-side notification type the client hasn't shipped
  // yet must not take down the whole inbox. Breadcrumb so we can spot the drift in
  // Sentry, then fall back to the 'unknown' sentinel — the UI uses title/body as-is.
  let type: NotificationType;
  if (rawType && NOTIFICATION_TYPES.includes(rawType as NotificationType)) {
    type = rawType as NotificationType;
  } else {
    addDataBreadcrumb('unknown notification type', { feature: 'notifications', endpoint: '/notifications' }, 'warning');
    type = 'unknown';
  }
  return {
    id,
    userId,
    type,
    title: str(api.title) ?? '',
    body: str(api.body) ?? '',
    payloadJson: api.payload_json && typeof api.payload_json === 'object' ? (api.payload_json as Record<string, unknown>) : {},
    isRead: typeof api.is_read === 'boolean' ? api.is_read : false,
    createdAt: str(api.created_at) ?? new Date().toISOString(),
  };
}
