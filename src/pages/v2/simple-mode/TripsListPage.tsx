import { Link } from 'react-router-dom';
import { ArrowRight, ChevronLeft, MapPin } from 'lucide-react';
import { useTrips } from '@/hooks/useTrips';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import { formatINR, formatPickupTime } from '@/lib/utils';
import type { Trip, TripStatus } from '@/types';

const APPLY_STATUSES: TripStatus[] = ['open', 'has_applicants'];

/**
 * v7 Simple Mode — trips list. One big card per trip with route arrow,
 * BIG money number, and ONE green "I want this trip" button. No filters,
 * no chips, no clutter.
 */
export function SimpleTripsListPage() {
  const query = useTrips({ status: APPLY_STATUSES });
  const trips = query.data ?? [];

  return (
    <div className="flex min-h-dvh flex-col bg-page">
      <header className="flex items-center gap-3 px-5 pt-5 pb-3">
        <Link to="/v7" aria-label="Back" className="rounded-pill border-2 border-border bg-surface p-2">
          <ChevronLeft className="size-6" />
        </Link>
        <div>
          <div className="text-[22px] font-bold">Trips you can drive</div>
          <div className="text-[14px] text-muted-foreground">Pick one to start</div>
        </div>
      </header>

      <main className="space-y-4 px-5 pb-6">
        {query.isLoading ? (
          <LoadingSkeleton rows={3} />
        ) : query.isError ? (
          <ErrorState message="Could not load trips. Tap to try again." onRetry={() => query.refetch()} />
        ) : trips.length === 0 ? (
          <EmptyState title="No trips now" message="Check again in 10 minutes." />
        ) : (
          trips.map((t) => <TripCard key={t.id} trip={t} />)
        )}
      </main>

      <footer className="sticky bottom-0 mt-auto bg-page p-4">
        <div className="rounded-card border-2 border-primary bg-[var(--skin-simple-go-bg)] p-3 text-center text-[15px]">
          Tap the <span className="font-bold text-[var(--skin-simple-go)]">green button</span> to take a trip
        </div>
      </footer>
    </div>
  );
}

function TripCard({ trip }: { trip: Trip }) {
  return (
    <article className="rounded-card border-4 border-border bg-surface p-4">
      <div className="flex items-center gap-2 text-[14px] text-muted-foreground">
        <MapPin className="size-4" aria-hidden /> {formatPickupTime(trip.pickupAt)}
      </div>

      <div className="mt-2 flex items-center gap-3 text-[22px] font-bold leading-tight">
        <span className="flex-1">{trip.fromCity?.name ?? '—'}</span>
        <ArrowRight className="size-7 text-primary" aria-hidden />
        <span className="flex-1 text-right">{trip.toCity?.name ?? '—'}</span>
      </div>

      <div className="mt-3 rounded-control border-2 border-warning bg-[var(--skin-simple-wait-bg)] p-3 text-center">
        <div className="text-[12px] uppercase tracking-wide text-muted-foreground">You get paid</div>
        <div className="text-[36px] font-extrabold leading-none">{formatINR(trip.driverPayout)}</div>
        <div className="mt-1 text-[12px] text-muted-foreground">{Math.round(trip.expectedDistanceKm)} km</div>
      </div>

      <Link
        to={`/v7/trips/${trip.id}`}
        className="mt-3 flex h-16 w-full items-center justify-center gap-2 rounded-control bg-[var(--skin-simple-go)] text-[20px] font-bold text-white"
      >
        I want this trip
      </Link>
    </article>
  );
}

export default SimpleTripsListPage;
