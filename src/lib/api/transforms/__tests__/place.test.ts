import { describe, it, expect } from 'vitest';
import { PlaceTransformError, searchResultToResolveInput, toApiResolvePlace, transformPlace, transformPlaceSearchResult } from '@/lib/api/transforms/place';
import type { PlaceSearchResult } from '@/types';

/** Assert `fn` throws a `PlaceTransformError` with the given `.code`. */
function expectThrowsCode(fn: () => unknown, code: PlaceTransformError['code']): void {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(PlaceTransformError);
    expect((e as PlaceTransformError).code).toBe(code);
    return;
  }
  throw new Error(`expected a PlaceTransformError(${code}) to be thrown`);
}

describe('transformPlaceSearchResult', () => {
  it('maps a camelCase geocoder hit', () => {
    const r = transformPlaceSearchResult({
      provider: 'nominatim',
      providerPlaceId: 'N123',
      name: 'Katpadi, Vellore',
      formattedAddress: 'Katpadi, Vellore, Tamil Nadu, India',
      state: 'Tamil Nadu',
      lat: 12.9698,
      lng: 79.1336,
    });
    expect(r).toEqual({
      provider: 'nominatim',
      providerPlaceId: 'N123',
      name: 'Katpadi, Vellore',
      formattedAddress: 'Katpadi, Vellore, Tamil Nadu, India',
      state: 'Tamil Nadu',
      lat: 12.9698,
      lng: 79.1336,
    });
  });
  it('also accepts snake_case keys, coerces stringified coords, and tolerates missing optionals', () => {
    const r = transformPlaceSearchResult({ provider: 'locationiq', provider_place_id: '42', name: 'Vellore', lat: '12.9165', lng: '79.1325' });
    expect(r.providerPlaceId).toBe('42');
    expect(r.formattedAddress).toBeNull();
    expect(r.state).toBeNull();
    expect(r.lat).toBe(12.9165);
    expect(r.lng).toBe(79.1325);
  });
  it('throws PlaceTransformError(MISSING_NAME) on a missing name', () => {
    expect(() => transformPlaceSearchResult({ provider: 'x', lat: 1, lng: 1 })).toThrow(PlaceTransformError);
    expectThrowsCode(() => transformPlaceSearchResult({ provider: 'x', lat: 1, lng: 1 }), 'MISSING_NAME');
  });
  it('throws BAD_COORDS on out-of-range or non-numeric coords', () => {
    expectThrowsCode(() => transformPlaceSearchResult({ name: 'X', lat: 999, lng: 1 }), 'BAD_COORDS');
    expectThrowsCode(() => transformPlaceSearchResult({ name: 'X', lat: 1, lng: 'nope' }), 'BAD_COORDS');
  });
});

describe('transformPlace (stored row from POST /places)', () => {
  it('maps a snake_case places row (ignoring geog / updated_at)', () => {
    const p = transformPlace({
      id: 'p1',
      provider: 'geoapify',
      provider_place_id: 'g99',
      name: 'Mahabalipuram',
      formatted_address: 'Mahabalipuram, Tamil Nadu, India',
      state: 'Tamil Nadu',
      country: 'IN',
      lat: 12.6269,
      lng: 80.1927,
      geog: '0101000020E6100000DEADBEEF',
      city_id: null,
      is_active: true,
      created_at: '2026-05-12T10:00:00Z',
      updated_at: '2026-05-12T10:00:00Z',
    });
    expect(p).toEqual({
      id: 'p1',
      provider: 'geoapify',
      providerPlaceId: 'g99',
      name: 'Mahabalipuram',
      formattedAddress: 'Mahabalipuram, Tamil Nadu, India',
      state: 'Tamil Nadu',
      country: 'IN',
      lat: 12.6269,
      lng: 80.1927,
      cityId: null,
      isActive: true,
      createdAt: '2026-05-12T10:00:00Z',
    });
  });
  it('defaults country/isActive/createdAt and honours is_active:false', () => {
    const p = transformPlace({ id: 'p2', provider: 'nominatim', name: 'X', lat: 1, lng: 1, is_active: false });
    expect(p.country).toBe('IN');
    expect(p.isActive).toBe(false);
    expect(typeof p.createdAt).toBe('string');
    expect(p.providerPlaceId).toBeNull();
  });
  it('throws on a missing id / provider / name', () => {
    expectThrowsCode(() => transformPlace({ provider: 'x', name: 'Y', lat: 1, lng: 1 }), 'MISSING_ID');
    expectThrowsCode(() => transformPlace({ id: 'p', name: 'Y', lat: 1, lng: 1 }), 'MISSING_PROVIDER');
    expectThrowsCode(() => transformPlace({ id: 'p', provider: 'x', lat: 1, lng: 1 }), 'MISSING_NAME');
  });
});

describe('toApiResolvePlace / searchResultToResolveInput', () => {
  it('builds the snake_case POST body with nulls for missing optionals', () => {
    expect(toApiResolvePlace({ provider: 'nominatim', name: 'Vellore', lat: 12.9, lng: 79.1 })).toEqual({
      provider: 'nominatim',
      provider_place_id: null,
      name: 'Vellore',
      formatted_address: null,
      state: null,
      lat: 12.9,
      lng: 79.1,
      city_id: null,
    });
    expect(toApiResolvePlace({ provider: 'google', providerPlaceId: 'g1', name: 'X', formattedAddress: 'X, India', state: 'TN', lat: 1, lng: 2, cityId: 'c1' })).toEqual({
      provider: 'google',
      provider_place_id: 'g1',
      name: 'X',
      formatted_address: 'X, India',
      state: 'TN',
      lat: 1,
      lng: 2,
      city_id: 'c1',
    });
  });
  it('maps a search hit to a resolve input, with an optional curated-city link', () => {
    const hit: PlaceSearchResult = { provider: 'geoapify', providerPlaceId: 'g2', name: 'Pondicherry', formattedAddress: 'Pondicherry, India', state: 'Puducherry', lat: 11.9, lng: 79.8 };
    expect(searchResultToResolveInput(hit)).toEqual({ provider: 'geoapify', providerPlaceId: 'g2', name: 'Pondicherry', formattedAddress: 'Pondicherry, India', state: 'Puducherry', lat: 11.9, lng: 79.8, cityId: null });
    expect(searchResultToResolveInput(hit, 'cityX').cityId).toBe('cityX');
  });
});
