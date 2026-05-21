import type { DispatchAlgorithm } from './adminConfig';

/** Derived presence state (server-computed; the driver never sees their global token). */
export type PresenceStatus = 'online' | 'grace' | 'offline';

/** A driver's own presence (the only presence a client ever reads). */
export interface DriverPresence {
  status: PresenceStatus;
  isOnline: boolean;
  onlineSince: string | null;
  lastHeartbeatAt: string | null;
  /** When set + in the future, the driver is in the grace window (keeps their place). */
  graceExpiresAt: string | null;
  vehicleId: string | null;
  /** Non-null while on an accepted/in-progress trip (out of the queue). */
  busyTripId: string | null;
  currentLat: number | null;
  currentLng: number | null;
}

export interface GoOnlineInput {
  lat: number;
  lng: number;
  vehicleId?: string | null;
}

/** Public, non-sensitive platform config (from GET /config). */
export interface PlatformConfig {
  dispatchAlgorithm: DispatchAlgorithm;
  dispatchOfferSeconds: number;
  dispatchOfflineGraceSeconds: number;
  dispatchHeartbeatStaleSeconds: number;
}
