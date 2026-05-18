import { Link } from 'react-router-dom';
import { Navigation } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTrips } from '@/hooks/useTrips';
import { QueueListPage } from '@/components/queue/QueueListPage';
import { Card } from '@/components/ui';
import { formatINR, formatPickupDateTime } from '@/lib/utils';
import type { Trip } from '@/types';

function TripRow({ trip }: { trip: Trip }) {
  const driverName = trip.assignedDriver?.fullName ?? (trip.assignedDriverHandle ? `Driver ${trip.assignedDriverHandle}` : 'Driver');
  return (
    <Link to={`/app/trips/${trip.id}?from=/queue/in-progress`} className="block">
      <Card className="gap-1.5 transition-colors hover:border-primary/40">
        <div className="font-bold">{trip.fromCity.name} → {trip.toCity.name}</div>
        <div className="text-xs text-secondary">
          {driverName} · pickup {formatPickupDateTime(trip.pickupAt)} · {formatINR(trip.driverPayout)} payout
        </div>
      </Card>
    </Link>
  );
}

/**
 * `/app/queue/in-progress` — agent work-queue of their posted trips currently being
 * driven. Reached from the Home "Driving now" card when there are ≥2 trips
 * (1 trip skips the queue and goes straight to detail). Back button → Home;
 * once the queue empties (every trip completed), the page auto-bounces home.
 */
export function AgentInProgressQueuePage() {
  const { user } = useAuth();
  const query = useTrips(user ? { postedByUserId: user.id, status: 'in_progress' } : undefined);
  const trips = query.data ?? [];

  return (
    <QueueListPage
      title="Trips in progress"
      subtitle={trips.length > 0 ? `${trips.length} trip${trips.length === 1 ? '' : 's'} on the road` : undefined}
      icon={<Navigation className="size-4" />}
      tone="emerald"
      items={trips}
      getKey={(t) => t.id}
      renderItem={(t) => <TripRow trip={t} />}
      isPending={query.isPending}
      isError={query.isError}
      onRetry={() => void query.refetch()}
      emptyTitle="No trips in progress"
      emptyMessage="When one of your trips starts moving, it'll show up here."
    />
  );
}

export default AgentInProgressQueuePage;
