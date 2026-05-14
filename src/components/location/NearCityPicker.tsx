import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Loader2, MapPin, Navigation } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui';
import { useGeolocation } from '@/hooks/useGeolocation';
import { cn, nearestCity } from '@/lib/utils';
import type { CityRow } from '@/types';

export interface NearCityPickerProps {
  cities: CityRow[];
  /** Selected city id; '' / undefined means "anywhere". */
  value: string;
  onChange: (cityId: string) => void;
  className?: string;
}

/**
 * Pill button + popover menu for the home-page "Near {city}" affordance. Two ways
 * to populate it:
 *   1. Tap "📍 Use my current location" → asks the browser for one-shot geolocation,
 *      then snaps to the closest curated city (haversine, no map roads). Silent if
 *      the user denies; the rest of the menu still works.
 *   2. Pick a city from the list, or "Anywhere".
 *
 * If the user has previously granted geolocation permission to this origin, the
 * component fires `request()` silently on mount so the pill auto-updates without
 * a prompt. We don't auto-prompt on first visit — that would be intrusive.
 */
export function NearCityPicker({ cities, value, onChange, className }: NearCityPickerProps) {
  const [open, setOpen] = useState(false);
  const geo = useGeolocation();
  const current = useMemo(() => cities.find((c) => c.id === value), [cities, value]);

  // Auto-request only when the user has already granted permission to this origin.
  // navigator.permissions isn't on every browser — wrap in try/catch + check.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('permissions' in navigator)) return;
    let cancelled = false;
    try {
      navigator.permissions
        .query({ name: 'geolocation' as PermissionName })
        .then((res) => {
          if (!cancelled && res.state === 'granted') geo.request();
        })
        .catch(() => {
          /* permissions API not implemented for geolocation in this browser — skip */
        });
    } catch {
      /* same */
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When a fresh position arrives, snap to the nearest city (if it changes the selection).
  useEffect(() => {
    if (!geo.position || cities.length === 0) return;
    const near = nearestCity(geo.position, cities);
    if (near && near.id !== value) onChange(near.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.position, cities]);

  function pick(cityId: string) {
    onChange(cityId);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Change the area to browse near"
          className={cn(
            'inline-flex items-center gap-1 rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 transition-colors hover:bg-emerald-100',
            className,
          )}
        >
          <MapPin className="size-3" aria-hidden />
          <span className="font-semibold">Near {current?.name ?? 'you'}</span>
          <ChevronDown className="size-3" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-1" align="start">
        <button
          type="button"
          onClick={() => geo.request()}
          disabled={geo.loading}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
        >
          {geo.loading ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Navigation className="size-4" aria-hidden />
          )}
          {geo.loading ? 'Locating…' : 'Use my current location'}
        </button>
        {geo.error ? (
          <p className="px-2.5 pb-1 text-[11px] text-amber-700">{geo.error}</p>
        ) : null}
        <div className="my-1 border-t" />
        <button
          type="button"
          onClick={() => pick('')}
          className={cn(
            'flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-muted',
            !value && 'font-semibold',
          )}
        >
          Anywhere
          {!value ? <Check className="size-4 text-primary" aria-hidden /> : null}
        </button>
        <div className="max-h-64 overflow-y-auto">
          {cities.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => pick(c.id)}
              className={cn(
                'flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-muted',
                c.id === value && 'font-semibold',
              )}
            >
              {c.name}
              {c.id === value ? <Check className="size-4 text-primary" aria-hidden /> : null}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default NearCityPicker;
