import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

vi.mock('@/lib/api/services/admin-stage5');
import * as svc from '@/lib/api/services/admin-stage5';
import {
  useAdminList,
  useAppWallet,
  useCreateAdminRow,
  useDeleteAdminRow,
  useSingletonSettings,
  useUpdateAdminRow,
  useUpdateSingletonSettings,
} from '@/hooks/useAdminStage5';

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidate = vi.spyOn(qc, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
  return { qc, invalidate, wrapper };
}
beforeEach(() => vi.restoreAllMocks());

describe('useAdminStage5 hooks', () => {
  it('useSingletonSettings caches under [admin, key]', async () => {
    vi.mocked(svc.getSingletonSettings).mockResolvedValue({ id: 1, foo: 'bar' });
    const { qc, wrapper } = setup();
    const { result } = renderHook(() => useSingletonSettings('wallet-settings'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(qc.getQueryData(['admin', 'wallet-settings'])).toEqual({ id: 1, foo: 'bar' });
  });

  it('useUpdateSingletonSettings invalidates the right key', async () => {
    vi.mocked(svc.updateSingletonSettings).mockResolvedValue({ id: 1 });
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useUpdateSingletonSettings('referral-settings'), { wrapper });
    await act(async () => { await result.current.mutateAsync({ x: 1 }); });
    expect(svc.updateSingletonSettings).toHaveBeenCalledWith('referral-settings', { x: 1 });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['admin', 'referral-settings'] });
  });

  it('useAdminList passes includeInactive', async () => {
    vi.mocked(svc.listAdminRows).mockResolvedValue([{ id: 't1' }]);
    const { wrapper } = setup();
    const { result } = renderHook(() => useAdminList('referral-tiers', { includeInactive: true }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(svc.listAdminRows).toHaveBeenCalledWith('referral-tiers', { includeInactive: true });
  });

  it('useCreateAdminRow / useUpdateAdminRow / useDeleteAdminRow invalidate the list', async () => {
    vi.mocked(svc.createAdminRow).mockResolvedValue({ id: 'x' });
    vi.mocked(svc.updateAdminRow).mockResolvedValue({ id: 'x' });
    vi.mocked(svc.deleteAdminRow).mockResolvedValue(undefined);
    const { invalidate, wrapper } = setup();
    const c = renderHook(() => useCreateAdminRow('fraud-action-rules'), { wrapper });
    const u = renderHook(() => useUpdateAdminRow('fraud-action-rules'), { wrapper });
    const d = renderHook(() => useDeleteAdminRow('fraud-action-rules'), { wrapper });
    await act(async () => { await c.result.current.mutateAsync({}); });
    await act(async () => { await u.result.current.mutateAsync({ id: 'x', patch: {} }); });
    await act(async () => { await d.result.current.mutateAsync('x'); });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['admin', 'fraud-action-rules'] });
  });

  it('useAppWallet caches under [admin, app-wallet, limit]', async () => {
    vi.mocked(svc.getAppWallet).mockResolvedValue({ balance: { totalPaise: 0, lifetimeCollectedPaise: 0, lifetimeRefundedPaise: 0, entries: 0 }, ledger: [] });
    const { qc, wrapper } = setup();
    const { result } = renderHook(() => useAppWallet(50), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(qc.getQueryData(['admin', 'app-wallet', 50])).toBeTruthy();
  });
});
