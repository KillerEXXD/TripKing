import { useEffect, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronRight, Plus, Send, Share2, Sparkles, Users } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTrips } from '@/hooks/useTrips';
import { ShareTripModal } from '@/components/share/ShareTripModal';
import { AgentInProgressTripCard } from '@/components/trip/AgentInProgressTripCard';
import { PageHeader, PageShell, ScopedPageHeader } from '@/components/layout';
import { Badge, Button, Card, FilterBar, FilterPill } from '@/components/ui';
import { LiveDot } from '@/components/ui/LiveDot';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import type { BadgeProps } from '@/components/ui';
import { cn, formatINR, formatKmAndDuration, formatPickupDateTime, formatRelativeTime, isWithinMinutes } from '@/lib/utils';
import type { Trip, TripStatus } from '@/types';

/** 5-minute fresh-trip window — flips the `NEW` badge off automatically after the
 *  window closes without needing a navigation. Re-evaluates once per minute while the
 *  trip is still inside the window, then stops. */
const FRESH_TRIP_MINUTES = 5;
function useIsFresh(createdAt: string | null | undefined): boolean {
  const [fresh, setFresh] = useState(() => isWithinMinutes(createdAt, FRESH_TRIP_MINUTES));
  useEffect(() => {
    if (!fresh) return;
    const id = window.setInterval(() => {
      const stillFresh = isWithinMinutes(createdAt, FRESH_TRIP_MINUTES);
      setFresh(stillFresh);
      if (!stillFresh) window.clearInterval(id);
    }, 30_000);
    return () => window.clearInterval(id);
  }, [createdAt, fresh]);
  return fresh;
}

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

export function PostedTripCard({ trip, onShare, linkFromPath, footerSlot }: { trip: Trip; onShare: () => void; linkFromPath?: string;
  /** Optional bottom action row rendered INSIDE the card (separated by a divider). Used by
   *  the Driver's Invites Received list to embed a destructive "Decline invitation" button
   *  within the same card surface — keeps the affordance visually unified with the trip row
   *  instead of orphaned below it. */
  footerSlot?: ReactNode }) {
  // Fallback to a muted "raw status" label if the server sends a value we don't
  // have a mapping for (e.g. a new lifecycle state shipped before the client rebuild).
  // Prevents `Cannot read properties of undefined (reading 'variant')` crashes.
  const meta = STATUS_META[trip.status] ?? { variant: 'muted' as const, label: String(trip.status) };
  const hasApplicants = trip.applicantCount > 0;
  const hasInvites = trip.pendingInvitationCount > 0;
  const reviewable = hasApplicants && trip.status === 'has_applicants';
  const shareable = trip.status === 'open' || trip.status === 'has_applicants';
  // When the parent list page knows the user came through it (e.g. from a home-card
  // scoped view), it passes `linkFromPath` so the trip detail's back arrow returns
  // to the list — not to the detail page's default fallback.
  const fromSuffix = linkFromPath ? `?from=${encodeURIComponent(linkFromPath)}` : '';
  const dest = reviewable ? `/app/trips/${trip.id}/applicants${fromSuffix}` : `/app/trips/${trip.id}${fromSuffix}`;
  // Trips posted within the last 5 minutes wear a sparkle NEW badge + "Posted Xm ago"
  // line. Pure client-side derived from `trip.createdAt` — no URL param needed; the
  // listing already sorts newest-first so the fresh card is at the top.
  const fresh = useIsFresh(trip.createdAt);
  return (
    <Card
      className={cn(
        'gap-0 p-0',
        reviewable && 'border-amber-200 bg-amber-50/40',
        fresh && 'border-emerald-300 bg-emerald-50/30 shadow-[0_0_0_3px_rgba(16,185,129,0.15)]',
      )}
    >
      <Link to={dest} className="block space-y-2 p-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <div className="truncate font-bold">
                {trip.fromCity.name} → {trip.toCity.name}
              </div>
              {fresh ? (
                <Badge variant="success" aria-label="Newly posted trip" className="shrink-0">
                  <Sparkles className="size-3" aria-hidden /> NEW
                </Badge>
              ) : null}
            </div>
            <div className="truncate text-xs text-secondary">
              {formatKmAndDuration(trip.expectedDistanceKm)} · {formatINR(trip.ratePerKm)}/km · {formatINR(trip.totalFare)} fare · +{formatINR(trip.driverBata)} bata
            </div>
          </div>
          <Badge variant={meta.variant} className="shrink-0">
            {meta.label}
          </Badge>
        </div>
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-secondary">
            Pickup: {formatPickupDateTime(trip.pickupAt)}
            {/* Always show the "Posted X ago" age — fresh window (<5 min) uses the emerald
             *  highlight, anything older stays in the muted secondary tone. */}
            <span className={cn('ml-1.5', fresh ? 'text-emerald-700' : 'text-secondary/80')}>
              · Posted {formatRelativeTime(trip.createdAt)}
            </span>
          </span>
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
          <Link to={dest} className="flex items-center text-primary">
            {reviewable ? 'Review applicants' : 'View details'}
            <ChevronRight className="ml-0.5 size-3.5" aria-hidden />
          </Link>
        </div>
      </div>
      {footerSlot ? <div className="border-t">{footerSlot}</div> : null}
    </Card>
  );
}

/**
 * `/app/posted-trips` — the trips the signed-in user has posted, laid out like the
 * prototype: a white header strip with a "Post a trip" button, a horizontal tab
 * strip (with per-status counts), then per-trip cards (route + fare line + pickup
 * + applicant badge) with a Share button and a "Review applicants / View details"
 * link. Server-filtered to the caller via `useTrips({ postedByUserId })`.
 */
/** Focused drill-down view triggered by a home-card tap.
 *  When `?scope=invites-sent` is set the page becomes a slim "Invites sent" list — filter
 *  chips hidden (scope IS the filter), title swapped, back arrow to the home-card source
 *  (`?from=…`, defaults to `/`). Other scopes can be added later.
 */
type Scope = 'invites-sent';
const SCOPE_META: Record<Scope, { title: string; pred: (t: Trip) => boolean }> = {
  'invites-sent': {
    title: 'Invites sent',
    // Same predicate as the legacy `?status=invited` virtual chip.
    pred: (t) => t.pendingInvitationCount > 0 && (t.status === 'open' || t.status === 'has_applicants'),
  },
};
function isScope(v: string | null): v is Scope {
  return v === 'invites-sent';
}

export function PostedTripsPage() {
  const { user } = useAuth();
  // Filter is URL-backed (`?status=`) so deep links from /home priority cards work and
  // changing tabs updates the URL — mirrors the DriverActivityPage `?tab=` pattern (PR #64).
  // A separate `?scope=` param swaps the page into a scoped drill-down (no chip strip,
  // back arrow, scope-specific title) without touching the existing filter behaviour.
  const [searchParams, setSearchParams] = useSearchParams();
  const urlFilter = searchParams.get('status');
  const filter: Filter = isFilter(urlFilter) ? urlFilter : 'open';
  const urlScope = searchParams.get('scope');
  const scope: Scope | null = isScope(urlScope) ? urlScope : null;
  const from = searchParams.get('from') ?? '/';
  const setFilter = (next: Filter) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'open') params.delete('status');
    else params.set('status', next);
    setSearchParams(params, { replace: true });
  };
  const [shareTrip, setShareTrip] = useState<Trip | null>(null);
  const tripsQuery = useTrips(user ? { postedByUserId: user.id } : undefined, { enabled: !!user });

  const trips = tripsQuery.data ?? [];
  const scopedTrips = scope ? trips.filter(SCOPE_META[scope].pred) : trips;
  const shown = scope
    ? scopedTrips
    : filter === 'all'
    // "All" — sort by lifecycle priority (live trips first), then pickupAt ASC.
    ? [...trips].sort((a, b) => {
        const pa = FILTER_PRIORITY[bucketFor(a)];
        const pb = FILTER_PRIORITY[bucketFor(b)];
        if (pa !== pb) return pa - pb;
        return a.pickupAt.localeCompare(b.pickupAt);
      })
    : trips.filter((t) => bucketFor(t) === filter);
  const countFor = (f: Filter) => (f === 'all' ? trips.length : trips.filter((t) => bucketFor(t) === f).length);

  // Subtitle changes shape per mode.
  const subtitle = scope
    ? (() => {
        const tripCount = scopedTrips.length;
        if (scope === 'invites-sent') {
          const total = scopedTrips.reduce((s, t) => s + (t.pendingInvitationCount ?? 0), 0);
          return `${tripCount} trip${tripCount === 1 ? '' : 's'} · ${total} pending invite${total === 1 ? '' : 's'}`;
        }
        return `${tripCount} trip${tripCount === 1 ? '' : 's'}`;
      })()
    : tripsQuery.isSuccess
    ? `${trips.length} trip${trips.length === 1 ? '' : 's'}`
    : 'Trips you have posted';

  return (
    <PageShell>
      {scope ? (
        // Scoped drill-down — tinted header matches the blue tone of the home
        // "Invitations sent" card so the click-through reads as continuous.
        <ScopedPageHeader
          title={SCOPE_META[scope].title}
          subtitle={subtitle}
          backTo={from}
          tone="blue"
          icon={<Send className="size-4" aria-hidden />}
        />
      ) : (
        <PageHeader
          title={<span className="inline-flex items-center gap-2">My posts <LiveDot /></span>}
          subtitle={subtitle}
          right={
            <Button asChild size="sm" className="gap-1.5">
              <Link to="/app/trips/new">
                <Plus className="size-4" aria-hidden /> Post
              </Link>
            </Button>
          }
        />
      )}

      {!scope ? (
        <FilterBar ariaLabel="Filter trips by status" wrap className="mb-3">
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
      ) : null}

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
                <Link to="/app/trips/new">Post a trip</Link>
              </Button>
            }
          />
        ) : shown.length === 0 ? (
          scope ? (
            <EmptyState
              title={scope === 'invites-sent' ? 'No invitations pending' : 'Nothing to show'}
              message={scope === 'invites-sent' ? 'All your trips have been actioned or have no outstanding invites.' : 'Nothing matches this view.'}
              action={<Button asChild variant="outline" size="sm"><Link to={from}>Back to home</Link></Button>}
            />
          ) : (
            <EmptyState title={`No ${FILTER_LABEL[filter].toLowerCase()} trips`} message="Pick a different status." action={<Button variant="outline" size="sm" onClick={() => setFilter('all')}>Show all</Button>} />
          )
        ) : (
          shown.map((t) => (
            t.status === 'in_progress'
              ? <AgentInProgressTripCard key={t.id} trip={t} />
              : <PostedTripCard
                  key={t.id}
                  trip={t}
                  onShare={() => setShareTrip(t)}
                  linkFromPath={
                    scope
                      ? `/app/posted-trips?scope=${scope}${from && from !== '/' ? `&from=${from}` : '&from=/'}`
                      // No scope → still encode the current filter chip so the trip detail
                      // Back arrow returns to the same filter (Open / Cancelled / Invited / …),
                      // not the default Open tab.
                      : filter === 'open' ? '/app/posted-trips' : `/app/posted-trips?status=${filter}`
                  }
                />
          ))
        )}
      </div>

      {shareTrip ? <ShareTripModal trip={shareTrip} onClose={() => setShareTrip(null)} /> : null}
    </PageShell>
  );
}

export default PostedTripsPage;
