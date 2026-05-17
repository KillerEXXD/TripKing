import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useMyApplications } from '@/hooks/useTrips';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import { formatINR, formatPickupTime } from '@/lib/utils';
import { routeChainText } from '@/components/trip/RouteChain';

const STATUS_TONE: Record<string, string> = {
  applied: 'bg-zinc-200 text-zinc-700',
  selected: 'bg-amber-100 text-amber-700',
  accepted: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-rose-100 text-rose-700',
  withdrawn: 'bg-zinc-100 text-zinc-500',
  expired: 'bg-zinc-100 text-zinc-500',
};

export function OperatorMyTripsPage() {
  const query = useMyApplications();
  const apps = query.data ?? [];

  return (
    <div className="mx-auto max-w-md">
      <header className="flex items-center gap-2 border-b border-border bg-surface px-3 py-2 text-[13px]">
        <Link to="/v2" aria-label="Back" className="rounded-control p-1 hover:bg-surface-muted">
          <ChevronLeft className="size-4" />
        </Link>
        <span className="font-semibold">My applications</span>
        <span className="ml-auto text-[11px] uppercase tracking-wide text-muted-foreground">{apps.length}</span>
      </header>
      {query.isLoading ? (
        <div className="p-3"><LoadingSkeleton rows={5} /></div>
      ) : query.isError ? (
        <div className="p-3"><ErrorState message="Couldn't load." onRetry={() => query.refetch()} /></div>
      ) : apps.length === 0 ? (
        <div className="p-3"><EmptyState title="No applications" message="You haven't applied to any trips yet." /></div>
      ) : (
        apps.map((a) => (
          <Link
            key={a.acceptanceId}
            to={`/v2/trips/${a.trip.id}`}
            className="grid grid-cols-[1fr_auto] items-center gap-2 border-b border-border px-3 py-2 text-[13px] hover:bg-surface-muted"
          >
            <div className="min-w-0">
              <div className="truncate font-medium">{routeChainText(a.trip)}</div>
              <div className="text-[11px] text-muted-foreground">
                {formatPickupTime(a.trip.pickupAt)} · {formatINR(a.trip.driverPayout)}
              </div>
            </div>
            <span className={`rounded-control px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${STATUS_TONE[a.status] ?? 'bg-zinc-100 text-zinc-600'}`}>
              {a.status}
            </span>
          </Link>
        ))
      )}
    </div>
  );
}

export default OperatorMyTripsPage;
