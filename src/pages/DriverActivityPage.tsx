import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Plus } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useMyApplications, useTrips } from '@/hooks/useTrips';
import { PostedTripCard, STATUS_META } from '@/pages/PostedTripsPage';
import { ShareTripModal } from '@/components/share/ShareTripModal';
import { Badge, Button, Card } from '@/components/ui';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import { cn, formatINR, formatKm, formatPickupTime } from '@/lib/utils';
import type { AcceptanceStatus, MyApplication, Trip } from '@/types';

type Tab = 'driving' | 'invited' | 'applied' | 'posted';
const TABS: { id: Tab; label: string }[] = [
  { id: 'driving', label: 'Driving' },
  { id: 'invited', label: 'Invited' },
  { id: 'applied', label: 'Applied' },
  { id: 'posted', label: 'Posted by me' },
];
const tabBtn = (active: boolean) => cn('inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors', active ? 'bg-primary text-primary-foreground' : 'bg-gray-100 text-secondary hover:bg-gray-200');

const APPLICATION_BADGE: Record<AcceptanceStatus, { label: string; variant: 'success' | 'warning' | 'info' | 'muted' | 'destructive' }> = {
  applied: { label: 'Awaiting decision', variant: 'info' },
  selected: { label: 'Selected — you got it!', variant: 'success' },
  rejected: { label: 'Not selected', variant: 'muted' },
  withdrawn: { label: 'Withdrawn', variant: 'muted' },
  expired: { label: 'Expired', variant: 'muted' },
};

function ApplicationRow({ app }: { app: MyApplication }) {
  const t = app.trip;
  const badge = APPLICATION_BADGE[app.status] ?? APPLICATION_BADGE.applied;
  return (
    <Card className="gap-0 p-0">
      <Link to={`/trips/${t.id}`} className="block space-y-1.5 p-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-bold">
              {t.fromCity.name} → {t.toCity.name}
            </div>
            <div className="truncate text-xs text-secondary">
              {formatKm(t.expectedDistanceKm)} · {formatINR(t.ratePerKm)}/km · {formatINR(t.totalFare)} fare · +{formatINR(t.driverBata)} bata
            </div>
          </div>
          <Badge variant={badge.variant} className="shrink-0">
            {badge.label}
          </Badge>
        </div>
        <div className="text-xs text-secondary">
          Pickup: {formatPickupTime(t.pickupAt)}
          {app.applicantQuotedRatePerKm ? ` · you quoted ${formatINR(app.applicantQuotedRatePerKm)}/km` : ''}
          {' · trip is '}
          {STATUS_META[t.status].label.toLowerCase()}
        </div>
      </Link>
      <div className="flex items-center justify-end border-t px-4 py-2.5 text-xs font-semibold">
        <Link to={`/trips/${t.id}`} className="flex items-center text-primary">
          View trip
          <ChevronRight className="ml-0.5 size-3.5" aria-hidden />
        </Link>
      </div>
    </Card>
  );
}

function TripList({
  query,
  emptyTitle,
  emptyMessage,
  onShare,
  errorTitle,
}: {
  query: ReturnType<typeof useTrips>;
  emptyTitle: string;
  emptyMessage: string;
  errorTitle: string;
  onShare: (t: Trip) => void;
}) {
  if (query.isPending) return <LoadingSkeleton rows={4} />;
  if (query.isError) return <ErrorState title={errorTitle} message="Check your connection and try again." onRetry={() => void query.refetch()} />;
  const trips = query.data ?? [];
  if (trips.length === 0) return <EmptyState title={emptyTitle} message={emptyMessage} />;
  return (
    <div className="space-y-3">
      {trips.map((t) => (
        <PostedTripCard key={t.id} trip={t} onShare={() => onShare(t)} />
      ))}
    </div>
  );
}

/**
 * `/my-trips` — the driver's "My trips" tab: the trips assigned to them (Driving), the trips
 * they've applied to (Applied → `GET /trips/applied`), and the trips they posted themselves
 * (Posted by me). Reuses the posted-trip card; the Posted tab keeps its Share / Review-applicants
 * affordances. (The agent's "My posts" tab keeps the dedicated `/posted-trips` page.)
 */
export function DriverActivityPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('driving');
  const [shareTrip, setShareTrip] = useState<Trip | null>(null);

  const drivingQuery = useTrips({ assignedDriverId: 'me' });
  const postedQuery = useTrips(user ? { postedByUserId: user.id } : undefined);
  const appliedQuery = useMyApplications();
  const invitedQuery = useTrips({ invited: 'me' });

  const counts = {
    driving: drivingQuery.data?.length,
    invited: invitedQuery.data?.length,
    applied: appliedQuery.data?.length,
    posted: postedQuery.data?.length,
  };

  return (
    <div className="mx-auto max-w-md">
      <header className="flex items-center gap-2 border-b bg-white px-4 py-3">
        <h1 className="flex-1 text-base font-semibold">My trips</h1>
        <Button asChild size="sm" className="gap-1.5">
          <Link to="/trips/new">
            <Plus className="size-4" aria-hidden /> Post a trip
          </Link>
        </Button>
      </header>

      <div className="flex gap-1 overflow-x-auto whitespace-nowrap border-b bg-white px-3 py-2">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} aria-pressed={tab === t.id} className={tabBtn(tab === t.id)}>
            {t.label}
            {counts[t.id] !== undefined ? <span className="opacity-70"> · {counts[t.id]}</span> : null}
          </button>
        ))}
      </div>

      <div className="space-y-3 p-4">
        {tab === 'driving' && (
          <TripList
            query={drivingQuery}
            errorTitle="Couldn't load your trips"
            emptyTitle="No trips assigned to you yet"
            emptyMessage="When a trip manager picks you for a trip, it shows up here — upcoming, in progress, and done."
            onShare={setShareTrip}
          />
        )}
        {tab === 'invited' && (
          <TripList
            query={invitedQuery}
            errorTitle="Couldn't load your invites"
            emptyTitle="No invitations yet"
            emptyMessage="When a trip manager invites you to a trip directly, it shows up here. You'll see their name and phone so you can call before you apply."
            onShare={setShareTrip}
          />
        )}
        {tab === 'posted' && (
          <TripList
            query={postedQuery}
            errorTitle="Couldn't load your posts"
            emptyTitle="You haven't posted any trips"
            emptyMessage="Posted a trip you can't run yourself? It'll appear here with its status and applicants."
            onShare={setShareTrip}
          />
        )}
        {tab === 'applied' && <AppliedList query={appliedQuery} />}
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
            <Link to="/trips">Browse trips</Link>
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

export default DriverActivityPage;
