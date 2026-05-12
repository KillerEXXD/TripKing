import { useReviews } from '@/hooks/useReviews';
import { useAuth } from '@/contexts/AuthContext';
import { ReviewForm } from '@/components/reviews/ReviewForm';
import { ReviewList } from '@/components/reviews/ReviewList';
import { Card } from '@/components/ui';
import { LoadingSkeleton } from '@/components/feedback';
import type { Trip } from '@/types';

type AuthDirection = 'manager_to_driver' | 'driver_to_manager';

/** Who the signed-in viewer gets to rate on a completed trip, if anyone. */
function directionFor(trip: Trip, userId?: string, role?: string): { direction: AuthDirection; rateeNoun: string } | null {
  if (userId && userId === trip.postedByUserId) return { direction: 'manager_to_driver', rateeNoun: 'the driver' };
  if (role === 'driver') return { direction: 'driver_to_manager', rateeNoun: trip.postedByRole === 'driver' ? 'the trip poster' : 'the trip manager' };
  return null;
}

/**
 * Post-trip reviews block for a completed trip — shown by `TripDetailPage`.
 * The poster rates the driver (`manager_to_driver`); the driver rates the
 * poster (`driver_to_manager`); a passenger rates the driver from the passenger
 * portal (`passenger_to_driver`, not here). Published reviews for the trip are
 * listed below the form.
 */
export function TripReviewSection({ trip }: { trip: Trip }) {
  const { user } = useAuth();
  const reviewsQuery = useReviews({ tripId: trip.id });
  const mine = directionFor(trip, user?.id, user?.role);
  const reviews = reviewsQuery.data ?? [];
  const myReview = mine && user?.id ? reviews.find((r) => r.raterUserId === user.id && r.direction === mine.direction) : undefined;
  const published = reviews.filter((r) => r.isPublished);

  return (
    <Card className="gap-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-secondary">Reviews</div>

      {reviewsQuery.isPending ? (
        <LoadingSkeleton rows={2} />
      ) : reviewsQuery.isError ? (
        <p className="text-sm text-secondary">Couldn&apos;t load reviews for this trip.</p>
      ) : (
        <>
          {mine ? (
            myReview ? (
              <p className="text-sm text-secondary">
                Thanks — you rated {mine.rateeNoun} {myReview.score}★ for this trip.
              </p>
            ) : (
              <ReviewForm tripId={trip.id} direction={mine.direction} rateeNoun={mine.rateeNoun} onDone={() => void reviewsQuery.refetch()} />
            )
          ) : null}

          {published.length > 0 ? (
            <div>
              <div className="mb-1.5 mt-1 text-[11px] font-semibold uppercase tracking-wide text-secondary">For this trip</div>
              <ReviewList reviews={published} />
            </div>
          ) : !mine ? (
            <p className="text-sm text-secondary">No reviews for this trip yet.</p>
          ) : null}

          <p className="text-xs text-secondary">Passengers rate the driver from the passenger portal.</p>
        </>
      )}
    </Card>
  );
}

export default TripReviewSection;
