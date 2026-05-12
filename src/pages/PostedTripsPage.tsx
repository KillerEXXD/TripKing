import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTrips } from '@/hooks/useTrips';
import { Badge, Button, Card } from '@/components/ui';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import { formatINR } from '@/lib/utils';
import type { Trip, TripStatus } from '@/types';

const STATUS_META: Record<TripStatus, { label: string; variant: 'success' | 'warning' | 'info' | 'muted' | 'destructive' }> = {
  open: { label: 'Open', variant: 'success' },
  has_applicants: { label: 'Has applicants', variant: 'warning' },
  assigned: { label: 'Assigned', variant: 'info' },
  in_progress: { label: 'In progress', variant: 'info' },
  completed: { label: 'Completed', variant: 'muted' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
};
const FILTERS: ('all' | TripStatus)[] = ['all', 'open', 'has_applicants', 'assigned', 'in_progress', 'completed', 'cancelled'];

function pickupLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

function PostedTripCard({ trip }: { trip: Trip }) {
  const meta = STATUS_META[trip.status];
  return (
    <Link to={`/trips/${trip.id}`} className="block">
      <Card className="gap-3 transition-colors hover:border-primary/40">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-bold">
              {trip.fromCity.name} → {trip.toCity.name}
            </div>
            <div className="text-xs text-secondary">
              {Math.round(trip.expectedDistanceKm)} km · {pickupLabel(trip.pickupAt)}
            </div>
          </div>
          <Badge variant={meta.variant}>{meta.label}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-secondary">
          <span>{formatINR(trip.driverPayout)} payout</span>
          {trip.applicantCount > 0 ? (
            <Badge variant="warning">
              <Sparkles className="size-3" aria-hidden /> {trip.applicantCount} applicant{trip.applicantCount === 1 ? '' : 's'}
            </Badge>
          ) : null}
        </div>
      </Card>
    </Link>
  );
}

/**
 * `/posted-trips` — the trips the signed-in user has posted, with their statuses.
 * Server-filtered to the caller via `useTrips({ postedByUserId })`; a status
 * chip-strip narrows it client-side. (Reviewing applicants for a `has_applicants`
 * trip lives on the trip detail / applicant-review screen.)
 */
export function PostedTripsPage() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<'all' | TripStatus>('all');
  const tripsQuery = useTrips(user ? { postedByUserId: user.id } : undefined);

  const trips = tripsQuery.data ?? [];
  const shown = filter === 'all' ? trips : trips.filter((t) => t.status === filter);
  const countFor = (f: 'all' | TripStatus) => (f === 'all' ? trips.length : trips.filter((t) => t.status === f).length);

  return (
    <main className="mx-auto max-w-md space-y-4 p-4">
      <header className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">Your posted trips</h1>
          <p className="text-sm text-secondary">{tripsQuery.isSuccess ? `${trips.length} total` : 'Trips you have posted'}</p>
        </div>
        <Button asChild variant="full" size="sm">
          <Link to="/trips/new">Post a trip</Link>
        </Button>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const active = filter === f;
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={active}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${active ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background'}`}
            >
              {f === 'all' ? 'All' : STATUS_META[f].label}
              {tripsQuery.isSuccess ? ` (${countFor(f)})` : ''}
            </button>
          );
        })}
      </div>

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
        <div className="space-y-3">
          {shown.map((t) => (
            <PostedTripCard key={t.id} trip={t} />
          ))}
        </div>
      )}
    </main>
  );
}

export default PostedTripsPage;
