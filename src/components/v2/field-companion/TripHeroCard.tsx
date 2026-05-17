import { Link } from 'react-router-dom';
import { ArrowRight, MapPin } from 'lucide-react';
import type { Trip } from '@/types';
import { formatPickupTime } from '@/lib/utils';
import { FareNumeral } from './FareNumeral';

/**
 * Glanceable hero trip card — one per viewport, big text, big touch target.
 */
export function TripHeroCard({ trip }: { trip: Trip }) {
  return (
    <Link
      to={`/trips/${trip.id}?from=/v3`}
      className="block rounded-card bg-surface p-5 shadow-card transition-transform active:scale-[0.99]"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[12px] uppercase tracking-wide text-muted-foreground">
            <MapPin className="size-3.5" aria-hidden /> {trip.fromCity?.name ?? '—'}
          </div>
          <div className="mt-1 flex items-center gap-2 text-[26px] font-bold leading-tight">
            <span>{trip.fromCity?.name ?? '—'}</span>
            <ArrowRight className="size-5 text-primary" aria-hidden />
            <span>{trip.toCity?.name ?? '—'}</span>
          </div>
          <div className="mt-3 text-[16px] text-muted-foreground">
            {formatPickupTime(trip.pickupAt)}
          </div>
        </div>
        <FareNumeral amount={trip.driverPayout} sublabel="payout" />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
        {trip.carTypeLabel ? (
          <span className="rounded-pill border border-border px-3 py-1">{trip.carTypeLabel}</span>
        ) : null}
        <span className="rounded-pill border border-border px-3 py-1">{trip.seatsRequired} seats</span>
        {trip.acRequired ? (
          <span className="rounded-pill border border-border px-3 py-1">AC</span>
        ) : null}
        {trip.applicantCount > 0 ? (
          <span className="rounded-pill bg-warning/20 px-3 py-1 text-warning">{trip.applicantCount} applied</span>
        ) : null}
      </div>
    </Link>
  );
}

export default TripHeroCard;
