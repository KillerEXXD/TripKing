import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

vi.mock('@/lib/api/services/places', () => ({
  searchPlaces: vi.fn(),
  resolvePlace: vi.fn(),
  resolveSearchResult: vi.fn(),
}));
import { resolvePlace, searchPlaces } from '@/lib/api/services/places';
import { usePlaceSearch, useResolvePlace } from '@/hooks/usePlaces';
import type { Place } from '@/types';

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
}

const hit = { provider: 'nominatim', providerPlaceId: 'N1', name: 'Vellore', formattedAddress: null, state: null, lat: 12.9, lng: 79.1 };
const place: Place = { id: 'p1', provider: 'nominatim', providerPlaceId: 'N1', name: 'Vellore', formattedAddress: null, state: null, country: 'IN', lat: 12.9, lng: 79.1, cityId: null, isActive: true, createdAt: '2026-05-12T00:00:00Z' };

describe('usePlaceSearch', () => {
  beforeEach(() => vi.clearAllMocks());

  it('searches with the trimmed query and exposes the data', async () => {
    vi.mocked(searchPlaces).mockResolvedValue([hit]);
    const { result } = renderHook(() => usePlaceSearch('  vell  '), { wrapper: makeWrapper() });
    await waitFor(() => expect(searchPlaces).toHaveBeenCalledWith({ q: 'vell', near: undefined }));
    await waitFor(() => expect(result.current.data).toEqual([hit]));
  });

  it('stays disabled (never calls the service) for queries shorter than 2 chars', async () => {
    vi.mocked(searchPlaces).mockResolvedValue([]);
    renderHook(() => usePlaceSearch('v'), { wrapper: makeWrapper() });
    await new Promise((r) => setTimeout(r, 400)); // well past the 300ms debounce
    expect(searchPlaces).not.toHaveBeenCalled();
  });

  it('passes a `near` bias through', async () => {
    vi.mocked(searchPlaces).mockResolvedValue([]);
    renderHook(() => usePlaceSearch('chennai', { lat: 13.08, lng: 80.27 }), { wrapper: makeWrapper() });
    await waitFor(() => expect(searchPlaces).toHaveBeenCalledWith({ q: 'chennai', near: { lat: 13.08, lng: 80.27 } }));
  });
});

describe('useResolvePlace', () => {
  beforeEach(() => vi.clearAllMocks());
  it('calls resolvePlace with the input and exposes the stored place', async () => {
    vi.mocked(resolvePlace).mockResolvedValue(place);
    const { result } = renderHook(() => useResolvePlace(), { wrapper: makeWrapper() });
    result.current.mutate({ provider: 'nominatim', providerPlaceId: 'N1', name: 'Vellore', lat: 12.9, lng: 79.1 });
    await waitFor(() => expect(resolvePlace).toHaveBeenCalledWith({ provider: 'nominatim', providerPlaceId: 'N1', name: 'Vellore', lat: 12.9, lng: 79.1 }));
    await waitFor(() => expect(result.current.data).toEqual(place));
  });
});
