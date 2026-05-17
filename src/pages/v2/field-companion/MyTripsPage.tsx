import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useMyApplications } from '@/hooks/useTrips';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import { formatINR, formatPickupTime } from '@/lib/utils';

export function FieldMyTripsPage() {
  const query = useMyApplications();
  const apps = query.data ?? [];

  return (
    <div className="min-h-dvh pb-10">
      <header className="flex items-center gap-3 px-5 pt-4">
        <Link to="/v3" aria-label="Back" className="rounded-pill bg-surface p-2">
          <ChevronLeft className="size-5" />
        </Link>
        <h1 className="text-[22px] font-bold">My trips</h1>
      </header>
      <div className="mt-4 space-y-3 px-5">
        {query.isLoading ? (
          <LoadingSkeleton rows={3} />
        ) : query.isError ? (
          <ErrorState message="Couldn't load." onRetry={() => query.refetch()} />
        ) : apps.length === 0 ? (
          <EmptyState title="No trips yet" message="Apply for a trip and it'll appear here." />
        ) : (
          apps.map((a) => (
            <Link
              key={a.acceptanceId}
              to={`/v3/trips/${a.trip.id}`}
              className="block rounded-card bg-surface p-5 shadow-card"
            >
              <div className="text-[12px] uppercase tracking-wide text-primary">{a.status}</div>
              <div className="mt-1 text-[22px] font-bold leading-tight">
                {a.trip.fromCity?.name} → {a.trip.toCity?.name}
              </div>
              <div className="mt-2 flex items-center justify-between text-[14px] text-muted-foreground">
                <span>{formatPickupTime(a.trip.pickupAt)}</span>
                <span className="font-semibold text-foreground">{formatINR(a.trip.driverPayout)}</span>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

export default FieldMyTripsPage;
