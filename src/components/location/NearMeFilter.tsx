import { useEffect } from 'react';
import { Loader2, MapPin, X } from 'lucide-react';
import { useGeolocation } from '@/hooks/useGeolocation';
import type { NearRadius } from '@/types';

const RADII = [5, 10, 25, 50] as const;
const DEFAULT_RADIUS_KM = 25; // matches app_settings.default_alert_radius_km

export interface NearMeFilterProps {
  /** The active near-filter, or `null` when off. */
  value: NearRadius | null;
  onChange: (next: NearRadius | null) => void;
}

/**
 * "📍 Near me" feed-filter chip — taps browser geolocation ({@link useGeolocation}),
 * lets the user pick a radius (5 / 10 / 25 / 50 km), and yields a {@link NearRadius}
 * (or `null` when off). Fully controlled — the parent owns the value. Used on the
 * trips & vacancies feeds.
 */
export function NearMeFilter({ value, onChange }: NearMeFilterProps) {
  const geo = useGeolocation();
  const active = value != null;

  // When geolocation resolves a fresh position, switch the filter on (keeping the current radius, or the default).
  useEffect(() => {
    if (geo.position) onChange({ ...geo.position, radiusKm: value?.radiusKm ?? DEFAULT_RADIUS_KM });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react only to a NEW position, not radius / onChange churn
  }, [geo.position]);

  if (active) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="flex h-8 items-center gap-1 rounded-full border border-primary bg-primary/10 px-3 text-xs font-medium text-primary">
          <MapPin className="size-3.5" aria-hidden /> Within
        </span>
        <label className="sr-only" htmlFor="near-radius">
          Search radius
        </label>
        <select
          id="near-radius"
          value={value.radiusKm}
          onChange={(e) => onChange({ ...value, radiusKm: Number(e.target.value) })}
          className="h-8 rounded-full border border-input bg-white px-2 text-xs"
        >
          {RADII.map((r) => (
            <option key={r} value={r}>
              {r} km
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label="Turn off the near-me filter"
          onClick={() => {
            geo.clear();
            onChange(null);
          }}
          className="flex size-8 items-center justify-center rounded-full border border-input bg-white text-secondary"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => geo.request()}
        disabled={geo.loading}
        className="flex h-8 items-center gap-1 rounded-full border border-input bg-white px-3 text-xs font-medium disabled:opacity-60"
      >
        {geo.loading ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <MapPin className="size-3.5" aria-hidden />} Near me
      </button>
      {geo.error ? <span className="text-xs text-red-700">{geo.error}</span> : null}
    </>
  );
}

export default NearMeFilter;
