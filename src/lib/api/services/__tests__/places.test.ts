import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient } from '@/lib/api/client';
import * as transforms from '@/lib/api/transforms/place';
import { resolvePlace, resolveSearchResult, searchPlaces } from '@/lib/api/services/places';

function ok<T>(data: T) {
  return Promise.resolve({ success: true, data, error: null } as const);
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(transforms, 'transformPlace').mockImplementation((row: unknown) => ({ id: (row as { id: string }).id } as never));
  vi.spyOn(transforms, 'transformPlaceSearchResult').mockImplementation((row: unknown) => ({ name: (row as { name: string }).name } as never));
  vi.spyOn(transforms, 'toApiResolvePlace').mockImplementation(() => ({ stub: true }) as never);
  vi.spyOn(transforms, 'searchResultToResolveInput').mockImplementation(() => ({ via: 'searchResult' } as never));
});

describe('places service', () => {
  it('searchPlaces → GET /places/search with q + optional near_lat/near_lng + limit', async () => {
    const get = vi.spyOn(apiClient, 'get').mockReturnValue(ok([{ name: 'Vellore' }]) as never);
    await searchPlaces({ q: 'vel', near: { lat: 12.92, lng: 79.13 }, limit: 5 });
    expect(get).toHaveBeenLastCalledWith('/places/search', { q: 'vel', near_lat: 12.92, near_lng: 79.13, limit: 5 });
  });

  it('searchPlaces omits near/limit when not supplied', async () => {
    const get = vi.spyOn(apiClient, 'get').mockReturnValue(ok([]) as never);
    await searchPlaces({ q: 'vel' });
    expect(get).toHaveBeenLastCalledWith('/places/search', { q: 'vel' });
  });

  it('resolvePlace → POST /places with the toApiResolvePlace body; throws on null body', async () => {
    const post = vi.spyOn(apiClient, 'post').mockReturnValue(ok({ id: 'p1' }) as never);
    await resolvePlace({} as never);
    expect(post).toHaveBeenCalledWith('/places', { stub: true });
    vi.spyOn(apiClient, 'post').mockReturnValue(ok(null) as never);
    await expect(resolvePlace({} as never)).rejects.toThrow('places: empty response body');
  });

  it('resolveSearchResult passes the cityId through searchResultToResolveInput', async () => {
    const post = vi.spyOn(apiClient, 'post').mockReturnValue(ok({ id: 'p1' }) as never);
    await resolveSearchResult({ name: 'X' } as never, 'c1');
    expect(transforms.searchResultToResolveInput).toHaveBeenCalledWith({ name: 'X' }, 'c1');
    expect(post).toHaveBeenCalledWith('/places', { stub: true });
  });
});
