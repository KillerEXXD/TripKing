import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

vi.mock('@/lib/api/services/passengers');
import * as svc from '@/lib/api/services/passengers';
import { isLookupablePhone, useLookupPassengerByPhone, usePassengers } from '@/hooks/usePassengers';

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => vi.restoreAllMocks());

describe('usePassengers + useLookupPassengerByPhone', () => {
  it('isLookupablePhone returns true only for ≥10 digits', () => {
    expect(isLookupablePhone(undefined)).toBe(false);
    expect(isLookupablePhone('99999')).toBe(false);
    expect(isLookupablePhone('9876543210')).toBe(true);
    expect(isLookupablePhone('+91 98765 43210')).toBe(true);
  });

  it('usePassengers fetches via getPassengers with the supplied params', async () => {
    vi.mocked(svc.getPassengers).mockResolvedValue([{ id: 'p1' }] as never);
    const { result } = renderHook(() => usePassengers({ q: 'Sam' }), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(svc.getPassengers).toHaveBeenCalledWith({ q: 'Sam' });
  });

  it('useLookupPassengerByPhone stays idle for short phones, fires when complete', async () => {
    const w = wrapper();
    renderHook(() => useLookupPassengerByPhone('99999'), { wrapper: w });
    expect(svc.lookupPassengerByPhone).not.toHaveBeenCalled();
    vi.mocked(svc.lookupPassengerByPhone).mockResolvedValue({ id: 'p1' } as never);
    const { result } = renderHook(() => useLookupPassengerByPhone('+91 98765 43210'), { wrapper: w });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(svc.lookupPassengerByPhone).toHaveBeenCalledWith('+91 98765 43210');
  });

  it('useLookupPassengerByPhone keys on the digit-only form so reformatting the same number does not refetch', async () => {
    vi.mocked(svc.lookupPassengerByPhone).mockResolvedValue({ id: 'p1' } as never);
    const w = wrapper();
    const a = renderHook(() => useLookupPassengerByPhone('+91 98765 43210'), { wrapper: w });
    await waitFor(() => expect(a.result.current.isSuccess).toBe(true));
    const callsAfterFirst = vi.mocked(svc.lookupPassengerByPhone).mock.calls.length;
    renderHook(() => useLookupPassengerByPhone('919876543210'), { wrapper: w });
    expect(vi.mocked(svc.lookupPassengerByPhone).mock.calls.length).toBe(callsAfterFirst);
  });
});
