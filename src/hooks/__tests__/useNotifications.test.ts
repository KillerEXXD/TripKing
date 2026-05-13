import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

vi.mock('@/lib/api/services/notifications');
import * as svc from '@/lib/api/services/notifications';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadNotificationCount,
} from '@/hooks/useNotifications';

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidate = vi.spyOn(qc, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
  return { qc, invalidate, wrapper };
}

beforeEach(() => vi.restoreAllMocks());

describe('useNotifications hooks', () => {
  it('useNotifications caches under ["notifications", params]', async () => {
    vi.mocked(svc.getNotifications).mockResolvedValue([{ id: 'n1' }] as never);
    const { qc, wrapper } = setup();
    const { result } = renderHook(() => useNotifications({ unreadOnly: true }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(qc.getQueryData(['notifications', { unreadOnly: true }])).toEqual([{ id: 'n1' }]);
  });

  it('useUnreadNotificationCount returns the length of the unread list, 0 before it resolves', async () => {
    vi.mocked(svc.getNotifications).mockResolvedValue([{ id: 'n1' }, { id: 'n2' }, { id: 'n3' }] as never);
    const { wrapper } = setup();
    const { result } = renderHook(() => useUnreadNotificationCount(), { wrapper });
    expect(result.current).toBe(0);
    await waitFor(() => expect(result.current).toBe(3));
  });

  it('useMarkNotificationRead invalidates the notifications cache on success', async () => {
    vi.mocked(svc.markNotificationRead).mockResolvedValue();
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useMarkNotificationRead(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('n1');
    });
    expect(svc.markNotificationRead).toHaveBeenCalledWith('n1');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['notifications'] });
  });

  it('useMarkAllNotificationsRead invalidates the notifications cache on success', async () => {
    vi.mocked(svc.markAllNotificationsRead).mockResolvedValue();
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useMarkAllNotificationsRead(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['notifications'] });
  });
});
