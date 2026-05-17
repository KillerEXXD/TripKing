import { Link } from 'react-router-dom';
import { Users } from 'lucide-react';
import type { Trip } from '@/types';
import { formatINR, formatPickupTime } from '@/lib/utils';
import { routeChainText } from '@/components/trip/RouteChain';

/**
 * Kanban card — one trip. Compact body, applicants pill bottom-right.
 */
export function PipelineCard({ trip }: { trip: Trip }) {
  return (
    <Link
      to={`/v4/trips/${trip.id}`}
      className="block rounded-card border border-border bg-surface p-3 shadow-card transition-shadow hover:shadow-md"
    >
      <div className="truncate text-[14px] font-semibold">{routeChainText(trip)}</div>
      <div className="mt-1 flex items-center justify-between text-[12px] text-muted-foreground">
        <span>{formatPickupTime(trip.pickupAt)}</span>
        <span className="font-medium text-foreground">{formatINR(trip.driverPayout)}</span>
      </div>
      {trip.applicantCount > 0 ? (
        <div className="mt-2 inline-flex items-center gap-1 rounded-pill bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">
          <Users className="size-3" aria-hidden /> {trip.applicantCount} drivers
        </div>
      ) : null}
    </Link>
  );
}

export default PipelineCard;
