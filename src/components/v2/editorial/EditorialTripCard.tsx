import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { Trip } from '@/types';
import { formatINR, formatPickupTime } from '@/lib/utils';

/**
 * Editorial card — magazine-style trip "feature". Asymmetric: first
 * column is the route + serif headline, second column is a small
 * illustrated dotted-path "map" + the fare in serif.
 */
export function EditorialTripCard({ trip, variant = 'left' }: { trip: Trip; variant?: 'left' | 'right' }) {
  const isLeft = variant === 'left';
  return (
    <Link
      to={`/trips/${trip.id}?from=/v5`}
      className={`group grid items-center gap-5 border-b border-border py-7 ${
        isLeft ? 'grid-cols-[1fr_auto]' : 'grid-cols-[auto_1fr]'
      }`}
    >
      {isLeft ? <Headline trip={trip} /> : <DottedMap trip={trip} />}
      {isLeft ? <DottedMap trip={trip} /> : <Headline trip={trip} />}
    </Link>
  );
}

function Headline({ trip }: { trip: Trip }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        Feature trip · {formatPickupTime(trip.pickupAt)}
      </div>
      <h2 className="editorial-headline text-[26px] leading-[1.05]">
        {trip.fromCity?.name ?? '—'}
        <span className="mx-2 italic text-muted-foreground">to</span>
        {trip.toCity?.name ?? '—'}
      </h2>
      <div className="mt-3 flex flex-wrap gap-2 text-[12px]">
        {trip.carTypeLabel ? (
          <span
            className="rounded-pill px-2.5 py-1"
            style={{
              color: 'var(--skin-editorial-terracotta)',
              background: 'var(--skin-editorial-terracotta-bg)',
            }}
          >
            {trip.carTypeLabel}
          </span>
        ) : null}
        <span
          className="rounded-pill px-2.5 py-1"
          style={{
            color: 'var(--skin-editorial-mustard)',
            background: 'var(--skin-editorial-mustard-bg)',
          }}
        >
          {Math.round(trip.expectedDistanceKm)} km
        </span>
        {trip.applicantCount > 0 ? (
          <span className="rounded-pill border border-border px-2.5 py-1 text-muted-foreground">
            {trip.applicantCount} drivers interested
          </span>
        ) : null}
      </div>
    </div>
  );
}

function DottedMap({ trip }: { trip: Trip }) {
  return (
    <div className="flex w-28 flex-col items-end gap-2">
      {/* Stylised hand-drawn dotted route */}
      <svg viewBox="0 0 88 56" className="h-12 w-22 text-foreground/70" aria-hidden>
        <circle cx="8" cy="46" r="3" fill="currentColor" />
        <circle cx="80" cy="10" r="3" fill="currentColor" />
        <path
          d="M 8 46 Q 30 48 44 28 T 80 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="2 3"
        />
      </svg>
      <div className="editorial-headline text-right text-[22px] leading-none">
        {formatINR(trip.driverPayout)}
      </div>
      <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
        read trip <ArrowRight className="size-3" aria-hidden />
      </div>
    </div>
  );
}

export default EditorialTripCard;
