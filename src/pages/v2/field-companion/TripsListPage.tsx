import { useTrips } from '@/hooks/useTrips';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import type { TripStatus } from '@/types';
import { TripHeroCard } from '@/components/v2/field-companion/TripHeroCard';
import { StickyCtaBar } from '@/components/v2/field-companion/StickyCtaBar';

const APPLY_STATUSES: TripStatus[] = ['open', 'has_applicants'];

/**
 * v2 Field Companion — trips list. Single-column hero cards for drivers
 * actively on the road. One decision per screen.
 */
export function FieldTripsListPage() {
  const query = useTrips({ status: APPLY_STATUSES });
  const trips = query.data ?? [];

  return (
    <div className="min-h-dvh pb-32">
      <header className="px-5 pt-6">
        <h1 className="text-[22px] font-bold">Trips near you</h1>
        <p className="mt-1 text-[14px] text-muted-foreground">
          {trips.length} {trips.length === 1 ? 'trip' : 'trips'} you can apply to
        </p>
      </header>
      <div className="mt-4 space-y-4 px-5">
        {query.isLoading ? (
          <LoadingSkeleton rows={3} />
        ) : query.isError ? (
          <ErrorState message="Couldn't load trips." onRetry={() => query.refetch()} />
        ) : trips.length === 0 ? (
          <EmptyState title="No trips right now" message="Check back in a few minutes." />
        ) : (
          trips.map((t) => <TripHeroCard key={t.id} trip={t} />)
        )}
      </div>
      <StickyCtaBar>
        <button
          type="button"
          className="h-14 w-full rounded-control bg-primary text-[17px] font-semibold text-primary-foreground shadow-fab"
        >
          Find trips near me
        </button>
      </StickyCtaBar>
    </div>
  );
}

export default FieldTripsListPage;
