import { useState } from 'react';
import { Star } from 'lucide-react';
import { toast } from 'sonner';
import { useCreateReview } from '@/hooks/useReviews';
import { useReviewTagsByCategory } from '@/hooks/useAdminConfig';
import { Button } from '@/components/ui';
import { ApiError } from '@/lib/api/client';
import type { ReviewDirection, ReviewScore } from '@/types';

export interface ReviewFormProps {
  tripId: string;
  /** Who's rating whom — `manager_to_driver` (the poster rates the driver) or `driver_to_manager` (the driver rates the poster). */
  direction: Extract<ReviewDirection, 'manager_to_driver' | 'driver_to_manager'>;
  /** What this rates, for the prompt copy ("the driver" / "the trip manager"). */
  rateeNoun: string;
  /** Called after the review is posted (or found to already exist). */
  onDone?: () => void;
}

const SCORES: ReviewScore[] = [1, 2, 3, 4, 5];

/**
 * Star + optional comment + optional tags review form. Tags come from the
 * `review-tags` lookup for this direction; the ratee user is derived server-side
 * from the trip. A repeat submission (unique `(trip_id, direction)`) is handled
 * gracefully as "already reviewed".
 */
export function ReviewForm({ tripId, direction, rateeNoun, onDone }: ReviewFormProps) {
  const [score, setScore] = useState<ReviewScore>(5);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const createReview = useCreateReview();
  const tagsQuery = useReviewTagsByCategory(direction);
  const tags = (tagsQuery.data ?? []).filter((t) => t.isActive);

  function toggleTag(id: string) {
    setTagIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function onSubmit() {
    try {
      await createReview.mutateAsync({ tripId, direction, score, comment: comment.trim() || undefined, tagIds: tagIds.length ? tagIds : undefined });
      toast.success('Thanks for your review!');
      onDone?.();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast.success(`You've already reviewed ${rateeNoun} for this trip.`);
        onDone?.();
        return;
      }
      toast.error("Couldn't submit your review — try again.");
    }
  }

  return (
    <div className="space-y-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-secondary">Rate {rateeNoun}</div>
      <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating">
        {SCORES.map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
            aria-checked={score === n}
            role="radio"
            className="p-0.5"
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onClick={() => setScore(n)}
          >
            <Star className={`size-8 ${n <= (hover || score) ? 'fill-amber-400 stroke-amber-400' : 'fill-transparent stroke-gray-300'}`} aria-hidden />
          </button>
        ))}
      </div>

      {tags.length > 0 ? (
        <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-secondary">Tags (optional)</div>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => {
              const active = tagIds.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleTag(t.id)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${active ? 'border-primary bg-primary/15 text-primary' : 'border-input bg-background hover:border-primary/40'}`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div>
        <label htmlFor="review-comment" className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-secondary">
          Comment (optional)
        </label>
        <textarea
          id="review-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value.slice(0, 500))}
          rows={3}
          placeholder={`Tell others about your experience with ${rateeNoun}…`}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <Button variant="full" onClick={() => void onSubmit()} disabled={createReview.isPending}>
        {createReview.isPending ? 'Submitting…' : 'Submit review'}
      </Button>
    </div>
  );
}

export default ReviewForm;
