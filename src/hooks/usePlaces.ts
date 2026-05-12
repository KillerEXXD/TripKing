/** Places hooks — debounced geocoder search + find-or-create. (See `services/places.ts`.) */
import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { STALE } from '@/lib/queryClient';
import { resolvePlace, resolveSearchResult, searchPlaces } from '@/lib/api/services/places';
import type { Place, PlaceSearchResult, ResolvePlaceInput } from '@/types';

const PLACE_SEARCH_DEBOUNCE_MS = 300;
const MIN_QUERY_LEN = 2;

/**
 * Debounced geocoder search. Pass the raw input value straight in — the hook debounces
 * (300 ms) and only fires once the trimmed query is ≥ 2 chars. `near` (optional) biases
 * results toward a point. The query/transport caches a hit ~5 min, so `staleTime` matches.
 */
export function usePlaceSearch(query: string, near?: { lat: number; lng: number }) {
  const [debounced, setDebounced] = useState(query.trim());
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), PLACE_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  return useQuery({
    queryKey: ['places', 'search', debounced, near?.lat ?? null, near?.lng ?? null],
    queryFn: () => searchPlaces({ q: debounced, near }),
    enabled: debounced.length >= MIN_QUERY_LEN,
    staleTime: STALE.master,
  });
}

/** Find-or-create a stored `Place` for a picked place (a `ResolvePlaceInput`). */
export function useResolvePlace() {
  return useMutation<Place, Error, ResolvePlaceInput>({ mutationFn: (input) => resolvePlace(input) });
}

/** Find-or-create directly from a `PlaceSearchResult` (+ an optional curated-city link). */
export function useResolveSearchResult() {
  return useMutation<Place, Error, { result: PlaceSearchResult; cityId?: string | null }>({
    mutationFn: ({ result, cityId }) => resolveSearchResult(result, cityId),
  });
}
