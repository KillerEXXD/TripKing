import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

vi.mock('@/lib/api/services/admin-config');
import * as svc from '@/lib/api/services/admin-config';
import {
  carTypeHooks,
  useAppSettings,
  useReviewTagsByCategory,
  useUpdateAppSettings,
  useVehicleModelsForMake,
} from '@/hooks/useAdminConfig';

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidate = vi.spyOn(qc, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
  return { qc, invalidate, wrapper };
}

beforeEach(() => {
  vi.restoreAllMocks();
  // The factory captures the api object at module-load time; stub each method that the tests touch.
  vi.mocked(svc.carTypesApi).list = vi.fn().mockResolvedValue([{ id: 'ct1' }]);
  vi.mocked(svc.carTypesApi).create = vi.fn().mockResolvedValue({ id: 'ct1' });
});

describe('useAdminConfig hooks', () => {
  it('makeAdminHooks: useList caches under ["admin", "<list>", opts]', async () => {
    const { qc, wrapper } = setup();
    const { result } = renderHook(() => carTypeHooks.useList(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(qc.getQueryData(['admin', 'car-types', {}])).toEqual([{ id: 'ct1' }]);
  });

  it('makeAdminHooks: useCreate invalidates ["admin","<list>"] on success', async () => {
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => carTypeHooks.useCreate(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({} as never);
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['admin', 'car-types'] });
  });

  it('useVehicleModelsForMake is disabled without a makeId', () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useVehicleModelsForMake(undefined), { wrapper });
    expect(svc.getVehicleModelsForMake).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('useReviewTagsByCategory passes through to getReviewTagsByCategory', async () => {
    vi.mocked(svc.getReviewTagsByCategory).mockResolvedValue([{ id: 'rt1' }] as never);
    const { wrapper } = setup();
    const { result } = renderHook(() => useReviewTagsByCategory('passenger_to_driver'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(svc.getReviewTagsByCategory).toHaveBeenCalledWith('passenger_to_driver', undefined);
  });

  it('useUpdateAppSettings invalidates ["admin","app-settings"] on success', async () => {
    vi.mocked(svc.updateAppSettings).mockResolvedValue({ id: 1 } as never);
    vi.mocked(svc.getAppSettings).mockResolvedValue({ id: 1 } as never);
    const { invalidate, wrapper } = setup();
    const get = renderHook(() => useAppSettings(), { wrapper });
    await waitFor(() => expect(get.result.current.isSuccess).toBe(true));
    const upd = renderHook(() => useUpdateAppSettings(), { wrapper });
    await act(async () => {
      await upd.result.current.mutateAsync({} as never);
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['admin', 'app-settings'] });
  });
});
