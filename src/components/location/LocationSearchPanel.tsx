import { useState } from 'react';
import { MapPin, Search, Loader2, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useLocationSearch } from '@/hooks/useLocationSearch';
import type { LocationResult } from '@/lib/api/services/locations';

export interface LocationValue {
  name: string;
  state?: string;
  country?: string;
  lat: number;
  lng: number;
  displayName?: string;
}

interface Props {
  onPick: (value: LocationValue) => void;
  onClose: () => void;
  placeholder?: string;
  /** Heading shown above the input (e.g. "Set pickup location"). */
  title?: string;
  /**
   * Coordinate keys (`"<lat-4dp>,<lng-4dp>"`) of already-selected locations.
   * Matching results render as disabled with an "added" tag so the user
   * can't accidentally double-add the same place.
   */
  excludeKeys?: string[];
}

const coordKey = (lat: number, lng: number): string =>
  `${lat.toFixed(4)},${lng.toFixed(4)}`;

/**
 * Reusable inline location-search panel.
 *
 * Live-searches OpenStreetMap (via useLocationSearch) and lets the user pick
 * a result. Same building block used by:
 *  - Driver home current-location chip
 *  - Post Vacancy "from" + "destinations"
 *  - Future Post Trip / Alerts / Find Driver screens
 *
 * Yields a LocationValue with lat/lng so the matcher can do radius search
 * server-side instead of fragile name-only comparisons.
 */
export function LocationSearchPanel({
  onPick,
  onClose,
  placeholder = 'Search a city, town, or area in India…',
  title = 'Search location',
  excludeKeys = [],
}: Props) {
  const [query, setQuery] = useState('');
  const { data: results = [], isFetching, isError } = useLocationSearch(query);

  const handlePick = (r: LocationResult) => {
    onPick({
      name: r.cityName,
      state: r.state,
      country: r.country,
      lat: r.lat,
      lng: r.lng,
      displayName: r.displayName,
    });
  };

  return (
    <Card className="p-2 gap-1">
      <div className="flex items-center justify-between px-2 pt-1 pb-2">
        <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
          {title}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground p-1 -mr-1"
          aria-label="Close location picker"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="relative px-1 pb-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="pl-9 h-10"
          inputMode="search"
          aria-label="Search location"
        />
        {isFetching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground animate-spin" />
        )}
      </div>

      <div className="max-h-72 overflow-y-auto px-1 pb-1">
        {query.trim().length < 2 ? (
          <div className="px-3 py-3 text-xs text-muted-foreground">
            Type at least 2 characters to search…
          </div>
        ) : isError ? (
          <div className="px-3 py-3 text-xs text-destructive">
            Couldn't reach location service. Check your connection.
          </div>
        ) : !isFetching && results.length === 0 ? (
          <div className="px-3 py-3 text-xs text-muted-foreground">
            No matches for "{query.trim()}".
          </div>
        ) : (
          <ul className="space-y-0.5">
            {results.map((r) => {
              const excluded = excludeKeys.includes(coordKey(r.lat, r.lng));
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    disabled={excluded}
                    onClick={() => handlePick(r)}
                    className="flex items-start gap-2 w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 active:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <MapPin className="size-4 mt-0.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm truncate">
                        {r.cityName}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {r.displayName}
                      </div>
                    </div>
                    {excluded && (
                      <span className="text-xs text-muted-foreground self-center shrink-0">
                        added
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}
