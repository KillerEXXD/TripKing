import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { STALE } from '@/lib/queryClient';
import { getNotifications, markAllNotificationsRead, markNotificationRead } from '@/lib/api/services/notifications';

export function useNotifications(params?: { unreadOnly?: boolean; limit?: number }) {
  return useQuery({ queryKey: ['notifications', params ?? {}], queryFn: () => getNotifications(params), placeholderData: keepPreviousData, staleTime: STALE.live });
}
export function useUnreadNotificationCount() {
  const { data } = useNotifications({ unreadOnly: true });
  return data?.length ?? 0;
}

function useInvalidateNotifications() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ['notifications'] });
}
export function useMarkNotificationRead() {
  const invalidate = useInvalidateNotifications();
  return useMutation({ mutationFn: (id: string) => markNotificationRead(id), onSuccess: invalidate });
}
export function useMarkAllNotificationsRead() {
  const invalidate = useInvalidateNotifications();
  return useMutation({ mutationFn: () => markAllNotificationsRead(), onSuccess: invalidate });
}
