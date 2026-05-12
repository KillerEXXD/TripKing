import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/sentry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/sentry')>();
  return { ...actual, captureDataError: vi.fn() };
});
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() } }));

import { queryClient, STALE } from '@/lib/queryClient';
import { captureDataError, markReported } from '@/lib/sentry';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/client';

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

describe('queryClient — defaults', () => {
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

describe('queryClient — global error funnel', () => {
  beforeEach(() => {
    queryClient.clear();
    vi.clearAllMocks();
  });

  it('a failing query is reported once to Sentry, tagged by its query key, without a toast', async () => {
    await queryClient.fetchQuery({ queryKey: ['trips', { page: 1 }], queryFn: () => Promise.reject(new ApiError('boom', 500)), retry: false }).catch(() => undefined);
    await flush();
    expect(captureDataError).toHaveBeenCalledTimes(1);
    expect(captureDataError).toHaveBeenCalledWith('query:trips', expect.any(ApiError), { status: 500 });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('a query with meta.toastOnError shows a friendly toast', async () => {
    await queryClient
      .fetchQuery({ queryKey: ['vacancies'], queryFn: () => Promise.reject(new ApiError('Internal', 503)), retry: false, meta: { toastOnError: true } })
      .catch(() => undefined);
    await flush();
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/something went wrong on our side/i));
  });

  it('a query with meta.silent is neither reported nor toasted', async () => {
    await queryClient.fetchQuery({ queryKey: ['heartbeat'], queryFn: () => Promise.reject(new ApiError('x', 500)), retry: false, meta: { silent: true } }).catch(() => undefined);
    await flush();
    expect(captureDataError).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('does not re-report an error a prior layer already reported', async () => {
    const err = new ApiError('already up there', 500);
    markReported(err);
    await queryClient.fetchQuery({ queryKey: ['drivers'], queryFn: () => Promise.reject(err), retry: false }).catch(() => undefined);
    await flush();
    expect(captureDataError).not.toHaveBeenCalled();
  });

  it('does not report expected 401 / 404 user errors', async () => {
    await queryClient.fetchQuery({ queryKey: ['driver', 'me'], queryFn: () => Promise.reject(new ApiError('not found', 404)), retry: false }).catch(() => undefined);
    await queryClient.fetchQuery({ queryKey: ['me'], queryFn: () => Promise.reject(new ApiError('expired', 401)), retry: false }).catch(() => undefined);
    await flush();
    expect(captureDataError).not.toHaveBeenCalled();
  });

  it('a failing mutation is reported, with the feature derived from the mutation key', async () => {
    const mc = queryClient.getMutationCache();
    const mutation = mc.build<unknown, ApiError, void, unknown>(queryClient, {
      mutationKey: ['postTrip'],
      mutationFn: () => Promise.reject(new ApiError('rejected', 422)),
    });
    await mutation.execute(undefined).catch(() => undefined);
    await flush();
    expect(captureDataError).toHaveBeenCalledWith('mutation:postTrip', expect.any(ApiError), { status: 422 });
  });
});
