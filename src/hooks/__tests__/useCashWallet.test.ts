import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

vi.mock('@/lib/api/services/wallet');
import * as svc from '@/lib/api/services/wallet';
import { useCashWallet, useCashWalletLedger, useInitiateTopup, useVerifyTopup } from '@/hooks/useCashWallet';

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidate = vi.spyOn(qc, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
  return { qc, invalidate, wrapper };
}

beforeEach(() => vi.restoreAllMocks());

describe('useCashWallet', () => {
  it('useCashWallet fetches via getWallet under ["wallet"]', async () => {
    vi.mocked(svc.getWallet).mockResolvedValue({ walletId: 'w1', balance: { promoPaise: 0, transferredPaise: 0, cashPaise: 0, totalPaise: 0 }, recentLedger: [] } as never);
    const { qc, wrapper } = setup();
    const { result } = renderHook(() => useCashWallet(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(qc.getQueryData(['wallet'])).toEqual({ walletId: 'w1', balance: { promoPaise: 0, transferredPaise: 0, cashPaise: 0, totalPaise: 0 }, recentLedger: [] });
  });

  it('useCashWalletLedger keys by params', async () => {
    vi.mocked(svc.getWalletLedger).mockResolvedValue([] as never);
    const { wrapper } = setup();
    const { result } = renderHook(() => useCashWalletLedger({ limit: 50 }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(svc.getWalletLedger).toHaveBeenCalledWith({ limit: 50 });
  });

  it('useInitiateTopup calls the service', async () => {
    vi.mocked(svc.initiateTopup).mockResolvedValue({ topupId: 't1', orderId: 'o', amountPaise: 50000, razorpayKeyId: '', stubbed: true } as never);
    const { wrapper } = setup();
    const { result } = renderHook(() => useInitiateTopup(), { wrapper });
    await act(async () => { await result.current.mutateAsync({ amountPaise: 50000 }); });
    expect(svc.initiateTopup).toHaveBeenCalledWith({ amountPaise: 50000 });
  });

  it('useVerifyTopup invalidates ["wallet"] on success', async () => {
    vi.mocked(svc.verifyTopup).mockResolvedValue({ topupId: 't1', status: 'succeeded' } as never);
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useVerifyTopup(), { wrapper });
    await act(async () => { await result.current.mutateAsync({ topupId: 't1' }); });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['wallet'] });
  });
});
