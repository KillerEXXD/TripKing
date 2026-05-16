import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

vi.mock('@/lib/api/services/admin-referrals');
import * as svc from '@/lib/api/services/admin-referrals';
import {
  useAdminFraudFlags,
  useAdminReferrals,
  useCreateAdminFraudFlag,
  usePatchAdminReferralStatus,
  usePatchUserRisk,
  useResolveAdminFraudFlag,
  useReverseAdminReferralEarnings,
} from '@/hooks/useAdminReferrals';

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidate = vi.spyOn(qc, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
  return { qc, invalidate, wrapper };
}
beforeEach(() => vi.restoreAllMocks());

describe('useAdminReferrals hooks', () => {
  it('useAdminReferrals caches under [admin, referrals, params]', async () => {
    vi.mocked(svc.getAdminReferrals).mockResolvedValue([{ id: 'lk1' } as never]);
    const { wrapper } = setup();
    const { result } = renderHook(() => useAdminReferrals({ status: 'qualified' }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(svc.getAdminReferrals).toHaveBeenCalledWith({ status: 'qualified' });
  });

  it('mutations invalidate the right key', async () => {
    vi.mocked(svc.patchAdminReferralStatus).mockResolvedValue({ id: 'lk1' } as never);
    vi.mocked(svc.reverseAdminReferralEarnings).mockResolvedValue({ reversedPaise: 100 });
    vi.mocked(svc.createAdminFraudFlag).mockResolvedValue({ id: 'f1' } as never);
    vi.mocked(svc.resolveAdminFraudFlag).mockResolvedValue({ id: 'f1' } as never);
    const { invalidate, wrapper } = setup();

    const setStatus = renderHook(() => usePatchAdminReferralStatus(), { wrapper });
    await act(async () => { await setStatus.result.current.mutateAsync({ id: 'lk1', status: 'suspended' }); });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['admin', 'referrals'] });

    const reverse = renderHook(() => useReverseAdminReferralEarnings(), { wrapper });
    await act(async () => { await reverse.result.current.mutateAsync({ id: 'lk1' }); });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['admin', 'referrals'] });

    const create = renderHook(() => useCreateAdminFraudFlag(), { wrapper });
    await act(async () => { await create.result.current.mutateAsync({ referralLinkId: 'lk1', flagType: 'manual', severity: 'high' }); });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['admin', 'referral-flags'] });

    const resolve = renderHook(() => useResolveAdminFraudFlag(), { wrapper });
    await act(async () => { await resolve.result.current.mutateAsync({ id: 'f1' }); });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['admin', 'referral-flags'] });
  });

  it('useAdminFraudFlags forwards filters', async () => {
    vi.mocked(svc.getAdminFraudFlags).mockResolvedValue([]);
    const { wrapper } = setup();
    const { result } = renderHook(() => useAdminFraudFlags({ resolved: false, severity: 'high' }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(svc.getAdminFraudFlags).toHaveBeenCalledWith({ resolved: false, severity: 'high' });
  });

  it('usePatchUserRisk invalidates the admin tree', async () => {
    vi.mocked(svc.patchUserRisk).mockResolvedValue({});
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => usePatchUserRisk(), { wrapper });
    await act(async () => { await result.current.mutateAsync({ userId: 'u1', risk: 'blocked' }); });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['admin'] });
  });
});
