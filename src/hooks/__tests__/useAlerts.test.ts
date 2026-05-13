import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

vi.mock('@/lib/api/services/alerts');
import * as svc from '@/lib/api/services/alerts';
import {
  useAlert,
  useCreateAlert,
  useDeleteAlert,
  useMyAlerts,
  useSetAlertActive,
  useUpdateAlert,
} from '@/hooks/useAlerts';

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidate = vi.spyOn(qc, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
  return { qc, invalidate, wrapper };
}

beforeEach(() => vi.restoreAllMocks());

describe('useAlerts hooks', () => {
  it('useMyAlerts fetches via getMyAlerts and caches under ["alerts"]', async () => {
    vi.mocked(svc.getMyAlerts).mockResolvedValue([{ id: 'a1' }] as never);
    const { qc, wrapper } = setup();
    const { result } = renderHook(() => useMyAlerts(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(qc.getQueryData(['alerts'])).toEqual([{ id: 'a1' }]);
  });

  it('useAlert is disabled without an id', () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useAlert(undefined), { wrapper });
    expect(svc.getAlert).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('useCreateAlert invalidates the alerts list on success', async () => {
    vi.mocked(svc.createAlert).mockResolvedValue({ id: 'a1' } as never);
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useCreateAlert(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({} as never);
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['alerts'] });
  });

  it('useUpdateAlert invalidates both the list and the specific alert detail', async () => {
    vi.mocked(svc.updateAlert).mockResolvedValue({ id: 'a1' } as never);
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useUpdateAlert(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 'a1', patch: {} as never });
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['alerts'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['alert', 'a1'] });
  });

  it('useSetAlertActive and useDeleteAlert both trigger invalidation', async () => {
    vi.mocked(svc.setAlertActive).mockResolvedValue({ id: 'a1' } as never);
    vi.mocked(svc.deleteAlert).mockResolvedValue();
    const { invalidate, wrapper } = setup();
    const setActive = renderHook(() => useSetAlertActive(), { wrapper });
    await act(async () => {
      await setActive.result.current.mutateAsync({ id: 'a1', isActive: false });
    });
    expect(svc.setAlertActive).toHaveBeenCalledWith('a1', false);
    const del = renderHook(() => useDeleteAlert(), { wrapper });
    await act(async () => {
      await del.result.current.mutateAsync('a1');
    });
    expect(svc.deleteAlert).toHaveBeenCalledWith('a1');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['alerts'] });
  });
});
