import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

vi.mock('@/lib/api/services/reviews');
import * as svc from '@/lib/api/services/reviews';
import { useCreateReview, useDriverReviews, useFlaggedReviews, useModerateReview, useReportReview, useReviews } from '@/hooks/useReviews';

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidate = vi.spyOn(qc, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
  return { qc, invalidate, wrapper };
}

beforeEach(() => vi.restoreAllMocks());

describe('useReviews hooks', () => {
  it('useReviews + useFlaggedReviews fetch via the reviews service', async () => {
    vi.mocked(svc.getReviews).mockResolvedValue([{ id: 'r1' }] as never);
    const { wrapper } = setup();
    const { result } = renderHook(() => useReviews(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const flagged = renderHook(() => useFlaggedReviews(), { wrapper });
    await waitFor(() => expect(flagged.result.current.isSuccess).toBe(true));
    expect(svc.getReviews).toHaveBeenCalledWith({ flagged: true });
  });

  it('useDriverReviews is disabled without a rateeUserId', () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useDriverReviews(undefined), { wrapper });
    expect(svc.getReviews).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('useCreateReview invalidates the reviews list (+ driver cache when rateeUserId is set)', async () => {
    vi.mocked(svc.createReview).mockResolvedValue({ id: 'r1', rateeUserId: 'u9' } as never);
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useCreateReview(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ rateeUserId: 'u9' } as never);
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['reviews'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['driver', 'u9'] });
  });

  it('useReportReview + useModerateReview invalidate the reviews cache', async () => {
    vi.mocked(svc.reportReview).mockResolvedValue({ id: 'r1' } as never);
    vi.mocked(svc.moderateReview).mockResolvedValue({ id: 'r1' } as never);
    const { invalidate, wrapper } = setup();
    const report = renderHook(() => useReportReview(), { wrapper });
    await act(async () => {
      await report.result.current.mutateAsync({ id: 'r1' });
    });
    const mod = renderHook(() => useModerateReview(), { wrapper });
    await act(async () => {
      await mod.result.current.mutateAsync({ id: 'r1', clearFlag: true });
    });
    expect(svc.moderateReview).toHaveBeenCalledWith('r1', { clearFlag: true });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['reviews'] });
  });
});
