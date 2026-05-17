import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useMyApplications } from '@/hooks/useTrips';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import { formatINR, formatPickupTime } from '@/lib/utils';

export function EditorialMyTripsPage() {
  const query = useMyApplications();
  const apps = query.data ?? [];

  return (
    <div className="mx-auto max-w-md px-6 pb-12">
      <Link to="/v5" aria-label="Back" className="m-3 -ml-2 inline-flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
        <ArrowLeft className="size-3" /> the journal
      </Link>
      <header className="border-b-2 border-foreground/80 pb-4">
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Your assignments</div>
        <h1 className="editorial-headline mt-2 text-[32px] leading-tight">In progress</h1>
      </header>
      {query.isLoading ? (
        <div className="pt-6"><LoadingSkeleton rows={3} /></div>
      ) : query.isError ? (
        <div className="pt-6"><ErrorState message="Couldn't load." onRetry={() => query.refetch()} /></div>
      ) : apps.length === 0 ? (
        <div className="pt-6"><EmptyState title="No assignments" message="The desk is quiet." /></div>
      ) : (
        <ul className="divide-y divide-border pt-2">
          {apps.map((a) => (
            <li key={a.acceptanceId} className="py-5">
              <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{a.status}</div>
              <Link to={`/v5/trips/${a.trip.id}`} className="group">
                <h2 className="editorial-headline mt-1 text-[22px] leading-tight group-hover:text-primary">
                  {a.trip.fromCity?.name} <span className="italic text-muted-foreground">to</span> {a.trip.toCity?.name}
                </h2>
                <p className="mt-1 text-[13px] italic text-muted-foreground">
                  {formatPickupTime(a.trip.pickupAt)} · share {formatINR(a.trip.driverPayout)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default EditorialMyTripsPage;
