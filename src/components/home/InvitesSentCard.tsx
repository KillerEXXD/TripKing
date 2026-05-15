import { Link } from 'react-router-dom';
import { ChevronRight, Send } from 'lucide-react';
import type { Trip } from '@/types';

/**
 * Home-tab priority card — surfaces the total pending invitations the caller has sent
 * across all their posted trips, and how many trips those invites are spread across.
 *
 * 0 → empty-state, not actionable. 1 trip with invites → straight to that trip's
 * `/invitations` view. ≥2 → opens the "Invited" filter on `/posted-trips`.
 *
 * Driven by the server-computed `pendingInvitationCount` already on every trip row,
 * so this is pure presentation — no extra fetch.
 */
export function InvitesSentCard({ trips }: { trips: Trip[] }) {
  const tripsWithInvites = trips.filter((t) => (t.pendingInvitationCount ?? 0) > 0);
  const total = tripsWithInvites.reduce((sum, t) => sum + (t.pendingInvitationCount ?? 0), 0);
  const tripCount = tripsWithInvites.length;

  if (tripCount === 0) {
    return (
      <div className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
          <Send className="size-3.5" aria-hidden /> Invitations sent
        </div>
        <div className="mt-1 text-sm font-medium text-slate-700">No pending invites</div>
        <div className="mt-0.5 text-xs text-slate-500">
          When you invite specific drivers to a trip, you'll see how many are still awaiting their decision here.
        </div>
      </div>
    );
  }

  const to = tripCount === 1 ? `/trips/${tripsWithInvites[0].id}/invitations` : '/posted-trips?status=invited';
  const sublabel = tripCount === 1
    ? `for ${tripsWithInvites[0].fromCity.name} → ${tripsWithInvites[0].toCity.name}`
    : `across ${tripCount} trips`;

  return (
    <Link
      to={to}
      aria-label={`${total} invitation${total === 1 ? '' : 's'} awaiting driver decision`}
      className="block rounded-2xl border-2 border-blue-300 bg-blue-50 p-4 transition-colors hover:bg-blue-100"
    >
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-blue-700">
        <Send className="size-3.5" aria-hidden /> Invitations sent
      </div>
      <div className="mt-1 text-lg font-bold text-blue-950">
        {total} invite{total === 1 ? '' : 's'} awaiting driver
      </div>
      <div className="mt-0.5 text-xs text-blue-800">{sublabel}</div>
      <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-blue-700 px-4 py-1.5 text-sm font-semibold text-white">
        {tripCount === 1 ? 'View invitations' : 'View by trip'} <ChevronRight className="size-4" aria-hidden />
      </div>
    </Link>
  );
}

export default InvitesSentCard;
