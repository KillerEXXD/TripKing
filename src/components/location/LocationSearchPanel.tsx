import { useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Loader2, MapPin, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { usePlaceSearch, useResolveSearchResult } from '@/hooks/usePlaces';
import { Input } from '@/components/ui';
import type { Place, PlaceSearchResult } from '@/types';

export interface LocationSearchPanelProps {
  /** Called with the stored {@link Place} once the user picks (and we've find-or-created it). */
  onPick: (place: Place) => void;
  /** Close the panel without picking. */
  onClose: () => void;
  title?: string;
  placeholder?: string;
  /** Optional point to bias the geocoder toward (e.g. the driver's current location). */
  near?: { lat: number; lng: number };
}

/**
 * Reusable place-search panel — live-searches the geocoder via {@link usePlaceSearch}
 * and, on pick, find-or-creates the stored {@link Place} (so callers get a `placeId`
 * + precise `lat`/`lng` for radius matching, not a fragile name string). Built on
 * Radix Dialog (focus trap / Escape / scroll-lock). Used by post-vacancy, post-trip,
 * create-alert, and the location filters. (Callers de-dup by `place.id`.)
 */
export function LocationSearchPanel({
  onPick,
  onClose,
  title = 'Search a location',
  placeholder = 'Search a city, town, or area in India…',
  near,
}: LocationSearchPanelProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const search = usePlaceSearch(query, near);
  const resolve = useResolveSearchResult();
  const results = search.data ?? [];
  const trimmed = query.trim();

  function pick(r: PlaceSearchResult) {
    if (resolve.isPending) return;
    resolve.mutate(
      { result: r },
      {
        onSuccess: (place) => {
          onPick(place);
          onClose();
        },
        onError: () => toast.error("Couldn't add that place — try again."),
      },
    );
  }

  return (
    <Dialog.Root open onOpenChange={(o) => (o ? undefined : onClose())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[80vh] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl bg-card p-4 shadow-xl"
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
        >
          <div className="mb-3 flex items-center justify-between">
            <Dialog.Title className="text-lg font-bold">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" aria-label="Close" className="text-secondary hover:text-foreground">
                <X className="size-5" aria-hidden />
              </button>
            </Dialog.Close>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-secondary" aria-hidden />
            <Input ref={inputRef} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={placeholder} aria-label="Search a location" className="pl-9" />
          </div>

          <div className="mt-3 min-h-[3rem] overflow-y-auto">
            {trimmed.length < 2 ? (
              <p className="px-1 py-2 text-sm text-secondary">Type at least 2 characters to search.</p>
            ) : search.isError ? (
              <p className="px-1 py-2 text-sm text-red-700">Couldn&apos;t search just now — check your connection and try again.</p>
            ) : search.isFetching && results.length === 0 ? (
              <p className="flex items-center gap-2 px-1 py-2 text-sm text-secondary">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Searching…
              </p>
            ) : results.length === 0 ? (
              <p className="px-1 py-2 text-sm text-secondary">No places found for “{trimmed}”.</p>
            ) : (
              <ul className="space-y-1" aria-label="Search results">
                {results.map((r, i) => {
                  const resolvingThis = resolve.isPending && resolve.variables?.result === r;
                  return (
                    <li key={`${r.provider}:${r.providerPlaceId ?? `${r.lat},${r.lng}`}:${i}`}>
                      <button
                        type="button"
                        disabled={resolve.isPending}
                        onClick={() => pick(r)}
                        className="flex w-full items-start gap-2 rounded-lg border border-transparent px-2 py-2 text-left hover:border-input hover:bg-muted disabled:opacity-50 disabled:hover:border-transparent disabled:hover:bg-transparent"
                      >
                        <MapPin className="mt-0.5 size-4 shrink-0 text-secondary" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{r.name}</span>
                          {r.formattedAddress ? <span className="block truncate text-xs text-secondary">{r.formattedAddress}</span> : null}
                        </span>
                        {resolvingThis ? <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-secondary" aria-hidden /> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default LocationSearchPanel;
