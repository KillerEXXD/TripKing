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
