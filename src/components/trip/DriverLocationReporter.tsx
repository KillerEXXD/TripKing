import { useEffect, useRef } from 'react';
import { useUpdateDriverLocation } from '@/hooks/useDrivers';

/** Don't hammer the API — at most one position push every 25 s. */
const MIN_INTERVAL_MS = 25_000;

/**
 * Renders nothing — while `active`, watches the device's geolocation and pushes
 * the driver's position to `PATCH /drivers/:id/location` (at most every 25 s) so
 * the trip poster and passenger see the car move on the live-tracking panel.
 * Mounted on the trip-detail screen for the assigned driver while the trip is
 * `in_progress`; geolocation permission is requested by the browser on first use.
 */
export function DriverLocationReporter({ driverId, active }: { driverId: string | undefined; active: boolean }) {
  const update = useUpdateDriverLocation();
  const lastSentRef = useRef(0);
  // Keep the mutation object out of the effect deps (it's recreated each render).
  const mutateRef = useRef(update.mutate);
  mutateRef.current = update.mutate;

  useEffect(() => {
    if (!active || !driverId || typeof navigator === 'undefined' || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastSentRef.current < MIN_INTERVAL_MS) return;
        lastSentRef.current = now;
        mutateRef.current({ id: driverId, input: { lat: pos.coords.latitude, lng: pos.coords.longitude } });
      },
      () => {
        /* permission denied / unavailable — silently stop reporting */
      },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [active, driverId]);

  return null;
}

export default DriverLocationReporter;
