import { describe, it, expect } from 'vitest';
import { queryClient, STALE } from '@/lib/queryClient';

describe('queryClient', () => {
  it('uses the spec defaults — staleTime 5m, gcTime 30m, no refetch-on-focus, retry 1', () => {
    const q = queryClient.getDefaultOptions().queries;
    expect(q?.staleTime).toBe(5 * 60_000);
    expect(q?.gcTime).toBe(30 * 60_000);
    expect(q?.refetchOnWindowFocus).toBe(false);
    expect(q?.retry).toBe(1);
  });

  it('exposes per-resource staleTime tiers', () => {
    expect(STALE.immutable).toBe(Infinity);
    expect(STALE.live).toBe(30_000);
    expect(STALE.master).toBe(5 * 60_000);
    expect(STALE.profile).toBe(60_000);
  });
});
