import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * shadcn/ui standard `cn()` helper — merges Tailwind classes intelligently.
 * Mirrors `hudr-pwa/src/lib/utils.ts`.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format INR amount with ₹ prefix and Indian-locale digit grouping.
 * formatINR(1234567) → "₹12,34,567"
 */
export function formatINR(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

/**
 * Pretty distance: 140 → "140 km"
 */
export function formatKm(km: number): string {
  return `${km.toLocaleString('en-IN')} km`;
}

/**
 * Star rating display: 4.85 → "★ 4.9"
 */
export function formatRating(avg: number): string {
  return `★ ${avg.toFixed(1)}`;
}

/**
 * Time of day in the user's locale, hour + minute only: a Date at 18:46 → "6:46 pm".
 */
export function formatClockTime(d: Date): string {
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}

/**
 * Short calendar date without the year: a Date on 12 May → "12 May".
 */
export function formatShortDate(d: Date): string {
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isValidUUID(value: string | null | undefined): value is string {
  return !!value && UUID_RE.test(value);
}

/**
 * Pickup-time line used across trip cards / detail / book screens:
 * "2026-05-14T08:30:00Z" → "Wed, 14 May, 2:00 pm". Falls back to the raw string when unparseable.
 */
export function formatPickupTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

/**
 * First-name from a full name: "Ravi Kumar" → "Ravi". Empty string for nullish input.
 */
export function getFirstName(full: string | undefined | null): string {
  if (!full) return '';
  return full.trim().split(/\s+/)[0] ?? '';
}

/**
 * Initials from a full name: "Ravi Kumar" → "RK"
 */
export function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/**
 * Haversine distance in km between two lat/lng points.
 * For the prototype: rough-bird-flight estimate when no Distance Matrix call available.
 */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371; // earth radius km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Pick the curated city closest to a (lat, lng) point by straight-line distance.
 * Returns `undefined` if the city list is empty or if no city has lat/lng on file.
 * Used by `<NearCityPicker>` to seed the near-city pill from the browser's geolocation.
 */
export function nearestCity<C extends { id: string; lat: number; lng: number }>(
  point: { lat: number; lng: number },
  cities: readonly C[],
): C | undefined {
  let best: { city: C; km: number } | undefined;
  for (const c of cities) {
    if (typeof c.lat !== 'number' || typeof c.lng !== 'number') continue;
    const km = haversineKm(point.lat, point.lng, c.lat, c.lng);
    if (!best || km < best.km) best = { city: c, km };
  }
  return best?.city;
}

/** Rough average road speed (km/h) used by `etaLabel` when turning km-remaining into an ETA. */
export const ASSUMED_DRIVING_KMH = 40;

/**
 * "~12 min" / "~1 hr" / "~2 hr 15 min" — a coarse ETA from a straight-line km figure.
 * Used on the trip-tracking card + the agent's in-progress trip cards. The 40 km/h
 * assumption is intentionally pessimistic for mixed-traffic Indian highway driving.
 */
export function etaLabel(km: number): string {
  const mins = Math.max(1, Math.round((km / ASSUMED_DRIVING_KMH) * 60));
  if (mins < 60) return `~${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `~${h} hr` : `~${h} hr ${m} min`;
}
