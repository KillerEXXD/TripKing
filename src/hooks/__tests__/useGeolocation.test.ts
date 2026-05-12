import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGeolocation } from '@/hooks/useGeolocation';

/** jsdom has no `navigator.geolocation`; each test that needs it installs a mock and afterEach removes it. */
function installGeolocation(getCurrentPosition: Geolocation['getCurrentPosition']): void {
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition } });
}
afterEach(() => {
  delete (navigator as { geolocation?: unknown }).geolocation;
});

describe('useGeolocation', () => {
  it('resolves the current position on request()', () => {
    const getCurrentPosition = vi.fn((ok: PositionCallback) => ok({ coords: { latitude: 12.97, longitude: 79.13 } } as GeolocationPosition));
    installGeolocation(getCurrentPosition);
    const { result } = renderHook(() => useGeolocation());
    expect(result.current.position).toBeNull();
    act(() => result.current.request());
    expect(getCurrentPosition).toHaveBeenCalled();
    expect(result.current.position).toEqual({ lat: 12.97, lng: 79.13 });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('surfaces a permission-denied error', () => {
    const getCurrentPosition = vi.fn((_ok: PositionCallback, fail?: PositionErrorCallback) => fail?.({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError));
    installGeolocation(getCurrentPosition);
    const { result } = renderHook(() => useGeolocation());
    act(() => result.current.request());
    expect(result.current.position).toBeNull();
    expect(result.current.error).toMatch(/location is off/i);
  });

  it('errors gracefully when geolocation is unavailable on the device', () => {
    // navigator.geolocation is undefined here (jsdom default)
    const { result } = renderHook(() => useGeolocation());
    act(() => result.current.request());
    expect(result.current.error).toMatch(/isn't available/i);
  });

  it('clear() forgets the position and any error', () => {
    installGeolocation(vi.fn((ok: PositionCallback) => ok({ coords: { latitude: 1, longitude: 2 } } as GeolocationPosition)));
    const { result } = renderHook(() => useGeolocation());
    act(() => result.current.request());
    expect(result.current.position).not.toBeNull();
    act(() => result.current.clear());
    expect(result.current.position).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
