import { Link } from 'react-router-dom';
import { ChevronRight, Mail } from 'lucide-react';
import { formatINR, formatPickupTime } from '@/lib/utils';
import type { Trip } from '@/types';

/**
 * Driver-side priority card — surfaces trips the driver has been invited to and
 * hasn't yet responded to. Data source is `useTrips({ invited: 'me' })`; the parent
 * filters to `invitationStatus === 'pending'` before passing in.
 *
 * 1 invite  → links straight to the trip detail (Accept / Decline live there).
 * ≥2        → opens the driver's `/my-trips?tab=invited` list.
 */
export function InvitesReceivedCard({ trips }: { trips: Trip[] }) {
  if (trips.length === 0) return null;

  if (trips.length === 1) {
    const trip = trips[0];
    return (
      <Link
        to={`/trips/${trip.id}?from=/`}
        aria-label={`Invitation to drive ${trip.fromCity.name} to ${trip.toCity.name} — tap to accept or decline`}
        className="block rounded-2xl border-2 border-indigo-300 bg-indigo-50 p-4 transition-colors hover:bg-indigo-100"
      >
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-indigo-700">
          <Mail className="size-3.5" aria-hidden /> Invitation waiting
        </div>
        <div className="mt-1 text-lg font-bold text-indigo-950">
          {trip.fromCity.name} → {trip.toCity.name}
        </div>
        <div className="mt-0.5 text-xs text-indigo-800">
          Pickup: {formatPickupTime(trip.pickupAt)} · {formatINR(trip.driverPayout)} payout
        </div>
        <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-indigo-700 px-4 py-1.5 text-sm font-semibold text-white">
          Accept or decline <ChevronRight className="size-4" aria-hidden />
        </div>
      </Link>
    );
  }

  return (
    <Link
      to="/my-trips?tab=invited"
      aria-label={`${trips.length} invitations waiting for your decision`}
      className="block rounded-2xl border-2 border-indigo-300 bg-indigo-50 p-4 transition-colors hover:bg-indigo-100"
    >
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-indigo-700">
        <Mail className="size-3.5" aria-hidden /> Invitations waiting
      </div>
      <div className="mt-1 text-lg font-bold text-indigo-950">
        {trips.length} trips invited you to drive
      </div>
      <div className="mt-0.5 text-xs text-indigo-800">Tap to review and accept or decline.</div>
      <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-indigo-700 px-4 py-1.5 text-sm font-semibold text-white">
        Review invitations <ChevronRight className="size-4" aria-hidden />
      </div>
    </Link>
  );
}

export default InvitesReceivedCard;
