import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getPresence, goOffline, goOnline, sendHeartbeat } from '@/lib/api/services/presence';
import type { DriverPresence, GoOnlineInput } from '@/types';

const PRESENCE_KEY = ['presence'] as const;

/** The signed-in driver's own presence. Polls while the surface is mounted. */
export function usePresence(enabled = true) {
  return useQuery({ queryKey: PRESENCE_KEY, queryFn: getPresence, enabled, staleTime: 10_000, refetchInterval: enabled ? 10_000 : false });
}

export function useGoOnline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: GoOnlineInput) => goOnline(input),
    onSuccess: (data: DriverPresence) => {
      qc.setQueryData(PRESENCE_KEY, data);
      void qc.invalidateQueries({ queryKey: PRESENCE_KEY });
    },
  });
}

export function useGoOffline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => goOffline(),
    onSuccess: (data: DriverPresence) => {
      qc.setQueryData(PRESENCE_KEY, data);
      void qc.invalidateQueries({ queryKey: PRESENCE_KEY });
    },
  });
}

/**
 * Fire-and-forget GPS heartbeat while `active`. Uses a getCurrentPosition tick on
 * an interval (battery-friendly; foreground-only — paused when the tab is hidden).
 * Best-effort: errors are swallowed so a transient GPS/permission blip never
 * surfaces a toast. Native background GPS is a later (native-wrapper) concern.
 */
export function useHeartbeat(active: boolean, intervalMs = 30_000): void {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !navigator.geolocation) return;
    let cancelled = false;
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!cancelled) void sendHeartbeat(pos.coords.latitude, pos.coords.longitude).catch(() => {});
        },
        () => {},
        { enableHighAccuracy: false, timeout: 10_000, maximumAge: 30_000 },
      );
    };
    tick();
    const id = window.setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [active, intervalMs]);
}
