import { Mail } from 'lucide-react';
import { PriorityCard } from '@/components/ui';
import { formatINR, formatPickupDateTime } from '@/lib/utils';
import type { Trip } from '@/types';

/**
 * Driver-side priority card — surfaces trips the driver has been invited to and
 * hasn't yet responded to. Data source is `useTrips({ invited: 'me' })`; the parent
 * filters to `invitationStatus === 'pending'` before passing in.
 *
 * 1 invite  → links straight to the trip detail (Accept / Decline live there).
 * ≥2        → opens the driver's `/my-trips?scope=invites-received` scoped view
 *             (filter strip hidden, back arrow → home).
 */
export function InvitesReceivedCard({ trips }: { trips: Trip[] }) {
  if (trips.length === 0) return null;
  const icon = <Mail className="size-3.5" aria-hidden />;

  if (trips.length === 1) {
    const trip = trips[0];
    return (
      <PriorityCard
        to={`/trips/${trip.id}?from=/`}
        ariaLabel={`Invitation to drive ${trip.fromCity.name} to ${trip.toCity.name} — tap to accept or decline`}
        tone="indigo"
        icon={icon}
        label="Invitation waiting"
        title={`${trip.fromCity.name} → ${trip.toCity.name}`}
        subtitle={`Pickup: ${formatPickupDateTime(trip.pickupAt)} · ${formatINR(trip.driverPayout)} payout`}
        cta={{ label: 'Accept or decline' }}
      />
    );
  }

  return (
    <PriorityCard
      to="/my-trips?scope=invites-received&from=/"
      ariaLabel={`${trips.length} invitations waiting for your decision`}
      tone="indigo"
      icon={icon}
      label="Invitations waiting"
      title={`${trips.length} trips invited you to drive`}
      subtitle="Tap to review and accept or decline."
      cta={{ label: 'Review invitations' }}
    />
  );
}

export default InvitesReceivedCard;
