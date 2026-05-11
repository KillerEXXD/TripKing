import type { Trip } from '@/types';

const AVG_SPEED_KMH = 52; // realistic Indian highway average

export interface TripTracking {
  /** 0..1 fraction of the route completed (simulated, deterministic per trip) */
  progressFraction: number;
  /** Interpolated current car position */
  currentLat: number;
  currentLng: number;
  /** Whole minutes remaining to reach destination */
  etaMinutes: number;
  /** Human label e.g. "2h 10m" or "45m" or "Arriving" */
  etaLabel: string;
  /** Km left to drive */
  kmRemaining: number;
  /** true = on schedule, false = running late */
  onTime: boolean;
  /** "On time" | "Delayed" */
  statusLabel: string;
  /** Approx total trip duration in minutes (distance / avg speed) */
  totalMinutes: number;
}

/** Deterministic 0..1 hash from a string (so each trip gets a stable pseudo-random value). */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // map to 0..1
  return ((h >>> 0) % 10000) / 10000;
}

/** Linear interpolation between two coords. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function fmtMinutes(min: number): string {
  if (min <= 2) return 'Arriving';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Returns tracking info for an in_progress trip, or null otherwise.
 */
export function getTripTracking(trip: Trip): TripTracking | null {
  if (trip.status !== 'in_progress') return null;

  const totalMinutes = Math.max(15, Math.round((trip.expectedDistanceKm / AVG_SPEED_KMH) * 60));

  // Deterministic "fraction complete" — between 0.15 and 0.85 so it's clearly mid-journey
  const r = hash01(trip.id);
  const progressFraction = 0.15 + r * 0.7;

  const currentLat = lerp(trip.fromCity.lat, trip.toCity.lat, progressFraction);
  const currentLng = lerp(trip.fromCity.lng, trip.toCity.lng, progressFraction);

  const etaMinutes = Math.max(0, Math.round(totalMinutes * (1 - progressFraction)));
  const kmRemaining = Math.round(trip.expectedDistanceKm * (1 - progressFraction));

  // Deterministic delay: ~25% of in_progress trips are "delayed"
  const onTime = hash01(trip.id + ':delay') > 0.25;

  return {
    progressFraction,
    currentLat,
    currentLng,
    etaMinutes,
    etaLabel: fmtMinutes(etaMinutes),
    kmRemaining,
    onTime,
    statusLabel: onTime ? 'On time' : 'Delayed',
    totalMinutes,
  };
}

/** Google Maps deep link for a coordinate (opens native maps app on mobile). */
export function mapsLink(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat.toFixed(5)},${lng.toFixed(5)}`;
}

/** Google Maps directions deep link from current position to destination. */
export function directionsLink(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): string {
  return `https://www.google.com/maps/dir/${fromLat.toFixed(5)},${fromLng.toFixed(5)}/${toLat.toFixed(5)},${toLng.toFixed(5)}`;
}
