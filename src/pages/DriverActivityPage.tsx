import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ChevronDown, ChevronRight, Mail, MapPin, Plus, Trash2, XCircle } from 'lucide-react';
import { ScopedPageHeader } from '@/components/layout';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useDeclineTripInvite, useMyApplications, useTrips, useWithdrawApplication } from '@/hooks/useTrips';
import { useNotifications } from '@/hooks/useNotifications';
import { useMyDriver } from '@/hooks/useDrivers';
import { useCancelVacancy, useMyActiveVacancies, useMyExpiredVacancies } from '@/hooks/useVacancies';
import { useMyApplicationsStore } from '@/stores/myApplicationsStore';
import { PostedTripCard, STATUS_META } from '@/pages/PostedTripsPage';
import { CompletedTripCard } from '@/components/trip/CompletedTripCard';
import { ShareTripModal } from '@/components/share/ShareTripModal';
import { Badge, Button, Card, StatusBanner } from '@/components/ui';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import { cn, formatClockTime, formatINR, formatKmAndDuration, formatPickupDateTime, formatShortDate } from '@/lib/utils';
import type { AcceptanceStatus, MyApplication, Trip, TripStatus, Vacancy } from '@/types';

/** Drill-down scope (the home "Invites received" priority card lands here).
 *  Hides the tab strip, swaps the header to a back-arrow + title, renders just the
 *  scoped list. Mirrors the PostedTripsPage `?scope=` mode used by the Agent home cards. */
type Scope = 'invites-received';
function isScope(v: string | null): v is Scope {
  return v === 'invites-received';
}

type Tab = 'all' | 'driving' | 'invited' | 'applied' | 'selected' | 'completed' | 'cancelled' | 'available' | 'posted';
const TABS: { id: Tab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'driving', label: 'Driving' },
  { id: 'invited', label: 'Invited' },
  { id: 'applied', label: 'Applied' },
  { id: 'selected', label: 'Selected' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'available', label: "I'm vacant" },
  { id: 'posted', label: 'Posted by me' },
];
const tabBtn = (active: boolean) => cn('inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors', active ? 'bg-primary text-primary-foreground' : 'bg-gray-100 text-secondary hover:bg-gray-200');
const TAB_IDS = TABS.map((t) => t.id);
function isTab(v: string | null): v is Tab {
  return !!v && (TAB_IDS as string[]).includes(v);
}

const APPLICATION_BADGE: Record<AcceptanceStatus, { label: string; variant: 'success' | 'warning' | 'info' | 'muted' | 'destructive' | 'danger' }> = {
  applied: { label: 'Awaiting decision', variant: 'info' },
  selected: { label: 'Selected — accept it!', variant: 'warning' },
  accepted: { label: 'Accepted', variant: 'success' },
  rejected: { label: 'Not selected', variant: 'muted' },
  // Withdrawn: use the lighter `danger` variant (bg-red-100 text-red-700) so the
  // card pops in the driver's "My applications" list without screaming at them.
  // Main introduced `danger`; the redesign branch had been on `destructive` (solid
  // red) which was too aggressive — keeping `danger` here.
  withdrawn: { label: 'Withdrawn', variant: 'danger' },
  expired: { label: 'Expired', variant: 'muted' },
};

/** Statuses where the driver was actually picked — they're entitled to the full trip detail page (agent contact, OTP flow). */
function isPickedStatus(s: AcceptanceStatus): boolean {
  return s === 'selected' || s === 'accepted';
}

function applicantBanner(status: AcceptanceStatus, tripStatus: TripStatus): string | null {
  if (status === 'applied') {
    if (tripStatus === 'selected' || tripStatus === 'accepted' || tripStatus === 'in_progress' || tripStatus === 'completed') {
      return 'Another driver was selected for this trip. If they cancel, the agent can still pick you.';
    }
    return "Awaiting the agent's decision. If the chosen driver cancels, the agent can still pick you.";
  }
  if (status === 'rejected') return "You weren't selected for this trip.";
  if (status === 'withdrawn') return 'You withdrew your application.';
  if (status === 'expired') return 'This application expired before a decision was made.';
  return null;
}

/** Set of trip IDs the driver has an unread `trip_updated` notification for.
 *  Drives the amber "Date/time changed" chip on each Applied card and on the
 *  trip-detail diff banner. Hook is render-cheap — `useNotifications` shares
 *  the same react-query cache the notification bell already uses. */
function useUnreadTripUpdateIds(): Set<string> {
  const { data } = useNotifications({ unreadOnly: true });
  return useMemo(() => {
    const out = new Set<string>();
    for (const n of (data ?? [])) {
      if (n.type !== 'trip_updated') continue;
      const tid = (n.payloadJson as Record<string, unknown>)?.trip_id;
      if (typeof tid === 'string') out.add(tid);
    }
    return out;
  }, [data]);
}

function ApplicationRow({ app }: { app: MyApplication }) {
  const t = app.trip;
  const badge = APPLICATION_BADGE[app.status] ?? APPLICATION_BADGE.applied;
  // Did the trip poster edit the trip since this driver applied? If yes, surface
  // a "Trip details changed" chip on the card. Clicking through to /trips/:id will
  // show the full diff + Withdraw/Keep CTAs (TripDetailPage handles the read state).
  const updatedTripIds = useUnreadTripUpdateIds();
  const tripUpdated = updatedTripIds.has(t.id);
  // Defensive: STATUS_META is keyed by TripStatus, but the API has historically grown
  // its enum (selected/accepted/in_progress landed across separate releases). A trip
  // returned with an unrecognised status would crash with "Cannot read properties of
  // undefined (reading 'variant'|'label')" — surfaced 3 events / 1 user in Sentry.
  const tripMeta = STATUS_META[t.status] ?? { variant: 'muted' as const, label: String(t.status) };
  const picked = isPickedStatus(app.status);
  const [expanded, setExpanded] = useState(false);
  const withdrawMutation = useWithdrawApplication();
  const clearApplication = useMyApplicationsStore((s) => s.clearApplication);

  async function onWithdraw() {
    if (!window.confirm('Withdraw your application from this trip?')) return;
    try {
      await withdrawMutation.mutateAsync({ tripId: t.id, acceptanceId: app.acceptanceId });
      clearApplication(t.id);
      toast.success('Application withdrawn.');
    } catch {
      toast.error("Couldn't withdraw — please try again.");
    }
  }

  const summary = (
    <div className="block space-y-1.5 p-4 pb-3 text-left">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-bold">
            {t.fromCity.name} → {t.toCity.name}
          </div>
          <div className="truncate text-xs text-secondary">
            {formatKmAndDuration(t.expectedDistanceKm)} · {formatINR(t.ratePerKm)}/km · {formatINR(t.totalFare)} fare · +{formatINR(t.driverBata)} bata
          </div>
        </div>
        <Badge variant={badge.variant} className="shrink-0">
          {badge.label}
        </Badge>
      </div>
      {tripUpdated ? (
        <div className="flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900">
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden /> Trip details changed — tap to review
        </div>
      ) : null}
      <div className="truncate text-xs text-secondary">
        Pickup: {formatPickupDateTime(t.pickupAt)}
        {app.applicantQuotedRatePerKm ? ` · you quoted ${formatINR(app.applicantQuotedRatePerKm)}/km` : ''}
        {' · trip is '}
        {tripMeta.label.toLowerCase()}
      </div>
    </div>
  );

  if (picked) {
    return (
      <Card className="gap-0 p-0">
        <Link to={`/app/trips/${t.id}`} className="block">
          {summary}
        </Link>
        <div className="flex items-center justify-end border-t px-4 py-2.5 text-xs font-semibold">
          <Link to={`/app/trips/${t.id}`} className="flex items-center text-primary">
            View trip
            <ChevronRight className="ml-0.5 size-3.5" aria-hidden />
          </Link>
        </div>
      </Card>
    );
  }

  const banner = applicantBanner(app.status, t.status);
  const carBits: string[] = [];
  if (t.carTypeLabel) carBits.push(t.carTypeLabel);
  carBits.push(`${t.seatsRequired} seats`);
  carBits.push(t.acRequired ? 'AC' : 'Non-AC');

  // Withdrawn cards get a light-red wash so the driver's eye lands on the
  // status they need to know about. The badge alone is too small for that
  // signalling on a busy "My applications" list.
  const isWithdrawn = app.status === 'withdrawn';
  return (
    <Card className={cn('gap-0 p-0', isWithdrawn && 'border border-red-200 bg-red-50/60')}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={`applied-${app.acceptanceId}-body`}
        className="block w-full text-left"
      >
        {summary}
      </button>
      {expanded ? (
        <div id={`applied-${app.acceptanceId}-body`} className="space-y-3 border-t px-4 py-3">
          {banner ? <StatusBanner tone="warning">{banner}</StatusBanner> : null}
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
            <dt className="text-secondary">Route</dt>
            <dd className="text-right font-medium">{t.fromCity.name} → {t.toCity.name}</dd>
            <dt className="text-secondary">Distance</dt>
            <dd className="text-right font-medium">{formatKmAndDuration(t.expectedDistanceKm)}</dd>
            <dt className="text-secondary">Pickup</dt>
            <dd className="text-right font-medium">{formatPickupDateTime(t.pickupAt)}</dd>
            {t.fromPlace?.name ? (
              <>
                <dt className="text-secondary">Pickup area</dt>
                <dd className="text-right font-medium">{t.fromPlace.name}</dd>
              </>
            ) : null}
            <dt className="text-secondary">Fare</dt>
            <dd className="text-right font-medium">{formatINR(t.totalFare)} ({formatINR(t.ratePerKm)}/km)</dd>
            <dt className="text-secondary">Driver bata</dt>
            <dd className="text-right font-medium">+{formatINR(t.driverBata)}</dd>
            <dt className="text-secondary">Vehicle</dt>
            <dd className="text-right font-medium">{carBits.join(' · ')}</dd>
            {app.applicantQuotedRatePerKm ? (
              <>
                <dt className="text-secondary">Your quote</dt>
                <dd className="text-right font-medium">{formatINR(app.applicantQuotedRatePerKm)}/km</dd>
              </>
            ) : null}
          </dl>
        </div>
      ) : null}
      <div className="flex items-center justify-between border-t px-4 py-2.5 text-xs font-semibold">
        {app.status === 'applied' ? (
          <button
            type="button"
            onClick={() => void onWithdraw()}
            disabled={withdrawMutation.isPending}
            className="text-destructive hover:underline disabled:opacity-40"
          >
            {withdrawMutation.isPending ? 'Withdrawing…' : 'Withdraw application'}
          </button>
        ) : (
          <span aria-hidden />
        )}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={`applied-${app.acceptanceId}-body`}
          className="flex items-center text-primary"
        >
          {expanded ? 'Hide details' : 'View details'}
          <ChevronDown className={cn('ml-0.5 size-3.5 transition-transform', expanded && 'rotate-180')} aria-hidden />
        </button>
      </div>
    </Card>
  );
}

/**
 * Renders a trip list. Two modes:
 *  - `query`-mode: drives loading / error / empty UI from a `useTrips` query (used by invited / posted tabs).
 *  - `trips`-mode: a pre-filtered array (used by the driving / selected / completed / cancelled sub-buckets
 *    that derive from a single `drivingQuery` result, filtered client-side by trip status).
 */
function TripList({
  query,
  trips: preFiltered,
  emptyTitle,
  emptyMessage,
  onShare,
  errorTitle,
  linkFromPath,
}: {
  /** Drives the loading + error UI. Either pass `query` alone (data flows from query.data), or pass
   *  `query` + `trips` for a client-side-filtered sub-view of that query (loading/error still flow
   *  from the shared query). */
  query?: ReturnType<typeof useTrips>;
  trips?: Trip[];
  emptyTitle: string;
  emptyMessage: string;
  errorTitle: string;
  onShare: (t: Trip) => void;
  /** Breadcrumb passed to each PostedTripCard so the trip detail's Back arrow returns to
   *  THIS exact list (preserving the current `?tab=`). Without it, Back falls back to the
   *  default `/app/my-trips` (driving tab). */
  linkFromPath?: string;
}) {
  if (query) {
    if (query.isPending) return <LoadingSkeleton rows={4} />;
    if (query.isError) return <ErrorState title={errorTitle} message="Check your connection and try again." onRetry={() => void query.refetch()} />;
  }
  const trips = preFiltered ?? query?.data ?? [];
  if (trips.length === 0) return <EmptyState title={emptyTitle} message={emptyMessage} />;
  return (
    <div className="space-y-3">
      {trips.map((t) => (
        <PostedTripCard key={t.id} trip={t} onShare={() => onShare(t)} linkFromPath={linkFromPath} />
      ))}
    </div>
  );
}

const ALL_PRIORITY = { driving: 0, selected: 1, invited: 2, applied: 3, completed: 4, cancelled: 5 } as const;
type AllBucket = keyof typeof ALL_PRIORITY;
interface AllEntry { tripId: string; trip: Trip; bucket: AllBucket; application?: MyApplication }

/** Renders the union "All" view — each trip appears once, bucketed by the most-progressed lifecycle role
 *  the driver has on it (assigned wins over invited wins over applied). Applied bucket uses `ApplicationRow`
 *  to preserve acceptance-status badges; everything else uses `PostedTripCard`. */
function AllList({ entries, onShare, linkFromPath }: { entries: AllEntry[]; onShare: (t: Trip) => void; linkFromPath?: string }) {
  if (entries.length === 0) {
    return (
      <EmptyState
        title="No trips yet"
        message="Apply to an open trip, get invited, or post your own — they'll all show up here."
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/app/trips">Browse trips</Link>
          </Button>
        }
      />
    );
  }
  return (
    <div className="space-y-3">
      {entries.map((e) =>
        e.bucket === 'applied' && e.application ? (
          <ApplicationRow key={e.tripId} app={e.application} />
        ) : (
          <PostedTripCard key={e.tripId} trip={e.trip} onShare={() => onShare(e.trip)} linkFromPath={linkFromPath} />
        ),
      )}
    </div>
  );
}

/**
 * `/app/my-trips` — the driver's "My trips" tab: the trips assigned to them (Driving), the trips
 * they've applied to (Applied → `GET /trips/applied`), and the trips they posted themselves
 * (Posted by me). Reuses the posted-trip card; the Posted tab keeps its Share / Review-applicants
 * affordances. (The agent's "My posts" tab keeps the dedicated `/app/posted-trips` page.)
 */
export function DriverActivityPage() {
  const { user } = useAuth();
  // Tab selection is URL-backed so /my-trips?tab=available can be deep-linked
  // (the driver-home "I'm available" tile + post-vacancy success redirect both rely on this).
  const [searchParams, setSearchParams] = useSearchParams();
  const urlScope = searchParams.get('scope');
  const scope: Scope | null = isScope(urlScope) ? urlScope : null;
  const fromParam = searchParams.get('from') ?? '/app';
  const urlTab = searchParams.get('tab');
  const tab: Tab = isTab(urlTab) ? urlTab : 'driving';
  const setTab = (next: Tab) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'driving') params.delete('tab');
    else params.set('tab', next);
    setSearchParams(params, { replace: true });
  };
  const [shareTrip, setShareTrip] = useState<Trip | null>(null);

  const drivingQuery = useTrips({ assignedDriverId: 'me' });
  const postedQuery = useTrips(user ? { postedByUserId: user.id } : undefined, { enabled: !!user });
  const appliedQuery = useMyApplications();
  const invitedQuery = useTrips({ invited: 'me' });
  const myDriverQuery = useMyDriver();
  const myDriverId = myDriverQuery.data?.id ?? '';
  const availableQuery = useMyActiveVacancies(myDriverId);
  const expiredVacanciesQuery = useMyExpiredVacancies(myDriverId);

  // Sub-buckets carved out of `drivingQuery` (which returns every assigned trip regardless of status).
  // Driving = accepted + in_progress per product-owner decision: both are "trips I'm driving" — pre-start
  // with OTP ready, and live.
  const assigned = drivingQuery.data ?? [];
  const drivingTrips   = assigned.filter((t) => t.status === 'in_progress' || t.status === 'accepted');
  const selectedTrips  = assigned.filter((t) => t.status === 'selected');
  // Latest-completed first. Prefer the precise `trip_executions.completed_at` now that the
  // transform surfaces it; fall back to `updatedAt` for legacy rows. Ties go to `id` so
  // renders stay deterministic.
  const completedTrips = assigned
    .filter((t) => t.status === 'completed')
    .slice()
    .sort((a, b) => {
      const ka = a.completedAt ?? a.updatedAt ?? '';
      const kb = b.completedAt ?? b.updatedAt ?? '';
      return kb.localeCompare(ka) || a.id.localeCompare(b.id);
    });
  const cancelledTrips = assigned.filter((t) => t.status === 'cancelled');

  // "All" — union of every trip the driver has a role on, deduped by trip.id, bucketed by the
  // most-progressed role (assigned > invited > applied), sorted by lifecycle priority then pickupAt.
  const allEntries: AllEntry[] = (() => {
    const seen = new Map<string, AllEntry>();
    for (const t of assigned) {
      let bucket: AllBucket | undefined;
      if (t.status === 'in_progress' || t.status === 'accepted') bucket = 'driving';
      else if (t.status === 'selected') bucket = 'selected';
      else if (t.status === 'completed') bucket = 'completed';
      else if (t.status === 'cancelled') bucket = 'cancelled';
      if (bucket) seen.set(t.id, { tripId: t.id, trip: t, bucket });
    }
    for (const t of invitedQuery.data ?? []) {
      if (!seen.has(t.id)) seen.set(t.id, { tripId: t.id, trip: t, bucket: 'invited' });
    }
    for (const app of appliedQuery.data ?? []) {
      if (!seen.has(app.trip.id)) seen.set(app.trip.id, { tripId: app.trip.id, trip: app.trip, bucket: 'applied', application: app });
    }
    return [...seen.values()].sort((a, b) => {
      if (ALL_PRIORITY[a.bucket] !== ALL_PRIORITY[b.bucket]) return ALL_PRIORITY[a.bucket] - ALL_PRIORITY[b.bucket];
      return a.trip.pickupAt.localeCompare(b.trip.pickupAt);
    });
  })();

  const counts: Record<Tab, number | undefined> = {
    all: drivingQuery.data && invitedQuery.data && appliedQuery.data ? allEntries.length : undefined,
    driving: drivingQuery.data ? drivingTrips.length : undefined,
    selected: drivingQuery.data ? selectedTrips.length : undefined,
    completed: drivingQuery.data ? completedTrips.length : undefined,
    cancelled: drivingQuery.data ? cancelledTrips.length : undefined,
    invited: invitedQuery.data?.length,
    applied: appliedQuery.data?.length,
    available: availableQuery.data?.length,
    posted: postedQuery.data?.length,
  };

  // Scoped drill-down — render a focused list with a back arrow + scoped title and skip
  // the tab strip entirely. Triggered by `?scope=invites-received` from the home card.
  if (scope === 'invites-received') {
    // Match the DriverHomePage filter exactly so the home-card count and the page count agree:
    // only `invitationStatus === 'pending'` AND the driver hasn't already applied (a re-invite
    // can rewrite the invitation row back to pending — migration 033 has the FK guard but the
    // client filter keeps stale ones from leaking into the view).
    const appliedTripIds = new Set((appliedQuery.data ?? []).map((a) => a.trip.id));
    const scopedInvites = (invitedQuery.data ?? []).filter(
      (t) => t.invitationStatus === 'pending' && !appliedTripIds.has(t.id),
    );
    const inviteCount = scopedInvites.length;
    return (
      <div className="mx-auto max-w-md">
        {/* Indigo tint mirrors the home "Invitations waiting" card's tone. */}
        <ScopedPageHeader
          title="Invites received"
          subtitle={invitedQuery.data ? `${inviteCount} trip${inviteCount === 1 ? '' : 's'} waiting for your decision` : 'Loading invitations…'}
          backTo={fromParam}
          tone="indigo"
          icon={<Mail className="size-4" aria-hidden />}
        />
        <div className="space-y-3 p-4">
          {/* Breadcrumb — when the driver taps a trip in this scoped list, the trip
              detail's Back arrow walks back HERE (and from here on back to wherever the
              user came from, encoded in fromParam). Without this, Back would default to
              the plain `/app/my-trips` tabbed view. */}
          <InvitedList
            query={invitedQuery}
            trips={scopedInvites}
            onShare={setShareTrip}
            linkFromPath={`/app/my-trips?scope=invites-received${fromParam && fromParam !== '/app' ? `&from=${encodeURIComponent(fromParam)}` : '&from=/app'}`}
          />
        </div>
        {shareTrip ? <ShareTripModal trip={shareTrip} onClose={() => setShareTrip(null)} /> : null}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <header className="sticky top-0 z-10 flex items-center gap-2 bg-surface px-4 py-3 shadow-header">
        <h1 className="flex-1 text-base font-semibold">My trips</h1>
        <Button asChild size="sm" className="gap-1.5">
          <Link to="/app/trips/new">
            <Plus className="size-4" aria-hidden /> Post a trip
          </Link>
        </Button>
      </header>

      <div className="flex flex-wrap gap-1.5 border-b bg-white px-3 py-2">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} aria-pressed={tab === t.id} className={tabBtn(tab === t.id)}>
            {t.label}
            {counts[t.id] !== undefined ? <span className="opacity-70"> · {counts[t.id]}</span> : null}
          </button>
        ))}
      </div>

      {/* Breadcrumb URL passed to every trip card below — so the trip-detail Back arrow
       *  returns to the SAME tab the user came from (not the default `/app/my-trips` driving
       *  tab). `tab=driving` is the default → drop the param to keep URLs clean. */}
      <div className="space-y-3 p-4">
        {tab === 'all' && <AllList entries={allEntries} onShare={setShareTrip} linkFromPath="/app/my-trips" />}
        {tab === 'driving' && (
          <TripList
            query={drivingQuery}
            trips={drivingTrips}
            errorTitle="Couldn't load your trips"
            emptyTitle="No trips assigned to you yet"
            emptyMessage="When a trip manager picks you for a trip, it shows up here — once you accept (or one's in progress)."
            onShare={setShareTrip}
            linkFromPath="/app/my-trips"
          />
        )}
        {tab === 'selected' && (
          <TripList
            query={drivingQuery}
            trips={selectedTrips}
            errorTitle="Couldn't load your trips"
            emptyTitle="No trips waiting on your accept"
            emptyMessage="When a trip manager picks you, this is where you confirm — accept within the 15-min window."
            onShare={setShareTrip}
            linkFromPath="/app/my-trips?tab=selected"
          />
        )}
        {tab === 'completed' && (
          drivingQuery.isPending ? (
            <LoadingSkeleton rows={4} />
          ) : drivingQuery.isError ? (
            <ErrorState title="Couldn't load your trips" message="Check your connection and try again." onRetry={() => void drivingQuery.refetch()} />
          ) : completedTrips.length === 0 ? (
            <EmptyState title="No completed trips yet" message="Your completed trips will show up here with the route, distance driven and what you were paid." />
          ) : (
            <div className="space-y-3">
              {completedTrips.map((t) => (
                <CompletedTripCard key={t.id} trip={t} linkFromPath="/app/my-trips?tab=completed" />
              ))}
            </div>
          )
        )}
        {tab === 'cancelled' && (
          <TripList
            query={drivingQuery}
            trips={cancelledTrips}
            errorTitle="Couldn't load your trips"
            emptyTitle="No cancelled trips"
            emptyMessage="If a trip you were assigned to gets cancelled, you'll see it here for your records."
            onShare={setShareTrip}
            linkFromPath="/app/my-trips?tab=cancelled"
          />
        )}
        {tab === 'invited' && <InvitedList query={invitedQuery} onShare={setShareTrip} linkFromPath="/app/my-trips?tab=invited" />}
        {tab === 'posted' && (
          <TripList
            query={postedQuery}
            // Sort newest-posted first so a just-posted trip appears at the top, not at the
            // bottom (the server's default order is `pickup_at` ascending — fine for browse,
            // wrong for "my posts").
            trips={postedQuery.data ? [...postedQuery.data].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : undefined}
            errorTitle="Couldn't load your posts"
            emptyTitle="You haven't posted any trips"
            emptyMessage="Posted a trip you can't run yourself? It'll appear here with its status and applicants."
            onShare={setShareTrip}
            linkFromPath="/app/my-trips?tab=posted"
          />
        )}
        {tab === 'applied' && <AppliedList query={appliedQuery} />}
        {tab === 'available' && <AvailableList query={availableQuery} expiredQuery={expiredVacanciesQuery} />}
      </div>

      {shareTrip ? <ShareTripModal trip={shareTrip} onClose={() => setShareTrip(null)} /> : null}
    </div>
  );
}

function AppliedList({ query }: { query: ReturnType<typeof useMyApplications> }) {
  if (query.isPending) return <LoadingSkeleton rows={4} />;
  if (query.isError) return <ErrorState title="Couldn't load your applications" message="Check your connection and try again." onRetry={() => void query.refetch()} />;
  const apps = query.data ?? [];
  if (apps.length === 0) {
    return (
      <EmptyState
        title="You haven't applied to any trips"
        message="Browse open trips and apply — the ones you've applied to (and how they went) show up here."
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/app/trips">Browse trips</Link>
          </Button>
        }
      />
    );
  }
  return (
    <div className="space-y-3">
      {apps.map((a) => (
        <ApplicationRow key={a.acceptanceId} app={a} />
      ))}
    </div>
  );
}

/**
 * Driver's "Invited" tab — `<PostedTripCard>` per row plus an inline "Decline" action that flips
 * `trip_invitations.status` → 'declined'. The list filters out 'declined' invites server-side
 * (`GET /trips?invited=me`), so on success the row drops out of the queue and the agent's
 * `/app/trips/:id/invitations` shows the Declined badge.
 */
function InvitedList({
  query,
  trips: tripsOverride,
  onShare,
  linkFromPath,
}: {
  query: ReturnType<typeof useTrips>;
  /** Caller-supplied filtered list — overrides `query.data` so callers (e.g. the
   *  `?scope=invites-received` view) can pre-filter to pending-only invites while
   *  keeping the loading / error UI driven by the shared query. */
  trips?: Trip[];
  onShare: (t: Trip) => void;
  /** Breadcrumb path — passed to each PostedTripCard so the trip detail's Back arrow
   *  returns to THIS list (not the generic /my-trips fallback). Mirrors the pattern
   *  PostedTripsPage uses for its `?scope=invites-sent` chain. */
  linkFromPath?: string;
}) {
  const declineMutation = useDeclineTripInvite();
  if (query.isPending) return <LoadingSkeleton rows={4} />;
  if (query.isError) return <ErrorState title="Couldn't load your invites" message="Check your connection and try again." onRetry={() => void query.refetch()} />;
  const trips = tripsOverride ?? query.data ?? [];
  if (trips.length === 0) {
    return (
      <EmptyState
        title="No invitations yet"
        message="When a trip manager invites you to a trip directly, it shows up here. You'll see their name and phone so you can call before you apply."
      />
    );
  }
  async function onDecline(trip: Trip) {
    if (!trip.invitationId) return;
    if (!window.confirm("Decline this invite? It'll be removed from your Invited list and the agent will see it as declined.")) return;
    try {
      await declineMutation.mutateAsync({ tripId: trip.id, inviteId: trip.invitationId });
      toast.success('Invite declined.');
    } catch {
      toast.error("Couldn't decline — please try again.");
    }
  }
  return (
    <div className="space-y-3">
      {trips.map((t) => {
        // Render Decline INSIDE the card via PostedTripCard's footerSlot. Visually unified
        // with the trip row; full-width red preserves the deliberate-tap weight of a
        // destructive action vs. a compact icon next to "Share / View details".
        const declineFooter = t.invitationStatus === 'pending' && t.invitationId ? (
          <button
            type="button"
            onClick={() => void onDecline(t)}
            disabled={declineMutation.isPending}
            className={cn(
              'flex w-full items-center justify-center gap-1.5 bg-red-50/50 px-3 py-2.5 text-sm font-semibold text-red-700 transition-colors',
              'hover:bg-red-50 disabled:pointer-events-none disabled:opacity-50',
            )}
          >
            <XCircle className="size-4" aria-hidden />
            {declineMutation.isPending ? 'Declining…' : 'Decline invitation'}
          </button>
        ) : undefined;
        return (
          <PostedTripCard
            key={t.id}
            trip={t}
            onShare={() => onShare(t)}
            linkFromPath={linkFromPath}
            footerSlot={declineFooter}
          />
        );
      })}
    </div>
  );
}

function vacancyWindow(v: Vacancy): string {
  const from = new Date(v.availableFrom);
  if (Number.isNaN(from.getTime())) return v.availableFrom;
  const to = v.availableUntil ? new Date(v.availableUntil) : null;
  if (!to || Number.isNaN(to.getTime())) return `from ${formatShortDate(from)}, ${formatClockTime(from)}`;
  const sameDay = from.toDateString() === to.toDateString();
  return sameDay
    ? `${formatShortDate(from)}, ${formatClockTime(from)} – ${formatClockTime(to)}`
    : `${formatShortDate(from)} ${formatClockTime(from)} – ${formatShortDate(to)} ${formatClockTime(to)}`;
}

function VacancyRow({ vacancy }: { vacancy: Vacancy }) {
  const cancel = useCancelVacancy();
  const where = vacancy.currentPlace?.name ?? vacancy.currentCity.name;
  const destinations = vacancy.destinationCities.map((c) => c.name).join(', ');
  const expired = vacancy.status === 'expired';

  function onRemove() {
    const prompt = expired
      ? `Remove this expired availability from ${where}?`
      : `Remove your availability from ${where}?`;
    if (!window.confirm(prompt)) return;
    cancel.mutate(vacancy.id, {
      onSuccess: () => toast.success(expired ? 'Removed.' : 'Removed — agents won’t see this any more.'),
      onError: () => toast.error('Couldn’t remove that — please try again.'),
    });
  }

  return (
    <Card className={cn('gap-1.5', expired && 'border-red-200 bg-red-50/40')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className={cn('flex items-center gap-1.5 truncate font-bold', expired && 'text-red-900')}>
            <MapPin className="size-4 text-secondary" aria-hidden /> {where}
          </div>
          <div className={cn('mt-0.5 text-xs', expired ? 'text-red-800/80' : 'text-secondary')}>{vacancyWindow(vacancy)}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {expired ? (
            <Badge variant="destructive">Expired</Badge>
          ) : vacancy.minRatePerKm ? (
            <Badge variant="muted">≥ {formatINR(vacancy.minRatePerKm)}/km</Badge>
          ) : null}
          <button
            type="button"
            onClick={onRemove}
            disabled={cancel.isPending}
            aria-label={`Remove availability from ${where}`}
            className="rounded-md p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-40"
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        </div>
      </div>
      {destinations ? (
        <div className={cn('text-xs', expired ? 'text-red-800/80' : 'text-secondary')}>
          <span className={cn('font-medium', expired ? 'text-red-900' : 'text-foreground')}>Will drive to:</span> {destinations}
        </div>
      ) : null}
      {vacancy.notes ? <p className={cn('text-xs', expired ? 'text-red-800/80' : 'text-secondary')}>{vacancy.notes}</p> : null}
      {expired ? (
        <p className="text-xs font-semibold text-red-800">
          This vacancy expired — agents can’t see it any more. Remove it (and post a fresh one) when you’re ready.
        </p>
      ) : null}
    </Card>
  );
}

function AvailableList({
  query,
  expiredQuery,
}: {
  query: ReturnType<typeof useMyActiveVacancies>;
  expiredQuery: ReturnType<typeof useMyExpiredVacancies>;
}) {
  if (query.isPending) return <LoadingSkeleton rows={3} />;
  if (query.isError) return <ErrorState title="Couldn't load your availability" message="Check your connection and try again." onRetry={() => void query.refetch()} />;
  const vacancies = query.data ?? [];
  const expired = expiredQuery.data ?? [];
  if (vacancies.length === 0 && expired.length === 0) {
    return (
      <EmptyState
        title="You're not listed anywhere yet"
        message="Tap I'm vacant so agents can find you for trips going from your city."
        action={
          <Button asChild size="sm">
            <Link to="/app/vacancies/new">Post vacant</Link>
          </Button>
        }
      />
    );
  }
  return (
    <div className="space-y-3">
      {vacancies.map((v) => (
        <VacancyRow key={v.id} vacancy={v} />
      ))}
      {expired.length > 0 ? (
        <>
          <div className="pt-2 text-xs font-semibold uppercase tracking-wide text-red-700">
            Expired — please remove or repost
          </div>
          {expired.map((v) => (
            <VacancyRow key={v.id} vacancy={v} />
          ))}
        </>
      ) : null}
    </div>
  );
}

export default DriverActivityPage;
