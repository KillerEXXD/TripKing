import { useState } from 'react';
import { MapPin, X } from 'lucide-react';
import { LocationSearchPanel } from '@/components/location/LocationSearchPanel';
import type { Place } from '@/types';

export interface PlacePinFieldProps {
  /** The pinned place, or `null` when none. */
  value: Place | null;
  onChange: (place: Place | null) => void;
  /** Text for the "pin" link shown when no place is set. */
  pinLabel?: string;
  /** Heading for the search panel. */
  pickerTitle?: string;
  pickerPlaceholder?: string;
}

/**
 * The optional "📍 pin an exact spot" affordance shown under a curated-city `<select>`
 * (post-vacancy / post-trip / create-alert). Self-contained: renders a "pin" link — or a
 * removable place chip when set — and owns the {@link LocationSearchPanel} it opens. The
 * picked `Place`'s `id` is what the form sends as `*_place_id` alongside the required `*_city_id`.
 */
export function PlacePinField({
  value,
  onChange,
  pinLabel = 'Pin the exact spot',
  pickerTitle = 'Pin a location',
  pickerPlaceholder = 'Search a town, area, or landmark…',
}: PlacePinFieldProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {value ? (
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label={`Remove the pinned location ${value.name}`}
          className="inline-flex items-center gap-1 rounded-full border border-primary bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
        >
          <MapPin className="size-3" aria-hidden /> {value.name} <X className="size-3" aria-hidden />
        </button>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-xs font-medium text-primary underline underline-offset-2 hover:text-emerald-800">
          <MapPin className="size-3" aria-hidden /> {pinLabel} <span className="font-normal">(optional)</span>
        </button>
      )}
      {open ? (
        <LocationSearchPanel
          title={pickerTitle}
          placeholder={pickerPlaceholder}
          onPick={(p) => {
            onChange(p);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

export default PlacePinField;
