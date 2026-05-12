/** One-shot browser geolocation — powers the "📍 near me" feed filters. (No watching.) */
import { useCallback, useState } from 'react';

export interface UseGeolocationReturn {
  /** The last fetched position, or `null` until `request()` resolves one. */
  position: { lat: number; lng: number } | null;
  loading: boolean;
  error: string | null;
  /** Prompt for + fetch the current position into `position`. */
  request: () => void;
  /** Forget the position and clear any error. */
  clear: () => void;
}

/**
 * `request()` asks the OS/browser for the current position (prompting the user
 * the first time) and lands the result in `position`. On failure — denied,
 * timed out, or geolocation unavailable on the device — `error` is set instead.
 */
export function useGeolocation(): UseGeolocationReturn {
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = useCallback(() => {
    setError(null);
    setLoading(true);
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setLoading(false);
        },
        (err) => {
          setLoading(false);
          setError(err.code === err.PERMISSION_DENIED ? 'Location is off — turn it on to browse nearby.' : "Couldn't get your location — try again.");
        },
        { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
      );
    } catch {
      setLoading(false);
      setError("Location isn't available on this device.");
    }
  }, []);

  const clear = useCallback(() => {
    setPosition(null);
    setError(null);
  }, []);

  return { position, loading, error, request, clear };
}
