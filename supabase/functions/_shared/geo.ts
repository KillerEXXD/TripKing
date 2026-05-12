/**
 * Shared geo helpers for the radius-search query params (`?near_lat=&near_lng=&radius_km=` on the
 * public list endpoints). The actual ST_DWithin happens in the `<table>_in_radius()` SQL functions
 * (migration 015); this just parses + caps the inputs. The radius is capped at MAX_RADIUS_KM so a
 * pathological request can't scan the country.
 */
export const MAX_RADIUS_KM = 100;
/** Drivers whose `current_location_at` is older than this are treated as offline by drivers_in_radius. */
export const DRIVER_LOCATION_STALE_MINUTES = 30;

/** Parse the near-point + radius. Returns null unless ALL of near_lat / near_lng / radius_km are present and valid. */
export function parseNearRadius(url: URL): { lat: number; lng: number; radiusM: number } | null {
  const n = (k: string): number | null => {
    const v = url.searchParams.get(k);
    if (v == null || v.trim() === '') return null;
    const x = Number(v);
    return Number.isFinite(x) ? x : null;
  };
  const lat = n('near_lat');
  const lng = n('near_lng');
  const radiusKm = n('radius_km');
  if (lat == null || lng == null || radiusKm == null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180 || radiusKm <= 0) return null;
  return { lat, lng, radiusM: Math.min(radiusKm, MAX_RADIUS_KM) * 1000 };
}

/** distance_m → km, rounded to 1 dp. */
export const toKm = (m: number): number => Math.round((m / 1000) * 10) / 10;
