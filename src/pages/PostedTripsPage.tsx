import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronRight, Plus, Send, Share2, Users } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTrips } from '@/hooks/useTrips';
import { ShareTripModal } from '@/components/share/ShareTripModal';
import { AgentInProgressTripCard } from '@/components/trip/AgentInProgressTripCard';
import { PageHeader, PageShell } from '@/components/layout';
import { Badge, Button, Card, FilterBar, FilterPill } from '@/components/ui';
import { LiveDot } from '@/components/ui/LiveDot';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import type { BadgeProps } from '@/components/ui';
import { cn, formatINR, formatKm, formatPickupTime } from '@/lib/utils';
import type { Trip, TripStatus } from '@/types';

type StatusBadgeVariant = NonNullable<BadgeProps['variant']>;

// Redesign: prefer the new semantic Badge variants (open / invited / completed / live) where they
// fit the status; fall back to the legacy info / warning / destructive for the in-between
// lifecycle states the system spec doesn't name.
export const STATUS_META: Record<TripStatus, { label: string; variant: StatusBadgeVariant }> = {
  open: { label: 'Open', variant: 'open' },
  has_applicants: { label: 'Has applicants', variant: 'warning' },
  selected: { label: 'Selected', variant: 'warning' },
  accepted: { label: 'Accepted', variant: 'info' },
  in_progress: { label: 'In progress', variant: 'live' },
  completed: { label: 'Completed', variant: 'completed' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
};

/** Virtual filter — not a real `trips.status`. Surfaces trips with ≥1 `trip_invitations` row in
 *  status='pending' (driven by the server-derived `pendingInvitationCount`). A trip is bucketed as
 *  "Invited" iff it has pending invitations AND its status is `open` or `has_applicants`; once a
 *  driver applies / is selected / etc., the trip moves on to its real status bucket. */
type Filter = 'all' | 'invited' | TripStatus;
const FILTERS: Filter[] = ['all', 'in_progress', 'open', 'invited', 'has_applicants', 'selected', 'accepted', 'completed', 'cancelled'];
const FILTER_LABEL: Record<Filter, string> = {
  all: 'All',
  invited: 'Invited',
  open: STATUS_META.open.label,
  has_applicants: STATUS_META.has_applicants.label,
  selected: STATUS_META.selected.label,
  accepted: STATUS_META.accepted.label,
  in_progress: STATUS_META.in_progress.label,
  completed: STATUS_META.completed.label,
  cancelled: STATUS_META.cancelled.label,
};
/** Determines which chip a trip lives under — each trip belongs to exactly one bucket so chip counts add to the total. */
function bucketFor(trip: Trip): Filter {
  if (trip.pendingInvitationCount > 0 && (trip.status === 'open' || trip.status === 'has_applicants')) return 'invited';
  return trip.status;
}
/** Lifecycle priority for the "All" sort — live/actionable buckets bubble above terminal ones.
 *  In progress is the live "happening right now" bucket — sort it above everything else so the
 *  agent's eye lands on the trip they need to be tracking. */
const FILTER_PRIORITY: Record<Filter, number> = {
  all: 99, in_progress: 0, open: 1, invited: 2, has_applicants: 3, selected: 4, accepted: 5, completed: 6, cancelled: 7,
};

function isFilter(v: string | null): v is Filter {
  return !!v && (FILTERS as string[]).includes(v);
}

export function PostedTripCard({ trip, onShare }: { trip: Trip; onShare: () => void }) {
  // Fallback to a muted "raw status" label if the server sends a value we don't
  // have a mapping for (e.g. a new lifecycle state shipped before the client rebuild).
  // Prevents `Cannot read properties of undefined (reading 'variant')` crashes.
  const meta = STATUS_META[trip.status] ?? { variant: 'muted' as const, label: String(trip.status) };
  const hasApplicants = trip.applicantCount > 0;
  const hasInvites = trip.pendingInvitationCount > 0;
  const reviewable = hasApplicants && trip.status === 'has_applicants';
  const shareable = trip.status === 'open' || trip.status === 'has_applicants';
  const dest = reviewable ? `/trips/${trip.id}/applicants` : `/trips/${trip.id}`;
  return (
    <Card className={cn('gap-0 p-0', reviewable && 'border-amber-200 bg-amber-50/40')}>
      <Link to={dest} className="block space-y-2 p-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-bold">
              {trip.fromCity.name} → {trip.toCity.name}
            </div>
            <div className="truncate text-xs text-secondary">
              {formatKm(trip.expectedDistanceKm)} · {formatINR(trip.ratePerKm)}/km · {formatINR(trip.totalFare)} fare · +{formatINR(trip.driverBata)} bata
            </div>
          </div>
          <Badge variant={meta.variant} className="shrink-0">
            {meta.label}
          </Badge>
        </div>
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-secondary">Pickup: {formatPickupTime(trip.pickupAt)}</span>
          <div className="flex items-center gap-1.5">
            {hasInvites ? (
              <Badge variant="info">
                <Send className="size-3" aria-hidden /> {trip.pendingInvitationCount} invited
              </Badge>
            ) : null}
            {hasApplicants ? (
              <Badge variant="warning">
                <Users className="size-3" aria-hidden /> {trip.applicantCount} applicant{trip.applicantCount === 1 ? '' : 's'}
              </Badge>
            ) : null}
          </div>
        </div>
      </Link>
      <div className="flex items-center justify-between border-t px-4 py-2.5 text-xs font-semibold">
        {shareable ? (
          <button type="button" onClick={onShare} aria-label={`Share ${trip.fromCity.name} to ${trip.toCity.name}`} className="-ml-2 flex items-center gap-1 rounded-md px-2 py-1 text-emerald-700 hover:bg-emerald-50">
            <Share2 className="size-3.5" aria-hidden /> Share
          </button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-3">
          {hasInvites ? (
            <Link to={`/trips/${trip.id}/invitations`} className="flex items-center text-blue-700">
              View invites <ChevronRight className="ml-0.5 size-3.5" aria-hidden />
            </Link>
          ) : null}
          <Link to={dest} className="flex items-center text-primary">
            {reviewable ? 'Review applicants' : 'View details'}
            <ChevronRight className="ml-0.5 size-3.5" aria-hidden />
          </Link>
        </div>
      </div>
    </Card>
  );
}

/**
 * `/posted-trips` — the trips the signed-in user has posted, laid out like the
 * prototype: a white header strip with a "Post a trip" button, a horizontal tab
 * strip (with per-status counts), then per-trip cards (route + fare line + pickup
 * + applicant badge) with a Share button and a "Review applicants / View details"
 * link. Server-filtered to the caller via `useTrips({ postedByUserId })`.
 */
export function PostedTripsPage() {
  const { user } = useAuth();
  // Filter is URL-backed (`?status=`) so deep links from /home priority cards work and
  // changing tabs updates the URL — mirrors the DriverActivityPage `?tab=` pattern (PR #64).
  const [searchParams, setSearchParams] = useSearchParams();
  const urlFilter = searchParams.get('status');
  const filter: Filter = isFilter(urlFilter) ? urlFilter : 'open';
  const setFilter = (next: Filter) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'open') params.delete('status');
    else params.set('status', next);
    setSearchParams(params, { replace: true });
  };
  const [shareTrip, setShareTrip] = useState<Trip | null>(null);
  const tripsQuery = useTrips(user ? { postedByUserId: user.id } : undefined, { enabled: !!user });

  const trips = tripsQuery.data ?? [];
  const shown = filter === 'all'
    // "All" — sort by lifecycle priority (live trips first), then pickupAt ASC.
    ? [...trips].sort((a, b) => {
        const pa = FILTER_PRIORITY[bucketFor(a)];
        const pb = FILTER_PRIORITY[bucketFor(b)];
        if (pa !== pb) return pa - pb;
        return a.pickupAt.localeCompare(b.pickupAt);
      })
    : trips.filter((t) => bucketFor(t) === filter);
  const countFor = (f: Filter) => (f === 'all' ? trips.length : trips.filter((t) => bucketFor(t) === f).length);

  const subtitle = tripsQuery.isSuccess
    ? `${trips.length} trip${trips.length === 1 ? '' : 's'}`
    : 'Trips you have posted';

  return (
    <PageShell>
      <PageHeader
        title={<span className="inline-flex items-center gap-2">My posts <LiveDot /></span>}
        subtitle={subtitle}
        right={
          <Button asChild size="sm" className="gap-1.5">
            <Link to="/trips/new">
              <Plus className="size-4" aria-hidden /> Post
            </Link>
          </Button>
        }
      />

      <FilterBar ariaLabel="Filter trips by status" className="mb-3">
        {FILTERS.map((f) => (
          <FilterPill
            key={f}
            active={filter === f}
            onClick={() => setFilter(f)}
            count={tripsQuery.isSuccess ? countFor(f) : undefined}
          >
            {FILTER_LABEL[f]}
          </FilterPill>
        ))}
      </FilterBar>

      <div className="space-y-3">
        {tripsQuery.isPending ? (
          <LoadingSkeleton rows={4} />
        ) : tripsQuery.isError ? (
          <ErrorState title="Couldn't load your trips" message="Check your connection and try again." onRetry={() => void tripsQuery.refetch()} />
        ) : trips.length === 0 ? (
          <EmptyState
            title="You haven't posted any trips yet"
            message="Post a trip and it'll show up here with its status and applicants."
            action={
              <Button asChild variant="outline" size="sm">
                <Link to="/trips/new">Post a trip</Link>
              </Button>
            }
          />
        ) : shown.length === 0 ? (
          <EmptyState title={`No ${FILTER_LABEL[filter].toLowerCase()} trips`} message="Pick a different status." action={<Button variant="outline" size="sm" onClick={() => setFilter('all')}>Show all</Button>} />
        ) : (
          shown.map((t) => (
            t.status === 'in_progress'
              ? <AgentInProgressTripCard key={t.id} trip={t} />
              : <PostedTripCard key={t.id} trip={t} onShare={() => setShareTrip(t)} />
          ))
        )}
      </div>

      {shareTrip ? <ShareTripModal trip={shareTrip} onClose={() => setShareTrip(null)} /> : null}
    </PageShell>
  );
}

export default PostedTripsPage;
