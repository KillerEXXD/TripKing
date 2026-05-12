/** Reviews service — post-trip ratings (driver↔agent + passenger→driver). */
import { apiClient } from '@/lib/api/client';
import { toApiReview, transformReview } from '@/lib/api/transforms/review';
import type { Review, ReviewInput, ReviewsQueryParams } from '@/types';

type Api = Record<string, unknown>;
function unwrap<T>(d: T | null): T {
  if (d === null || d === undefined) throw new Error('reviews: empty response body');
  return d;
}

export function getReviews(params?: ReviewsQueryParams): Promise<Review[]> {
  const q: Record<string, unknown> = {};
  if (params?.tripId) q.trip_id = params.tripId;
  if (params?.rateeUserId) q.ratee_user_id = params.rateeUserId;
  if (params?.direction) q.direction = params.direction;
  if (params?.page) q.page = params.page;
  if (params?.limit) q.limit = params.limit;
  return apiClient.get<Api[]>('/reviews', Object.keys(q).length ? q : undefined).then((r) => (r.data ?? []).map(transformReview));
}
export function createReview(input: ReviewInput): Promise<Review> {
  return apiClient.post<Api>('/reviews', toApiReview(input)).then((r) => transformReview(unwrap(r.data)));
}
export function reportReview(id: string, reason?: string): Promise<void> {
  return apiClient.post<unknown>(`/reviews/${id}/report`, { flag_reason: reason ?? null }).then(() => undefined);
}
