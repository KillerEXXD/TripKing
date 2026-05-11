/**
 * Pure-function alert matching logic.
 *
 * Used by:
 *  - useAlertMatches() hook to compute live match counts on the Alerts list
 *  - AlertDetailPage to render the matching-trips view
 *  - In production, an equivalent server-side function will run on every
 *    new trip insert + push notifications to subscribed users. The shape
 *    of the rules below is the contract.
 */

import { haversineKm } from '@/lib/utils';
import type { Trip } from '@/types';
import type { LocationValue } from '@/components/location/LocationSearchPanel';

export interface UIAlert {
  id: string;
  /** Optional user-given label. Falls back to "From → To" string. */
  name?: string;
  from: LocationValue;
  fromRadiusKm: number;
  /** null = "any destination" */
  to: LocationValue | null;
  toRadiusKm: number | null;
  /** ISO datetime — earliest trip pickup the driver wants to see */
  pickupFrom: string;
  /** ISO datetime — latest trip pickup. Past this, the alert auto-expires. */
  pickupUntil: string;
  /** Optional rate floor (₹/km). null = no floor. */
  minRatePerKm: number | null;
  isPaused: boolean;
  createdAt: string;
}

export type AlertStatus = 'active' | 'paused' | 'expired';

export function getAlertStatus(alert: UIAlert, now: Date = new Date()): AlertStatus {
  if (alert.isPaused) return 'paused';
  if (new Date(alert.pickupUntil).getTime() < now.getTime()) return 'expired';
  return 'active';
}

export function alertDisplayName(alert: UIAlert): string {
  if (alert.name && alert.name.trim()) return alert.name.trim();
  return `${alert.from.name} → ${alert.to ? alert.to.name : 'anywhere'}`;
}

interface MatchOptions {
  /** Override "now" for deterministic testing. */
  now?: Date;
  /** Skip the time-window check (used to show what *would* match if the alert were extended). */
  ignoreWindow?: boolean;
}

/**
 * Does this trip match the alert?
 *
 * A trip matches if ALL hold:
 *  1. Trip's `from` lies within `fromRadiusKm` of alert's `from` (haversine).
 *  2. If alert has a `to`: trip's `to` lies within `toRadiusKm` of alert's `to`.
 *     (alert.to == null means "any destination" — skip this check.)
 *  3. Trip's `pickupDateTime` is within [`pickupFrom`, `pickupUntil`].
 *  4. If alert has `minRatePerKm`: trip's `ratePerKm >= minRatePerKm`.
 *  5. Trip is in an applyable status (open or has_applicants).
 */
export function tripMatchesAlert(
  trip: Trip,
  alert: UIAlert,
  opts: MatchOptions = {},
): boolean {
  if (trip.status !== 'open' && trip.status !== 'has_applicants') return false;

  // 1. From radius
  const fromKm = haversineKm(
    trip.fromCity.lat,
    trip.fromCity.lng,
    alert.from.lat,
    alert.from.lng,
  );
  if (fromKm > alert.fromRadiusKm) return false;

  // 2. To radius (optional)
  if (alert.to && alert.toRadiusKm != null) {
    const toKm = haversineKm(
      trip.toCity.lat,
      trip.toCity.lng,
      alert.to.lat,
      alert.to.lng,
    );
    if (toKm > alert.toRadiusKm) return false;
  }

  // 3. Time window
  if (!opts.ignoreWindow) {
    const pickup = new Date(trip.pickupDateTime).getTime();
    const winFrom = new Date(alert.pickupFrom).getTime();
    const winUntil = new Date(alert.pickupUntil).getTime();
    if (pickup < winFrom || pickup > winUntil) return false;
  }

  // 4. Rate floor
  if (alert.minRatePerKm != null && trip.ratePerKm < alert.minRatePerKm) {
    return false;
  }

  return true;
}

export function findMatches(alert: UIAlert, trips: Trip[], opts: MatchOptions = {}): Trip[] {
  return trips.filter((t) => tripMatchesAlert(t, alert, opts));
}

/**
 * Tiny ID generator suitable for prototype state. Production would use UUID v4
 * via the DB default.
 */
export function newAlertId(): string {
  return 'a-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36);
}
