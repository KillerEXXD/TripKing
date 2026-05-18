import { Link } from 'react-router-dom';
import { ArrowLeft, Flag, Star } from 'lucide-react';
import { toast } from 'sonner';
import { useFlaggedReviews, useModerateReview } from '@/hooks/useReviews';
import { Badge, Button, Card } from '@/components/ui';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import type { RaterRole, Review } from '@/types';

const RATER_LABEL: Record<RaterRole, string> = { passenger: 'a passenger', driver: 'a driver', trip_manager: 'a trip manager', admin: 'TripKing' };

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function Stars({ score }: { score: number }) {
  return (
    <span className="inline-flex" aria-label={`${score} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`size-3.5 ${n <= score ? 'fill-amber-400 stroke-amber-400' : 'fill-transparent stroke-gray-300'}`} aria-hidden />
      ))}
    </span>
  );
}

function FlaggedReviewCard({ review, onModerate, pending }: { review: Review; onModerate: (action: 'clear' | 'hide') => void; pending: boolean }) {
  return (
    <Card className="gap-2">
      <div className="flex items-center justify-between gap-2">
        <Stars score={review.score} />
        <span className="text-xs text-secondary">{when(review.createdAt)}</span>
      </div>
      {review.comment ? <p className="text-sm">“{review.comment}”</p> : <p className="text-sm italic text-secondary">(no comment)</p>}
      <div className="flex items-center gap-1.5 text-xs">
        <Badge variant="warning">
          <Flag className="size-3" aria-hidden /> {review.flagReason || 'flagged'}
        </Badge>
        <span className="text-secondary">
          by {RATER_LABEL[review.raterRole] ?? 'a user'} · trip{' '}
          <Link to={`/app/trips/${review.tripId}`} className="font-mono text-primary underline">
            {review.tripId.slice(0, 8)}
          </Link>
          {review.isPublished ? '' : ' · hidden'}
        </span>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={pending} onClick={() => onModerate('clear')}>
          Clear flag (keep)
        </Button>
        <Button variant="destructive" size="sm" disabled={pending} onClick={() => onModerate('hide')}>
          Hide review
        </Button>
      </div>
    </Card>
  );
}

/**
 * `/app/administration/reviews` — the reviews-moderation queue (admin-only). Lists
 * flagged reviews (`GET /reviews?flagged=true`); "Clear flag" keeps the review
 * and takes it off the queue, "Hide review" unpublishes it (+ clears the flag).
 * Both go through `useModerateReview` (`POST /reviews/:id/moderate`).
 */
export function ReviewModerationPage() {
  const flaggedQuery = useFlaggedReviews();
  const moderate = useModerateReview();
  const reviews = flaggedQuery.data ?? [];

  function onModerate(id: string, action: 'clear' | 'hide') {
    const opts = action === 'clear' ? { id, clearFlag: true } : { id, isPublished: false, clearFlag: true };
    moderate.mutate(opts, {
      onSuccess: () => toast.success(action === 'clear' ? 'Flag cleared — review kept' : 'Review hidden'),
      onError: () => toast.error("Couldn't apply that — try again."),
    });
  }

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <Link to="/app/administration" className="-ml-1 inline-flex items-center gap-1 text-sm text-secondary hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Administration
      </Link>
      <h1 className="text-2xl font-bold">Reviews moderation</h1>

      {flaggedQuery.isPending ? (
        <LoadingSkeleton rows={4} />
      ) : flaggedQuery.isError ? (
        <ErrorState title="Couldn't load the moderation queue" message="Check your connection and try again." onRetry={() => void flaggedQuery.refetch()} />
      ) : reviews.length === 0 ? (
        <EmptyState icon={<Flag className="size-7" />} title="Nothing to moderate" message="No reviews have been flagged." />
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => (
            <FlaggedReviewCard key={r.id} review={r} pending={moderate.isPending} onModerate={(action) => onModerate(r.id, action)} />
          ))}
        </div>
      )}
    </main>
  );
}

export default ReviewModerationPage;
