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

  it('useNotifications keeps the previous data while a filter-change refetch is in flight', async () => {
    // First filter: unreadOnly=true → 2 rows
    vi.mocked(svc.getNotifications).mockResolvedValueOnce([{ id: 'n1' }, { id: 'n2' }] as never);
    const { wrapper } = setup();
    const { result, rerender } = renderHook(({ unreadOnly }: { unreadOnly: boolean }) => useNotifications({ unreadOnly }), {
      wrapper,
      initialProps: { unreadOnly: true },
    });
    await waitFor(() => expect(result.current.data).toHaveLength(2));

    // Flip to unreadOnly=false — the queryKey changes; the refetch is now slow.
    let resolveSecond: (v: unknown[]) => void = () => {};
    vi.mocked(svc.getNotifications).mockReturnValueOnce(new Promise<unknown[]>((r) => { resolveSecond = r; }) as never);
    rerender({ unreadOnly: false });

    // While the second fetch is pending, data must still be the previous 2 rows
    // (without keepPreviousData this would be undefined → spinner flash).
    expect(result.current.data).toHaveLength(2);
    expect(result.current.isPlaceholderData).toBe(true);

    // Resolve the second fetch and assert the swap happens.
    resolveSecond([{ id: 'n3' }, { id: 'n4' }, { id: 'n5' }]);
    await waitFor(() => expect(result.current.data).toHaveLength(3));
    expect(result.current.isPlaceholderData).toBe(false);
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
