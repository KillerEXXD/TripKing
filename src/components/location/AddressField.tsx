import { useState } from 'react';
import { MapPin, Search, X } from 'lucide-react';
import { LocationSearchPanel } from '@/components/location/LocationSearchPanel';
import { cn } from '@/lib/utils';
import type { Place } from '@/types';

export interface AddressFieldProps {
  /** The chosen address, or `null` when none picked yet. */
  value: Place | null;
  onChange: (place: Place | null) => void;
  /** Button text shown when no address is set. */
  searchLabel?: string;
  /** Heading for the search panel. */
  pickerTitle?: string;
  pickerPlaceholder?: string;
  /** Bias the geocoder toward this point (e.g. the pickup, for "add stop near From"). */
  near?: { lat: number; lng: number };
  /** Render an invalid/error outline (e.g. required-but-empty on submit). */
  invalid?: boolean;
  className?: string;
}

/**
 * A *required* address picker (Local + Package flows) — unlike {@link PlacePinField}, which is
 * an optional pin on top of a curated city, this is the primary location input: it has no city
 * dropdown behind it. Shows the chosen address as a removable chip, or a full-width "Search
 * address" button that opens the {@link LocationSearchPanel}. The picked `Place` carries the id
 * + lat/lng the server uses to derive the trip's city.
 */
export function AddressField({
  value,
  onChange,
  searchLabel = 'Search address',
  pickerTitle = 'Search an address',
  pickerPlaceholder = 'Search a building, street, area, or landmark…',
  near,
  invalid = false,
  className,
}: AddressFieldProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn('space-y-1', className)}>
      {value ? (
        <div className={cn('flex items-center gap-2 rounded-control border bg-white px-3 py-2', invalid ? 'border-red-400' : 'border-input')}>
          <MapPin className="size-4 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{value.name}</span>
            {value.formattedAddress ? <span className="block truncate text-xs text-secondary">{value.formattedAddress}</span> : null}
          </span>
          <button type="button" onClick={() => setOpen(true)} className="shrink-0 text-xs font-medium text-primary underline underline-offset-2">Change</button>
          <button type="button" aria-label={`Clear ${value.name}`} onClick={() => onChange(null)} className="shrink-0 text-secondary hover:text-foreground">
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn('flex h-11 w-full items-center gap-2 rounded-control border bg-white px-3 text-left text-sm text-secondary', invalid ? 'border-red-400' : 'border-input hover:border-primary/40')}
        >
          <Search className="size-4 shrink-0" aria-hidden /> {searchLabel}
        </button>
      )}
      {open ? (
        <LocationSearchPanel
          title={pickerTitle}
          placeholder={pickerPlaceholder}
          near={near}
          onPick={(p) => { onChange(p); setOpen(false); }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

export default AddressField;
