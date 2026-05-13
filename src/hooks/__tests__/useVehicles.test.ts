import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

vi.mock('@/lib/api/services/vehicles');
import * as svc from '@/lib/api/services/vehicles';
import {
  useAddVehicle,
  useAdminVehicles,
  useDeleteVehicle,
  useDriverVehicles,
  useSetVehicleActive,
  useUpdateVehicle,
  useVehicle,
} from '@/hooks/useVehicles';

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidate = vi.spyOn(qc, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
  return { qc, invalidate, wrapper };
}

beforeEach(() => vi.restoreAllMocks());

describe('useVehicles hooks', () => {
  it('useDriverVehicles is disabled without a driverId, fetches when supplied', async () => {
    const { wrapper } = setup();
    renderHook(() => useDriverVehicles(undefined), { wrapper });
    expect(svc.getDriverVehicles).not.toHaveBeenCalled();
    vi.mocked(svc.getDriverVehicles).mockResolvedValue([{ id: 'v1' }] as never);
    const { result } = renderHook(() => useDriverVehicles('d1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(svc.getDriverVehicles).toHaveBeenCalledWith('d1');
  });

  it('useVehicle is disabled without an id', () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useVehicle(undefined), { wrapper });
    expect(svc.getVehicle).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('useAdminVehicles caches under ["vehicles","admin",params]', async () => {
    vi.mocked(svc.getAdminVehicles).mockResolvedValue([{ id: 'v1' }] as never);
    const { qc, wrapper } = setup();
    const params = { eligibility: ['expiring_soon' as const] };
    const { result } = renderHook(() => useAdminVehicles(params), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(qc.getQueryData(['vehicles', 'admin', params])).toEqual([{ id: 'v1' }]);
  });

  it('mutations (add/update/setActive/delete) all invalidate ["vehicles"]', async () => {
    vi.mocked(svc.addVehicle).mockResolvedValue({ id: 'v1' } as never);
    vi.mocked(svc.updateVehicle).mockResolvedValue({ id: 'v1' } as never);
    vi.mocked(svc.setVehicleActive).mockResolvedValue({ id: 'v1' } as never);
    vi.mocked(svc.deleteVehicle).mockResolvedValue();
    const { invalidate, wrapper } = setup();
    const add = renderHook(() => useAddVehicle(), { wrapper });
    await act(async () => {
      await add.result.current.mutateAsync({} as never);
    });
    const upd = renderHook(() => useUpdateVehicle(), { wrapper });
    await act(async () => {
      await upd.result.current.mutateAsync({ id: 'v1', patch: {} as never });
    });
    const setActive = renderHook(() => useSetVehicleActive(), { wrapper });
    await act(async () => {
      await setActive.result.current.mutateAsync({ id: 'v1', isActive: false });
    });
    const del = renderHook(() => useDeleteVehicle(), { wrapper });
    await act(async () => {
      await del.result.current.mutateAsync('v1');
    });
    const vehicleCalls = invalidate.mock.calls.filter(([arg]) => Array.isArray((arg as { queryKey: unknown[] }).queryKey) && (arg as { queryKey: unknown[] }).queryKey[0] === 'vehicles');
    expect(vehicleCalls.length).toBeGreaterThanOrEqual(4);
  });
});
