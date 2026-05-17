import { useTrips } from '@/hooks/useTrips';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import type { TripStatus } from '@/types';
import { EditorialMasthead } from '@/components/v2/editorial/EditorialMasthead';
import { EditorialTripCard } from '@/components/v2/editorial/EditorialTripCard';

const APPLY_STATUSES: TripStatus[] = ['open', 'has_applicants'];

/**
 * v2 Editorial Travel — trips list. Magazine layout: masthead +
 * asymmetric feature cards alternating left/right.
 */
export function EditorialTripsListPage() {
  const query = useTrips({ status: APPLY_STATUSES });
  const trips = query.data ?? [];

  return (
    <div className="mx-auto max-w-md px-6 pb-12">
      <EditorialMasthead
        issue={`Vol. ${new Date().getFullYear()}`}
        title="On the road"
        subtitle={`${trips.length} ${trips.length === 1 ? 'trip' : 'trips'} for the taking, hand-curated from across the network.`}
      />
      <div role="region" aria-label="Trip features">
        {query.isLoading ? (
          <div className="pt-8">
            <LoadingSkeleton rows={3} />
          </div>
        ) : query.isError ? (
          <div className="pt-8">
            <ErrorState message="Couldn't load this week's trips." onRetry={() => query.refetch()} />
          </div>
        ) : trips.length === 0 ? (
          <div className="pt-8">
            <EmptyState title="Press paused" message="No trips to feature right now. Check back soon." />
          </div>
        ) : (
          trips.map((t, i) => (
            <EditorialTripCard key={t.id} trip={t} variant={i % 2 === 0 ? 'left' : 'right'} />
          ))
        )}
      </div>
    </div>
  );
}

export default EditorialTripsListPage;
