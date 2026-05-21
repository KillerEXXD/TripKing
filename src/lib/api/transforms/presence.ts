import type { DriverPresence, PlatformConfig, PresenceStatus } from '@/types';

type Api = Record<string, unknown>;

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/**
 * The driver's own presence. Lenient on purpose — every field but `status` is
 * nullable, and `status` fails safe to 'offline' (never throws on the driver's
 * own surface). The global token is not part of the API shape at all.
 */
export function transformPresence(api: Api): DriverPresence {
  const s = api.status;
  const status: PresenceStatus = s === 'online' || s === 'grace' ? s : 'offline';
  return {
    status,
    isOnline: api.is_online === true,
    onlineSince: str(api.online_since),
    lastHeartbeatAt: str(api.last_heartbeat_at),
    graceExpiresAt: str(api.grace_expires_at),
    vehicleId: str(api.vehicle_id),
    busyTripId: str(api.busy_trip_id),
    currentLat: num(api.current_lat),
    currentLng: num(api.current_lng),
  };
}

/**
 * Public platform config. `dispatchAlgorithm` fails safe to 'manual' (the
 * no-behaviour-change default) when absent/invalid; numbers fall back to the
 * documented defaults so the UI always has sane values.
 */
export function transformPlatformConfig(api: Api): PlatformConfig {
  return {
    dispatchAlgorithm: api.dispatch_algorithm === 'auto' ? 'auto' : 'manual',
    dispatchOfferSeconds: num(api.dispatch_offer_seconds) ?? 60,
    dispatchOfflineGraceSeconds: num(api.dispatch_offline_grace_seconds) ?? 180,
    dispatchHeartbeatStaleSeconds: num(api.dispatch_heartbeat_stale_seconds) ?? 90,
  };
}
