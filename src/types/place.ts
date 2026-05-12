/**
 * Maps-backed locations — the `places` table (migration 011) + the `/places/*` API.
 * Distinct from the curated `CityRow` lookup: a `Place` is a provider-geocoded point
 * with precise `lat`/`lng` (and a PostGIS geography server-side for radius matching).
 */

/** One geocoder result from `GET /places/search` — the API already speaks camelCase here. */
export interface PlaceSearchResult {
  /** `'nominatim' | 'locationiq' | 'geoapify' | 'google' | …` */
  provider: string;
  /** The provider's stable id for this place (null for ad-hoc points). */
  providerPlaceId: string | null;
  /** Short label, e.g. "Katpadi, Vellore". */
  name: string;
  /** Full address line from the geocoder, if any. */
  formattedAddress: string | null;
  state: string | null;
  lat: number;
  lng: number;
}

/** A stored place row (the `places` table), as returned by `POST /places`. */
export interface Place {
  id: string;
  provider: string;
  providerPlaceId: string | null;
  name: string;
  formattedAddress: string | null;
  state: string | null;
  country: string;
  lat: number;
  lng: number;
  /** Optional link to the curated `cities` list, if this point maps to one. */
  cityId: string | null;
  isActive: boolean;
  createdAt: string;
}

/** Body for `POST /places` — find-or-create the stored row for a picked place. */
export interface ResolvePlaceInput {
  provider: string;
  providerPlaceId?: string | null;
  name: string;
  formattedAddress?: string | null;
  state?: string | null;
  lat: number;
  lng: number;
  cityId?: string | null;
}

/**
 * A centre + radius for the `?near_lat=&near_lng=&radius_km=` filters on the public
 * list endpoints (`/trips`, `/vacancies`, `/drivers`). When set, results are
 * restricted to in-radius rows, nearest first, each carrying a `distanceKm`.
 * The server caps the radius at 100 km.
 */
export interface NearRadius {
  lat: number;
  lng: number;
  radiusKm: number;
}
