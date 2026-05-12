/** Notifications service — the in-app inbox. */
import { apiClient } from '@/lib/api/client';
import { transformNotification } from '@/lib/api/transforms/review';
import type { Notification } from '@/types';

type Api = Record<string, unknown>;

export function getNotifications(params?: { unreadOnly?: boolean; limit?: number }): Promise<Notification[]> {
  const q: Record<string, unknown> = {};
  if (params?.unreadOnly) q.unread_only = true;
  if (params?.limit) q.limit = params.limit;
  return apiClient.get<Api[]>('/notifications', Object.keys(q).length ? q : undefined).then((r) => (r.data ?? []).map(transformNotification));
}
export function markNotificationRead(id: string): Promise<void> {
  return apiClient.patch<unknown>(`/notifications/${id}`, { is_read: true }).then(() => undefined);
}
export function markAllNotificationsRead(): Promise<void> {
  return apiClient.post<unknown>('/notifications/read-all', {}).then(() => undefined);
}
