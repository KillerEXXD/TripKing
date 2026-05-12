import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient } from '@/lib/api/client';
import { createReview, getReviews, moderateReview } from '@/lib/api/services/reviews';

function ok<T>(data: T) {
  return Promise.resolve({ success: true, data, error: null } as const);
}
const apiReview = (over: Record<string, unknown> = {}) => ({ id: 'r1', trip_id: 't1', rater_role: 'trip_manager', direction: 'manager_to_driver', score: 4, is_published: true, is_flagged: false, created_at: '2099-01-01T00:00:00Z', ...over });

describe('reviews service', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('getReviews({ flagged }) → GET /reviews?flagged=true (the moderation queue)', async () => {
    const get = vi.spyOn(apiClient, 'get').mockReturnValue(ok([apiReview({ is_flagged: true, flag_reason: 'spam' })]) as never);
    const reviews = await getReviews({ flagged: true });
    expect(get).toHaveBeenCalledWith('/reviews', { flagged: true });
    expect(reviews[0]?.isFlagged).toBe(true);
  });

  it('getReviews({ tripId, direction }) → GET /reviews?trip_id=&direction=', async () => {
    const get = vi.spyOn(apiClient, 'get').mockReturnValue(ok([apiReview()]) as never);
    await getReviews({ tripId: 't1', direction: 'manager_to_driver' });
    expect(get).toHaveBeenCalledWith('/reviews', { trip_id: 't1', direction: 'manager_to_driver' });
  });

  it('createReview → POST /reviews with snake_case body', async () => {
    const post = vi.spyOn(apiClient, 'post').mockReturnValue(ok(apiReview()) as never);
    await createReview({ tripId: 't1', direction: 'driver_to_manager', score: 5, comment: 'good', tagIds: ['tg1'] });
    expect(post).toHaveBeenCalledWith('/reviews', expect.objectContaining({ trip_id: 't1', direction: 'driver_to_manager', score: 5 }));
  });

  it('moderateReview(clearFlag) → POST /reviews/:id/moderate { clear_flag: true }', async () => {
    const post = vi.spyOn(apiClient, 'post').mockReturnValue(ok(apiReview({ is_flagged: false })) as never);
    const r = await moderateReview('r1', { clearFlag: true });
    expect(post).toHaveBeenCalledWith('/reviews/r1/moderate', { clear_flag: true });
    expect(r.isFlagged).toBe(false);
  });

  it('moderateReview(hide) → POST /reviews/:id/moderate { is_published: false, clear_flag: true }', async () => {
    const post = vi.spyOn(apiClient, 'post').mockReturnValue(ok(apiReview({ is_published: false, is_flagged: false })) as never);
    await moderateReview('r1', { isPublished: false, clearFlag: true });
    expect(post).toHaveBeenCalledWith('/reviews/r1/moderate', { is_published: false, clear_flag: true });
  });
});
