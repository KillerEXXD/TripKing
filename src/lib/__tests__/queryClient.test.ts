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
  it('uses the spec defaults — staleTime live (30s) so new hooks fail safe to fresh data, gcTime 30m, no refetch-on-focus, retry 1', () => {
    const q = queryClient.getDefaultOptions().queries;
    // The default is the LIVE tier (30s), not the master tier (15min). Reference/lookup hooks
    // must opt UP explicitly to `STALE.master` — silently inheriting a 15min stale window for
    // a live query is the regression this assertion guards against.
    expect(q?.staleTime).toBe(STALE.live);
    expect(q?.staleTime).toBe(30_000);
    expect(q?.gcTime).toBe(30 * 60_000);
    expect(q?.refetchOnWindowFocus).toBe(false);
    expect(q?.retry).toBe(1);
  });

  it('exposes per-resource staleTime tiers', () => {
    expect(STALE.immutable).toBe(Infinity);
    expect(STALE.live).toBe(30_000);
    // Bumped 5min → 15min in Phase 5 once server-side withCache invalidates admin:* on every write.
    expect(STALE.master).toBe(15 * 60_000);
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

  it('does not report expected user errors (401 / 403 / 404 / 409 / 422 / 429)', async () => {
    await queryClient.fetchQuery({ queryKey: ['driver', 'me'], queryFn: () => Promise.reject(new ApiError('not found', 404)), retry: false }).catch(() => undefined);
    await queryClient.fetchQuery({ queryKey: ['me'], queryFn: () => Promise.reject(new ApiError('expired', 401)), retry: false }).catch(() => undefined);
    // 403: e.g. driver opens /trips/:id/applicants for a trip they didn't post — UI gating issue, not a bug.
    await queryClient.fetchQuery({ queryKey: ['applicants'], queryFn: () => Promise.reject(new ApiError('Only the trip poster can see applicants', 403)), retry: false }).catch(() => undefined);
    // 409: e.g. "You already have a video call scheduled" / "vacancy limit reached" — user-correctable, not a bug.
    await queryClient.fetchQuery({ queryKey: ['video-call'], queryFn: () => Promise.reject(new ApiError('already scheduled', 409)), retry: false }).catch(() => undefined);
    // 422: server-side validation rejected the body — user input issue, surface to user via toast, not Sentry.
    await queryClient.fetchQuery({ queryKey: ['post-trip'], queryFn: () => Promise.reject(new ApiError('validation failed', 422)), retry: false }).catch(() => undefined);
    // 429: rate-limited — the user is going too fast, not a bug.
    await queryClient.fetchQuery({ queryKey: ['otp'], queryFn: () => Promise.reject(new ApiError('slow down', 429)), retry: false }).catch(() => undefined);
    await flush();
    expect(captureDataError).not.toHaveBeenCalled();
  });

  it('a failing mutation is reported, with the feature derived from the mutation key', async () => {
    const mc = queryClient.getMutationCache();
    const mutation = mc.build<unknown, ApiError, void, unknown>(queryClient, {
      mutationKey: ['postTrip'],
      // 500 (not 422) so it falls outside the user-error filter and reaches Sentry.
      mutationFn: () => Promise.reject(new ApiError('rejected', 500)),
    });
    await mutation.execute(undefined).catch(() => undefined);
    await flush();
    expect(captureDataError).toHaveBeenCalledWith('mutation:postTrip', expect.any(ApiError), { status: 500 });
  });
});
