/**
 * Driver-side card for the `completed` tab on `/app/my-trips`. Mirrors the agent's PostedTripCard
 * visual hierarchy — route + completed-at + distance summary + final payout — but with no
 * applicants/share affordances, since a completed trip is settled.
 *
 * Tap → /trips/:id (the detail page; Phase 6 will render the final cost breakdown there).
 */
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Badge, Card } from '@/components/ui';
import { formatINR, formatKm, formatKmAndDuration, formatPickupDateTime, formatRelativeTime } from '@/lib/utils';
import type { Trip } from '@/types';

export interface CompletedTripCardProps {
  trip: Trip;
  /** Optional `?from=…` suffix so the trip detail's back arrow returns to this list. */
  linkFromPath?: string;
}

export function CompletedTripCard({ trip, linkFromPath }: CompletedTripCardProps) {
  // Prefer the precise `trip_executions.completed_at` surfaced by the transform; fall back
  // to `updatedAt` on legacy completed rows that predate the embed (their trip_executions
  // exists but completed_at may be null if the completion happened before the wizard wrote it).
  const completedAt = trip.completedAt ?? trip.updatedAt ?? trip.createdAt;
  const finalPayout = trip.finalDriverPayout ?? trip.driverPayout;
  const totalFare = trip.finalTotalFare ?? trip.totalFare;
  const extraKm = trip.extraDistanceKm ?? null;
  const tollAmount = trip.tollAmount ?? null;
  const from = linkFromPath ? `?from=${encodeURIComponent(linkFromPath)}` : '';
  const dest = `/app/trips/${trip.id}${from}`;

  return (
    <Card className="gap-0 p-0">
      <Link to={dest} className="block space-y-2 p-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-bold">
              {trip.fromCity.name} → {trip.toCity.name}
            </div>
            <div className="truncate text-xs text-secondary">
              {formatKmAndDuration(trip.expectedDistanceKm)} · {formatINR(trip.ratePerKm)}/km · {formatINR(totalFare)} fare
              {extraKm != null && extraKm > 0 ? ` · +${formatKm(extraKm)} extra` : ''}
            </div>
          </div>
          <Badge variant="completed" className="shrink-0">
            Completed
          </Badge>
        </div>
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-secondary">
            Pickup: {formatPickupDateTime(trip.pickupAt)}
            <span className="ml-1.5 text-secondary/80">· Completed {formatRelativeTime(completedAt)}</span>
          </span>
        </div>
      </Link>
      <div className="flex items-center justify-between border-t px-4 py-2.5 text-xs font-semibold">
        <span className="flex items-baseline gap-1">
          <span className="text-secondary">Paid</span>
          <span className="text-base text-emerald-700">{formatINR(finalPayout)}</span>
          {tollAmount != null && tollAmount > 0 ? <span className="text-secondary">(incl. {formatINR(tollAmount)} toll)</span> : null}
        </span>
        <Link to={dest} className="flex items-center text-primary">
          View details
          <ChevronRight className="ml-0.5 size-3.5" aria-hidden />
        </Link>
      </div>
    </Card>
  );
}

export default CompletedTripCard;
