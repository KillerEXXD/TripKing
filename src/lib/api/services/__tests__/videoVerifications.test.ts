import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient } from '@/lib/api/client';
import * as transforms from '@/lib/api/transforms/videoVerification';
import {
  bookVideoCall,
  cancelVideoCall,
  finalizeVideoCall,
  getAvailableVideoSlots,
  getScheduledVideoCalls,
  getVideoVerification,
  markVideoCallNoShow,
  rescheduleVideoCall,
} from '@/lib/api/services/videoVerifications';

function ok<T>(data: T) {
  return Promise.resolve({ success: true, data, error: null } as const);
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(transforms, 'transformVideoVerification').mockImplementation((row: unknown) => ({ id: (row as { id: string }).id } as never));
  vi.spyOn(transforms, 'transformVideoCallSlot').mockImplementation((row: unknown) => ({ slotAt: (row as { slot_at: string }).slot_at } as never));
  vi.spyOn(transforms, 'toApiFinalizeVideoCall').mockImplementation(() => ({ stub: true }) as never);
});

describe('video-verifications service', () => {
  it('getAvailableVideoSlots → GET /video-verifications/available-slots', async () => {
    const get = vi.spyOn(apiClient, 'get').mockReturnValue(ok([{ slot_at: '2026-06-01T10:00:00Z' }]) as never);
    const slots = await getAvailableVideoSlots();
    expect(get).toHaveBeenCalledWith('/video-verifications/available-slots');
    expect(slots[0]?.slotAt).toBe('2026-06-01T10:00:00Z');
  });

  it('bookVideoCall → POST /video-verifications { slot_at }', async () => {
    const post = vi.spyOn(apiClient, 'post').mockReturnValue(ok({ id: 'vv1' }) as never);
    await bookVideoCall('2026-06-01T10:00:00Z');
    expect(post).toHaveBeenCalledWith('/video-verifications', { slot_at: '2026-06-01T10:00:00Z' });
  });

  it('getVideoVerification + cancelVideoCall + rescheduleVideoCall hit the correct paths', async () => {
    const get = vi.spyOn(apiClient, 'get').mockReturnValue(ok({ id: 'vv1' }) as never);
    const patch = vi.spyOn(apiClient, 'patch').mockReturnValue(ok({ id: 'vv1' }) as never);
    await getVideoVerification('vv1');
    expect(get).toHaveBeenCalledWith('/video-verifications/vv1');
    await cancelVideoCall('vv1');
    expect(patch).toHaveBeenLastCalledWith('/video-verifications/vv1', { cancel: true });
    await rescheduleVideoCall('vv1', '2026-06-02T10:00:00Z');
    expect(patch).toHaveBeenLastCalledWith('/video-verifications/vv1', { reschedule_to: '2026-06-02T10:00:00Z' });
  });

  it('getScheduledVideoCalls joins status array; omits empty filters', async () => {
    const get = vi.spyOn(apiClient, 'get').mockReturnValue(ok([]) as never);
    await getScheduledVideoCalls({ status: ['scheduled', 'completed'], from: '2026-06-01', to: '2026-06-30' });
    expect(get).toHaveBeenLastCalledWith('/video-verifications', { status: 'scheduled,completed', from: '2026-06-01', to: '2026-06-30' });
    await getScheduledVideoCalls();
    expect(get).toHaveBeenLastCalledWith('/video-verifications', undefined);
  });

  it('finalizeVideoCall → PATCH /video-verifications/:id/finalize with the toApiFinalizeVideoCall body', async () => {
    const patch = vi.spyOn(apiClient, 'patch').mockReturnValue(ok({ id: 'vv1' }) as never);
    await finalizeVideoCall('vv1', {} as never);
    expect(patch).toHaveBeenCalledWith('/video-verifications/vv1/finalize', { stub: true });
  });

  it('markVideoCallNoShow → PATCH /video-verifications/:id { no_show: true }', async () => {
    const patch = vi.spyOn(apiClient, 'patch').mockReturnValue(ok({ id: 'vv1' }) as never);
    await markVideoCallNoShow('vv1');
    expect(patch).toHaveBeenCalledWith('/video-verifications/vv1', { no_show: true });
  });
});
