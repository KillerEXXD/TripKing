import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient } from '@/lib/api/client';
import * as transforms from '@/lib/api/transforms/review';
import { getNotifications, markAllNotificationsRead, markNotificationRead } from '@/lib/api/services/notifications';

function ok<T>(data: T) {
  return Promise.resolve({ success: true, data, error: null } as const);
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(transforms, 'transformNotification').mockImplementation((row: unknown) => ({ id: (row as { id: string }).id } as never));
});

describe('notifications service', () => {
  it('getNotifications → GET /notifications with unread_only + limit, omits when neither set', async () => {
    const get = vi.spyOn(apiClient, 'get').mockReturnValue(ok([{ id: 'n1' }]) as never);
    await getNotifications({ unreadOnly: true, limit: 5 });
    expect(get).toHaveBeenLastCalledWith('/notifications', { unread_only: true, limit: 5 });
    await getNotifications();
    expect(get).toHaveBeenLastCalledWith('/notifications', undefined);
  });

  it('getNotifications maps rows via transformNotification', async () => {
    vi.spyOn(apiClient, 'get').mockReturnValue(ok([{ id: 'n1' }, { id: 'n2' }]) as never);
    const list = await getNotifications();
    expect(list).toEqual([{ id: 'n1' }, { id: 'n2' }]);
  });

  it('markNotificationRead → PATCH /notifications/:id { is_read: true }, resolves void', async () => {
    const patch = vi.spyOn(apiClient, 'patch').mockReturnValue(ok(null) as never);
    await expect(markNotificationRead('n1')).resolves.toBeUndefined();
    expect(patch).toHaveBeenCalledWith('/notifications/n1', { is_read: true });
  });

  it('markAllNotificationsRead → POST /notifications/read-all with empty body', async () => {
    const post = vi.spyOn(apiClient, 'post').mockReturnValue(ok(null) as never);
    await markAllNotificationsRead();
    expect(post).toHaveBeenCalledWith('/notifications/read-all', {});
  });
});
