import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useTrip, useTripByOtp } from '@/hooks/useTrips';
import type { Trip } from '@/types';

vi.mock('@/lib/api/services/trips');
import { getTrip, getTripByOtp } from '@/lib/api/services/trips';

const trip = (over: Partial<Trip>): Trip => ({ id: 't1', ...over }) as unknown as Trip;

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
}
/** Advance fake timers (and flush the promises that resolve in between), wrapped in `act`. */
async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('useTrip — live polling', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('refetches every ~5s while the trip is in_progress, then stops once it completes', async () => {
    vi.mocked(getTrip).mockResolvedValue(trip({ status: 'in_progress' }));
    const { result } = renderHook(() => useTrip('t1'), { wrapper: wrapper() });
    await tick(0);
    expect(getTrip).toHaveBeenCalledTimes(1);
    expect(result.current.data?.status).toBe('in_progress');

    await tick(5_000);
    expect(getTrip).toHaveBeenCalledTimes(2);
    await tick(5_000);
    expect(getTrip).toHaveBeenCalledTimes(3);

    // the trip finishes — the next poll returns `completed`; the interval (which keys off
    // the last result's status) then clears, so no further polls happen.
    vi.mocked(getTrip).mockResolvedValue(trip({ status: 'completed' }));
    await tick(5_000);
    expect(getTrip).toHaveBeenCalledTimes(4);

    await tick(60_000);
    expect(getTrip).toHaveBeenCalledTimes(4);
  });

  it('polls every ~15s for an assigned trip (driver awaiting OTP)', async () => {
    vi.mocked(getTrip).mockResolvedValue(trip({ status: 'assigned' }));
    renderHook(() => useTrip('t1'), { wrapper: wrapper() });
    await tick(0);
    expect(getTrip).toHaveBeenCalledTimes(1);
    await tick(15_000);
    expect(getTrip).toHaveBeenCalledTimes(2);
  });

  it('is disabled when no id is given', () => {
    const { result } = renderHook(() => useTrip(undefined), { wrapper: wrapper() });
    expect(getTrip).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('useTripByOtp — passenger-portal polling', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('refetches every ~12s while assigned/in_progress, then stops once completed', async () => {
    vi.mocked(getTripByOtp).mockResolvedValue(trip({ status: 'assigned' }));
    renderHook(() => useTripByOtp('654321'), { wrapper: wrapper() });
    await tick(0);
    expect(getTripByOtp).toHaveBeenCalledTimes(1);

    await tick(12_000);
    expect(getTripByOtp).toHaveBeenCalledTimes(2);

    vi.mocked(getTripByOtp).mockResolvedValue(trip({ status: 'in_progress' }));
    await tick(12_000);
    expect(getTripByOtp).toHaveBeenCalledTimes(3);

    vi.mocked(getTripByOtp).mockResolvedValue(trip({ status: 'completed' }));
    await tick(12_000);
    expect(getTripByOtp).toHaveBeenCalledTimes(4);

    await tick(60_000);
    expect(getTripByOtp).toHaveBeenCalledTimes(4);
  });

  it('does not retry on a lookup miss and surfaces the error', async () => {
    vi.mocked(getTripByOtp).mockRejectedValue(new Error('OTP not found'));
    const { result } = renderHook(() => useTripByOtp('000000'), { wrapper: wrapper() });
    await tick(0);
    expect(getTripByOtp).toHaveBeenCalledTimes(1);
    expect(result.current.isError).toBe(true);
    await tick(60_000);
    expect(getTripByOtp).toHaveBeenCalledTimes(1);
  });

  it('is disabled without an otp', () => {
    const { result } = renderHook(() => useTripByOtp(undefined), { wrapper: wrapper() });
    expect(getTripByOtp).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });
});
