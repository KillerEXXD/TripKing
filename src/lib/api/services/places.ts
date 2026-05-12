/** Places service — geocoder search proxy (`GET /places/search`) + find-or-create (`POST /places`). */
import { apiClient } from '@/lib/api/client';
import { searchResultToResolveInput, toApiResolvePlace, transformPlace, transformPlaceSearchResult } from '@/lib/api/transforms/place';
import type { Place, PlaceSearchResult, ResolvePlaceInput } from '@/types';

type Api = Record<string, unknown>;

export interface SearchPlacesParams {
  q: string;
  /** Optional point to bias results toward. */
  near?: { lat: number; lng: number };
  limit?: number;
}

/** `GET /places/search` — server-side proxy to a geocoder, biased to India; does not persist. */
export function searchPlaces({ q, near, limit }: SearchPlacesParams): Promise<PlaceSearchResult[]> {
  const params: Record<string, unknown> = { q };
  if (near) {
    params.near_lat = near.lat;
    params.near_lng = near.lng;
  }
  if (limit) params.limit = limit;
  return apiClient.get<Api[]>('/places/search', params).then((r) => (r.data ?? []).map(transformPlaceSearchResult));
}

/** `POST /places` — find-or-create the stored row for a picked place. */
export function resolvePlace(input: ResolvePlaceInput): Promise<Place> {
  return apiClient.post<Api>('/places', toApiResolvePlace(input)).then((r) => {
    if (r.data == null) throw new Error('places: empty response body');
    return transformPlace(r.data);
  });
}

/** Resolve a search hit straight into its stored `Place` (search hit → `POST /places` → row). */
export function resolveSearchResult(r: PlaceSearchResult, cityId?: string | null): Promise<Place> {
  return resolvePlace(searchResultToResolveInput(r, cityId));
}
