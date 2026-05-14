/**
 * Place transforms — strict (throw on missing required fields), mirroring the other
 * `*TransformError` patterns. `GET /places/search` already speaks camelCase, so
 * `transformPlaceSearchResult` is mostly validation; the stored `places` row from
 * `POST /places` is `snake_case`, so `transformPlace` is the `snake_case` → `camelCase` bridge.
 */
import { ApiTransformError } from '@/lib/api/transforms/base';
import type { Place, PlaceSearchResult, ResolvePlaceInput } from '@/types';

export type PlaceTransformErrorCode = 'MISSING_ID' | 'MISSING_NAME' | 'MISSING_PROVIDER' | 'BAD_COORDS';

export class PlaceTransformError extends ApiTransformError<PlaceTransformErrorCode> {}

type Api = Record<string, unknown>;

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}
function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}
function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}
function reqStr(v: unknown, code: PlaceTransformErrorCode, field: string, ctx: Api): string {
  const s = str(v);
  if (!s) throw new PlaceTransformError(`place: missing ${field}`, code, ctx);
  return s;
}
function reqCoord(v: unknown, field: 'lat' | 'lng', ctx: Api): number {
  const n = num(v);
  if (n === undefined) throw new PlaceTransformError(`place: missing/invalid ${field}`, 'BAD_COORDS', ctx);
  const [lo, hi] = field === 'lat' ? [-90, 90] : [-180, 180];
  if (n < lo || n > hi) throw new PlaceTransformError(`place: ${field} ${n} out of range`, 'BAD_COORDS', ctx);
  return n;
}

/** A `GET /places/search` hit → `PlaceSearchResult` (validates; the API already gives camelCase). */
export function transformPlaceSearchResult(api: Api): PlaceSearchResult {
  const name = reqStr(api.name, 'MISSING_NAME', 'name', { api });
  return {
    provider: str(api.provider) ?? 'unknown',
    providerPlaceId: strOrNull(api.providerPlaceId ?? api.provider_place_id),
    name,
    formattedAddress: strOrNull(api.formattedAddress ?? api.formatted_address),
    state: strOrNull(api.state),
    lat: reqCoord(api.lat, 'lat', { name }),
    lng: reqCoord(api.lng, 'lng', { name }),
  };
}

/** A joined `*_place:places!...(*)` field on another row → `Place`, or `undefined` when the join is null. */
export function maybePlace(v: unknown): Place | undefined {
  return v && typeof v === 'object' ? transformPlace(v as Api) : undefined;
}

/** A stored `places` row (from `POST /places`) → `Place`. */
export function transformPlace(api: Api): Place {
  const id = reqStr(api.id, 'MISSING_ID', 'id', { api });
  const ctx = { place_id: id };
  return {
    id,
    provider: reqStr(api.provider, 'MISSING_PROVIDER', 'provider', ctx),
    providerPlaceId: strOrNull(api.provider_place_id ?? api.providerPlaceId),
    name: reqStr(api.name, 'MISSING_NAME', 'name', ctx),
    formattedAddress: strOrNull(api.formatted_address ?? api.formattedAddress),
    state: strOrNull(api.state),
    country: str(api.country) ?? 'IN',
    lat: reqCoord(api.lat, 'lat', ctx),
    lng: reqCoord(api.lng, 'lng', ctx),
    cityId: strOrNull(api.city_id ?? api.cityId),
    isActive: api.is_active !== false,
    createdAt: str(api.created_at) ?? new Date().toISOString(),
  };
}

/** `ResolvePlaceInput` → the `snake_case` `POST /places` body. */
export function toApiResolvePlace(input: ResolvePlaceInput): Record<string, unknown> {
  return {
    provider: input.provider,
    provider_place_id: input.providerPlaceId ?? null,
    name: input.name,
    formatted_address: input.formattedAddress ?? null,
    state: input.state ?? null,
    lat: input.lat,
    lng: input.lng,
    city_id: input.cityId ?? null,
  };
}

/** A search hit → the `ResolvePlaceInput` you POST to turn it into a stored `Place`. */
export function searchResultToResolveInput(r: PlaceSearchResult, cityId?: string | null): ResolvePlaceInput {
  return {
    provider: r.provider,
    providerPlaceId: r.providerPlaceId,
    name: r.name,
    formattedAddress: r.formattedAddress,
    state: r.state,
    lat: r.lat,
    lng: r.lng,
    cityId: cityId ?? null,
  };
}
