import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

vi.mock('@/lib/api/services/videoVerifications');
import * as svc from '@/lib/api/services/videoVerifications';
import {
  useAvailableVideoSlots,
  useBookVideoCall,
  useFinalizeVideoCall,
  useMarkVideoCallNoShow,
  useVideoVerification,
} from '@/hooks/useVideoVerification';

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidate = vi.spyOn(qc, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
  return { qc, invalidate, wrapper };
}

beforeEach(() => vi.restoreAllMocks());

describe('useVideoVerification hooks', () => {
  it('useAvailableVideoSlots respects the enabled flag', () => {
    const { wrapper } = setup();
    renderHook(() => useAvailableVideoSlots(false), { wrapper });
    expect(svc.getAvailableVideoSlots).not.toHaveBeenCalled();
  });

  it('useVideoVerification is disabled without an id', () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useVideoVerification(undefined), { wrapper });
    expect(svc.getVideoVerification).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('useBookVideoCall invalidates video-verifications + the subject (driver/agent) caches', async () => {
    vi.mocked(svc.bookVideoCall).mockResolvedValue({ id: 'vv1' } as never);
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useBookVideoCall(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('2026-06-01T10:00:00Z');
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['video-verifications'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['driver', 'me'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['agent', 'me'] });
  });

  it('useFinalizeVideoCall invalidates driver/agent caches keyed on the subject returned by the API', async () => {
    vi.mocked(svc.finalizeVideoCall).mockResolvedValue({ id: 'vv1', driverId: 'd1', managerId: null } as never);
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useFinalizeVideoCall(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 'vv1', input: {} as never });
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['video-verification', 'vv1'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['driver', 'd1'] });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['agent', null] });
  });

  it('useMarkVideoCallNoShow invalidates the video-verifications cache', async () => {
    vi.mocked(svc.markVideoCallNoShow).mockResolvedValue({ id: 'vv1' } as never);
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useMarkVideoCallNoShow(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('vv1');
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['video-verifications'] });
  });
});
