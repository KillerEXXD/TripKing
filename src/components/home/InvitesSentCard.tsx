import { Send } from 'lucide-react';
import { PriorityCard } from '@/components/ui';
import type { Trip } from '@/types';

/**
 * Home-tab priority card — surfaces the total pending invitations the caller has sent
 * across all their posted trips, and how many trips those invites are spread across.
 * Renders nothing when no trip has pending invites (consistent with the "hide empty
 * cards on home" pattern).
 *
 * 1 trip with invites → straight to that trip's `/invitations` view.
 * ≥2                  → opens the "Invited" filter on `/posted-trips`.
 *
 * Driven by the server-computed `pendingInvitationCount` already on every trip row,
 * so this is pure presentation — no extra fetch.
 */
export function InvitesSentCard({ trips }: { trips: Trip[] }) {
  const tripsWithInvites = trips.filter((t) => (t.pendingInvitationCount ?? 0) > 0);
  if (tripsWithInvites.length === 0) return null;

  const total = tripsWithInvites.reduce((sum, t) => sum + (t.pendingInvitationCount ?? 0), 0);
  const tripCount = tripsWithInvites.length;
  const to = tripCount === 1 ? `/trips/${tripsWithInvites[0].id}/invitations` : '/posted-trips?status=invited';
  const subtitle = tripCount === 1
    ? `for ${tripsWithInvites[0].fromCity.name} → ${tripsWithInvites[0].toCity.name}`
    : `across ${tripCount} trips`;

  return (
    <PriorityCard
      to={to}
      ariaLabel={`${total} invitation${total === 1 ? '' : 's'} awaiting driver decision`}
      tone="blue"
      icon={<Send className="size-3.5" aria-hidden />}
      label="Invitations sent"
      title={`${total} invite${total === 1 ? '' : 's'} awaiting driver`}
      subtitle={subtitle}
      cta={{ label: tripCount === 1 ? 'View invitations' : 'View by trip' }}
    />
  );
}

export default InvitesSentCard;
