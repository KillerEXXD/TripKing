import { Link } from 'react-router-dom';
import type { Trip } from '@/types';
import { formatINR, formatPickupTime } from '@/lib/utils';

// City-name pack — Tamil first, fallback to the data's English name when
// the city isn't in the pack. Real native_name column lives in the
// `cities` table follow-up; this is the prototype-stage best-effort.
const CITY_TAMIL: Record<string, string> = {
  Vellore: 'வேலூர்',
  Chennai: 'சென்னை',
  Bangalore: 'பெங்களூரு',
  Tirupati: 'திருப்பதி',
  Salem: 'சேலம்',
  Coimbatore: 'கோயம்புத்தூர்',
  Pondicherry: 'புதுச்சேரி',
};

function ta(name: string | undefined): string {
  if (!name) return '—';
  return CITY_TAMIL[name] ?? name;
}

export function BharatTripCard({ trip }: { trip: Trip }) {
  const fromTa = ta(trip.fromCity?.name);
  const toTa = ta(trip.toCity?.name);
  return (
    <Link
      to={`/trips/${trip.id}?from=/v6`}
      className="block rounded-card border border-border bg-surface p-4 shadow-card"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-[22px] font-semibold leading-tight">
            <span>{fromTa}</span>
            <span className="mx-2 text-muted-foreground">→</span>
            <span>{toTa}</span>
          </div>
          <div className="mt-0.5 text-[13px] text-muted-foreground">
            {trip.fromCity?.name ?? '—'} → {trip.toCity?.name ?? '—'}
          </div>
          <div className="mt-2 flex items-center gap-2 text-[12px]">
            <span
              className="rounded-pill px-2 py-0.5"
              style={{
                color: 'var(--skin-bharat-marigold)',
                background: 'var(--skin-bharat-marigold-bg)',
              }}
            >
              {trip.carTypeLabel ?? 'வாகனம்'}
            </span>
            <span className="text-muted-foreground">{formatPickupTime(trip.pickupAt)}</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div
            className="text-[28px] font-bold leading-none"
            style={{ color: 'var(--skin-bharat-vermilion)' }}
          >
            {formatINR(trip.driverPayout)}
          </div>
          <div className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
            கட்டணம் · payout
          </div>
        </div>
      </div>
    </Link>
  );
}

export default BharatTripCard;
