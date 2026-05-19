import { Send } from 'lucide-react';
import { PriorityCard } from '@/components/ui';
import type { Trip } from '@/types';

/**
 * Home-tab priority card — surfaces the total pending invitations the caller has sent
 * across all their posted trips, and how many trips those invites are spread across.
 * Renders nothing when no trip has pending invites (consistent with the "hide empty
 * cards on home" pattern).
 *
 * 1 trip with invites → straight to that trip's `/invitations` view (with `?from=/app`
 *   so its back arrow returns to home).
 * ≥2                  → a scoped view at `/app/posted-trips?scope=invites-sent`
 *   (filter strip hidden, back arrow → home). NOT the filtered /posted-trips
 *   page — the user shouldn't have to know what the "Invited" chip means.
 *
 * Driven by the server-computed `pendingInvitationCount` already on every trip row,
 * so this is pure presentation — no extra fetch.
 */
export function InvitesSentCard({ trips }: { trips: Trip[] }) {
  // Count only trips where pending invites are still actionable — once a trip is
  // selected / accepted / in_progress / completed / cancelled, any leftover invitation
  // rows are stale (the agent's already decided). The `?scope=invites-sent` page on
  // /posted-trips applies the same predicate, so this card's count + tripCount agree
  // with what the user sees after tapping through.
  const tripsWithInvites = trips.filter(
    (t) => (t.pendingInvitationCount ?? 0) > 0 && (t.status === 'open' || t.status === 'has_applicants'),
  );
  if (tripsWithInvites.length === 0) return null;

  const total = tripsWithInvites.reduce((sum, t) => sum + (t.pendingInvitationCount ?? 0), 0);
  const tripCount = tripsWithInvites.length;
  const to = tripCount === 1
    ? `/app/trips/${tripsWithInvites[0].id}/invitations?from=/app`
    : '/app/posted-trips?scope=invites-sent&from=/app';
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
