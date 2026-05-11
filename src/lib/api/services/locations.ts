/**
 * Location search service.
 *
 * Uses OpenStreetMap Nominatim for the prototype (no API key needed, free,
 * decent India coverage). The shape is identical to what Google Places would
 * return so the swap to Google Places Autocomplete + Place Details (using
 * VITE_GOOGLE_MAPS_API_KEY) is purely a service-layer change later — pages
 * and hooks stay untouched.
 *
 * Mirrors the hudr-pwa service pattern: never call this directly from
 * components; go through the `useLocationSearch` hook.
 *
 * Nominatim usage policy: requires Referer or User-Agent identifying the
 * caller. Browser-issued fetches send Referer automatically — that's the
 * compliance hook here. Don't hammer this from background workers.
 */

export interface LocationResult {
  id: string;
  displayName: string;
  cityName: string;
  state?: string;
  country?: string;
  lat: number;
  lng: number;
}

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';

interface NominatimAddress {
  city?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  county?: string;
  state?: string;
  country?: string;
}

interface NominatimRow {
  place_id: number | string;
  display_name: string;
  name?: string;
  lat: string;
  lon: string;
  address?: NominatimAddress;
}

function pickCityName(row: NominatimRow): string {
  const a = row.address ?? {};
  return (
    a.city || a.town || a.village || a.hamlet || a.county || row.name || row.display_name.split(',')[0]!
  );
}

export async function searchLocations(
  query: string,
  limit = 8,
): Promise<LocationResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  // countrycodes=in keeps results focused on India (drop or change for global)
  const url = `${NOMINATIM_BASE}?q=${encodeURIComponent(q)}&format=jsonv2&addressdetails=1&limit=${limit}&accept-language=en&countrycodes=in`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Location search failed: HTTP ${res.status}`);
  }

  const data = (await res.json()) as NominatimRow[];
  return data.map(
    (row): LocationResult => ({
      id: String(row.place_id),
      displayName: row.display_name,
      cityName: pickCityName(row),
      state: row.address?.state,
      country: row.address?.country,
      lat: parseFloat(row.lat),
      lng: parseFloat(row.lon),
    }),
  );
}
