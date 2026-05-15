import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTrips } from '@/hooks/useTrips';
import { QueueListPage } from '@/components/queue/QueueListPage';
import { Badge, Card } from '@/components/ui';
import { formatINR, formatPickupTime } from '@/lib/utils';
import type { Trip } from '@/types';

function TripRow({ trip }: { trip: Trip }) {
  return (
    <Link to={`/trips/${trip.id}/applicants?from=/queue/needs-action`} className="block">
      <Card className="gap-1.5 transition-colors hover:border-primary/40">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-bold">{trip.fromCity.name} → {trip.toCity.name}</div>
            <div className="text-xs text-secondary">
              Pickup {formatPickupTime(trip.pickupAt)} · {formatINR(trip.driverPayout)} payout
            </div>
          </div>
          <Badge variant="warning" className="shrink-0">
            {trip.applicantCount} applicant{trip.applicantCount === 1 ? '' : 's'}
          </Badge>
        </div>
      </Card>
    </Link>
  );
}

/**
 * `/queue/needs-action` — agent work-queue of posted trips with applicants
 * waiting for a driver selection. Reached from the Home "Review" card when
 * there are ≥2 such trips. As the agent picks a driver on each, the trip
 * leaves `has_applicants` status and drops out of the queue (handled by the
 * React Query invalidation in `useAssignDriver`). When the queue empties,
 * `<QueueListPage>` bounces back to Home.
 */
export function AgentNeedsActionQueuePage() {
  const { user } = useAuth();
  const query = useTrips(user ? { postedByUserId: user.id, status: 'has_applicants' } : undefined);
  const trips = query.data ?? [];

  return (
    <QueueListPage
      title="Waiting for your decision"
      subtitle={trips.length > 0 ? `${trips.length} trip${trips.length === 1 ? '' : 's'} need a driver` : undefined}
      icon={<Sparkles className="size-4 text-amber-700" />}
      items={trips}
      getKey={(t) => t.id}
      renderItem={(t) => <TripRow trip={t} />}
      isPending={query.isPending}
      isError={query.isError}
      onRetry={() => void query.refetch()}
      emptyTitle="No applicants waiting"
      emptyMessage="When drivers apply to your trips, they'll show up here so you can pick one."
    />
  );
}

export default AgentNeedsActionQueuePage;
