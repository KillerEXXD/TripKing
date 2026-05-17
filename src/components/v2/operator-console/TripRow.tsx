import { Link } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import type { Trip } from '@/types';
import { formatINR, formatPickupTime } from '@/lib/utils';
import { routeChainText } from '@/components/trip/RouteChain';
import { StatusDot } from './StatusDot';

/**
 * Dense table row — one trip per row, ~44px tall. Tabular-nums everywhere
 * via the .v2-operator-console wrapper's font-feature-settings.
 */
export function TripRow({ trip }: { trip: Trip }) {
  return (
    <Link
      to={`/trips/${trip.id}?from=/v2`}
      className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] items-center gap-3 border-b border-border px-3 py-2.5 text-[13px] hover:bg-surface-muted"
    >
      <StatusDot status={trip.status} />
      <div className="min-w-0 truncate font-medium">{routeChainText(trip)}</div>
      <div className="text-muted-foreground">{formatPickupTime(trip.pickupAt)}</div>
      <div className="w-8 text-right text-muted-foreground">{trip.applicantCount}</div>
      <div className="w-20 text-right font-medium">{formatINR(trip.driverPayout)}</div>
      <button
        type="button"
        aria-label={`Actions for trip ${trip.id}`}
        className="rounded-control p-1 text-muted-foreground hover:bg-surface-muted"
        onClick={(e) => {
          e.preventDefault();
          /* prototype — no menu yet */
        }}
      >
        <MoreHorizontal className="size-4" aria-hidden />
      </button>
    </Link>
  );
}

export default TripRow;
