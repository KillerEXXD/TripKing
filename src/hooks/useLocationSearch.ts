import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { searchLocations } from '@/lib/api/services/locations';

/**
 * Debounced location autocomplete hook.
 * Mirrors hudr-pwa's per-resource hook pattern.
 */
export function useLocationSearch(query: string, debounceMs = 300) {
  const [debounced, setDebounced] = useState(query.trim());

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), debounceMs);
    return () => clearTimeout(t);
  }, [query, debounceMs]);

  return useQuery({
    queryKey: ['location-search', debounced],
    queryFn: () => searchLocations(debounced),
    enabled: debounced.length >= 2,
    staleTime: 60_000,
  });
}
