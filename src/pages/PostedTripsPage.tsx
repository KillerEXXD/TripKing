import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Plus, Share2, Users } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTrips } from '@/hooks/useTrips';
import { ShareTripModal } from '@/components/share/ShareTripModal';
import { Badge, Button, Card } from '@/components/ui';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import { cn, formatINR, formatKm } from '@/lib/utils';
import type { Trip, TripStatus } from '@/types';

export const STATUS_META: Record<TripStatus, { label: string; variant: 'success' | 'warning' | 'info' | 'muted' | 'destructive' }> = {
  open: { label: 'Open', variant: 'success' },
  has_applicants: { label: 'Needs review', variant: 'warning' },
  assigned: { label: 'Assigned', variant: 'info' },
  in_progress: { label: 'In progress', variant: 'info' },
  completed: { label: 'Completed', variant: 'muted' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
};
const FILTERS: ('all' | TripStatus)[] = ['all', 'open', 'has_applicants', 'assigned', 'in_progress', 'completed', 'cancelled'];

export function pickupLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}
const chip = (active: boolean) => cn('inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors', active ? 'bg-primary text-primary-foreground' : 'bg-gray-100 text-secondary hover:bg-gray-200');

export function PostedTripCard({ trip, onShare }: { trip: Trip; onShare: () => void }) {
  const meta = STATUS_META[trip.status];
  const hasApplicants = trip.applicantCount > 0;
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
          <span className="text-secondary">Pickup: {pickupLabel(trip.pickupAt)}</span>
          {hasApplicants ? (
            <Badge variant="warning">
              <Users className="size-3" aria-hidden /> {trip.applicantCount} applicant{trip.applicantCount === 1 ? '' : 's'}
            </Badge>
          ) : null}
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
        <Link to={dest} className="flex items-center text-primary">
          {reviewable ? 'Review applicants' : 'View details'}
          <ChevronRight className="ml-0.5 size-3.5" aria-hidden />
        </Link>
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
  const [filter, setFilter] = useState<'all' | TripStatus>('all');
  const [shareTrip, setShareTrip] = useState<Trip | null>(null);
  const tripsQuery = useTrips(user ? { postedByUserId: user.id } : undefined);

  const trips = tripsQuery.data ?? [];
  const shown = filter === 'all' ? trips : trips.filter((t) => t.status === filter);
  const countFor = (f: 'all' | TripStatus) => (f === 'all' ? trips.length : trips.filter((t) => t.status === f).length);

  return (
    <div className="mx-auto max-w-md">
      <header className="flex items-center gap-2 border-b bg-white px-4 py-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold">My posts</h1>
          <p className="text-xs text-secondary">{tripsQuery.isSuccess ? `${trips.length} trip${trips.length === 1 ? '' : 's'}` : 'Trips you have posted'}</p>
        </div>
        <Button asChild size="sm" className="gap-1.5">
          <Link to="/trips/new">
            <Plus className="size-4" aria-hidden /> Post a trip
          </Link>
        </Button>
      </header>

      <div className="flex gap-1 overflow-x-auto whitespace-nowrap border-b bg-white px-3 py-2">
        {FILTERS.map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f} className={chip(filter === f)}>
            {f === 'all' ? 'All' : STATUS_META[f].label}
            {tripsQuery.isSuccess ? <span className="opacity-70"> · {countFor(f)}</span> : null}
          </button>
        ))}
      </div>

      <div className="space-y-3 p-4">
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
          <EmptyState title={`No ${STATUS_META[filter as TripStatus].label.toLowerCase()} trips`} message="Pick a different status." action={<Button variant="outline" size="sm" onClick={() => setFilter('all')}>Show all</Button>} />
        ) : (
          shown.map((t) => <PostedTripCard key={t.id} trip={t} onShare={() => setShareTrip(t)} />)
        )}
      </div>

      {shareTrip ? <ShareTripModal trip={shareTrip} onClose={() => setShareTrip(null)} /> : null}
    </div>
  );
}

export default PostedTripsPage;
