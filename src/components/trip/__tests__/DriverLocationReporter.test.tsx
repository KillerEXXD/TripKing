import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { DriverLocationReporter } from '@/components/trip/DriverLocationReporter';

// The component pushes positions through this mutation hook — stub it with a spy.
const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock('@/hooks/useDrivers', () => ({ useUpdateDriverLocation: () => ({ mutate }) }));

type SuccessCb = (pos: { coords: { latitude: number; longitude: number } }) => void;
type ErrorCb = (err: unknown) => void;

const WATCH_ID = 7;
let watchPosition: ReturnType<typeof vi.fn>;
let clearWatch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mutate.mockClear();
  watchPosition = vi.fn().mockReturnValue(WATCH_ID);
  clearWatch = vi.fn();
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { watchPosition, clearWatch, getCurrentPosition: vi.fn() },
  });
});
afterEach(() => {
  vi.useRealTimers();
});

function lastWatch() {
  const calls = watchPosition.mock.calls;
  const call = (calls.length > 0 ? calls[calls.length - 1] : undefined) as [SuccessCb, ErrorCb, PositionOptions] | undefined;
  if (!call) throw new Error('watchPosition was not called');
  return { success: call[0], error: call[1], options: call[2] };
}

describe('<DriverLocationReporter>', () => {
  it('does not watch geolocation when inactive, and renders nothing', () => {
    const { container } = render(<DriverLocationReporter driverId="d1" active={false} />);
    expect(watchPosition).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });

  it('does not watch geolocation without a driver id', () => {
    render(<DriverLocationReporter driverId={undefined} active />);
    expect(watchPosition).not.toHaveBeenCalled();
  });

  it('watches geolocation with high-accuracy options and pushes the first fix when active', () => {
    render(<DriverLocationReporter driverId="d1" active />);
    expect(watchPosition).toHaveBeenCalledTimes(1);
    expect(lastWatch().options).toEqual({ enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 });
    lastWatch().success({ coords: { latitude: 13.05, longitude: 80.2 } });
    expect(mutate).toHaveBeenCalledWith({ id: 'd1', input: { lat: 13.05, lng: 80.2 } });
  });

  it('throttles pushes to at most one per 25s', () => {
    vi.useFakeTimers();
    render(<DriverLocationReporter driverId="d1" active />);
    const { success } = lastWatch();
    success({ coords: { latitude: 13.0, longitude: 80.0 } });
    success({ coords: { latitude: 13.1, longitude: 80.1 } }); // arrives immediately after — dropped
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenLastCalledWith({ id: 'd1', input: { lat: 13.0, lng: 80.0 } });
    vi.advanceTimersByTime(26_000);
    success({ coords: { latitude: 13.2, longitude: 80.2 } });
    expect(mutate).toHaveBeenCalledTimes(2);
    expect(mutate).toHaveBeenLastCalledWith({ id: 'd1', input: { lat: 13.2, lng: 80.2 } });
  });

  it('silently ignores a geolocation error (permission denied / unavailable)', () => {
    render(<DriverLocationReporter driverId="d1" active />);
    expect(() => lastWatch().error({ code: 1, message: 'denied' })).not.toThrow();
    expect(mutate).not.toHaveBeenCalled();
  });

  it('clears the watch when it stops being active', () => {
    const { rerender } = render(<DriverLocationReporter driverId="d1" active />);
    rerender(<DriverLocationReporter driverId="d1" active={false} />);
    expect(clearWatch).toHaveBeenCalledWith(WATCH_ID);
  });

  it('clears the watch on unmount', () => {
    const { unmount } = render(<DriverLocationReporter driverId="d1" active />);
    unmount();
    expect(clearWatch).toHaveBeenCalledWith(WATCH_ID);
  });
});
