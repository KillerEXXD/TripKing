import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

vi.mock('@/lib/api/services/drivers');
import * as svc from '@/lib/api/services/drivers';
import { useReferral } from '@/hooks/useReferral';

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
  return { qc, wrapper };
}

beforeEach(() => vi.restoreAllMocks());

describe('useReferral', () => {
  it('is disabled when role is undefined', () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useReferral(undefined), { wrapper });
    expect(svc.getMyDriver).not.toHaveBeenCalled();
    expect(svc.getMyAgent).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('driver: fetches getMyDriver and projects code/link/share fields', async () => {
    vi.mocked(svc.getMyDriver).mockResolvedValue({ referralCode: 'ABC12345', referralSummary: { totalReferred: 0, totalEarningsPaise: 0 } } as never);
    const { wrapper } = setup();
    const { result } = renderHook(() => useReferral('driver'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(svc.getMyDriver).toHaveBeenCalled();
    expect(result.current.data?.code).toBe('ABC12345');
    expect(result.current.data?.link).toContain('?ref=ABC12345');
    expect(result.current.data?.whatsappUrl.startsWith('https://wa.me/?text=')).toBe(true);
  });

  it('agent: fetches getMyAgent', async () => {
    vi.mocked(svc.getMyAgent).mockResolvedValue({ referralCode: 'AGENT77' } as never);
    const { wrapper } = setup();
    const { result } = renderHook(() => useReferral('agent'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(svc.getMyAgent).toHaveBeenCalled();
    expect(result.current.data?.code).toBe('AGENT77');
  });

  it('returns undefined data when API has no referralCode yet', async () => {
    vi.mocked(svc.getMyDriver).mockResolvedValue({} as never);
    const { wrapper } = setup();
    const { result } = renderHook(() => useReferral('driver'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
