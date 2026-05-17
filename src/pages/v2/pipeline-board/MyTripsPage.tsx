import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useMyApplications } from '@/hooks/useTrips';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import { formatINR, formatPickupTime } from '@/lib/utils';
import { routeChainText } from '@/components/trip/RouteChain';

const COLUMNS: { status: string; label: string; tint: string }[] = [
  { status: 'applied', label: 'Applied', tint: 'open' },
  { status: 'selected', label: 'Selected', tint: 'has_applicants' },
  { status: 'accepted', label: 'Accepted', tint: 'assigned' },
  { status: 'rejected', label: 'Rejected', tint: 'cancelled' },
];

export function PipelineMyTripsPage() {
  const query = useMyApplications();
  const apps = query.data ?? [];

  const byStatus = useMemo(() => {
    const m: Record<string, typeof apps> = {};
    for (const a of apps) (m[a.status] ??= []).push(a);
    return m;
  }, [apps]);

  return (
    <div className="mx-auto max-w-md px-4 pb-8 pt-3">
      <header className="flex items-center gap-2">
        <Link to="/v4" aria-label="Back" className="rounded-control p-1">
          <ChevronLeft className="size-5" />
        </Link>
        <h1 className="text-[16px] font-semibold">My applications</h1>
      </header>
      {query.isLoading ? (
        <div className="mt-3"><LoadingSkeleton rows={4} /></div>
      ) : query.isError ? (
        <div className="mt-3"><ErrorState message="Couldn't load." onRetry={() => query.refetch()} /></div>
      ) : apps.length === 0 ? (
        <div className="mt-6"><EmptyState title="Empty board" message="No applications yet." /></div>
      ) : (
        COLUMNS.map((col) => {
          const items = byStatus[col.status] ?? [];
          if (items.length === 0) return null;
          return (
            <section key={col.status} data-tint={col.tint} className="mt-3 rounded-card p-3">
              <div className="mb-2 flex items-center justify-between px-1">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{col.label}</div>
                <div className="rounded-pill bg-surface px-2 py-0.5 text-[11px] font-medium">{items.length}</div>
              </div>
              <div className="space-y-2">
                {items.map((a) => (
                  <Link
                    key={a.acceptanceId}
                    to={`/v4/trips/${a.trip.id}`}
                    className="block rounded-card bg-surface p-3 shadow-card hover:shadow-md"
                  >
                    <div className="text-[14px] font-semibold">{routeChainText(a.trip)}</div>
                    <div className="mt-0.5 flex items-center justify-between text-[12px] text-muted-foreground">
                      <span>{formatPickupTime(a.trip.pickupAt)}</span>
                      <span className="font-medium text-foreground">{formatINR(a.trip.driverPayout)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}

export default PipelineMyTripsPage;
