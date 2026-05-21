import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/lib/api/services/presence', () => ({ getPlatformConfig: vi.fn() }));
import { getPlatformConfig } from '@/lib/api/services/presence';
import { useDispatchAlgorithm } from '@/hooks/usePlatformConfig';

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => vi.clearAllMocks());

describe('useDispatchAlgorithm', () => {
  it('fails safe to manual while loading', () => {
    vi.mocked(getPlatformConfig).mockReturnValue(new Promise(() => {}) as never); // never resolves
    const { result } = renderHook(() => useDispatchAlgorithm(), { wrapper: wrap() });
    expect(result.current).toBe('manual');
  });

  it('reflects auto once the config loads', async () => {
    vi.mocked(getPlatformConfig).mockResolvedValue({ dispatchAlgorithm: 'auto', dispatchOfferSeconds: 60, dispatchOfflineGraceSeconds: 180, dispatchHeartbeatStaleSeconds: 90 });
    const { result } = renderHook(() => useDispatchAlgorithm(), { wrapper: wrap() });
    await waitFor(() => expect(result.current).toBe('auto'));
  });

  it('fails safe to manual on error', async () => {
    vi.mocked(getPlatformConfig).mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useDispatchAlgorithm(), { wrapper: wrap() });
    // stays manual (never throws into the tree)
    await waitFor(() => expect(result.current).toBe('manual'));
  });
});
