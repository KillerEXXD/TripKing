import { useState } from 'react';
import { Star } from 'lucide-react';
import { toast } from 'sonner';
import { useCreatePassengerReview } from '@/hooks/useReviews';
import { useReviewTagsByCategory } from '@/hooks/useAdminConfig';
import { Button, Card } from '@/components/ui';
import { ApiError } from '@/lib/api/client';
import type { ReviewScore, Trip } from '@/types';

const SCORES: ReviewScore[] = [1, 2, 3, 4, 5];

export interface PassengerReviewCardProps {
  /** The completed trip the passenger is rating. */
  trip: Trip;
  /** The OTP from the URL — proves the rater was the passenger on this trip. */
  passengerOtp: string;
  /** Already-submitted review's score+comment (so we render a "Thanks — you rated 5★" instead of the form). */
  existingReview?: { score: number; comment: string } | null;
  /** Called after a successful submission so the parent can refetch the reviews query. */
  onSubmitted?: () => void;
}

/**
 * "Rate your driver" card shown on the passenger portal when a trip has completed.
 * Anonymous — no Bearer; the trip's stored passenger-OTP hash is the gate. Submits
 * via `useCreatePassengerReview` which POSTs to `/reviews` with `passenger_otp`.
 */
export function PassengerReviewCard({ trip, passengerOtp, existingReview, onSubmitted }: PassengerReviewCardProps) {
  const [score, setScore] = useState<ReviewScore>(5);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const submit = useCreatePassengerReview();
  const tagsQuery = useReviewTagsByCategory('passenger_to_driver');
  const tags = (tagsQuery.data ?? []).filter((t) => t.isActive);

  // If the passenger already rated, show a "thanks" view instead of the form (matches the
  // TripReviewSection pattern for the driver/agent flows).
  if (existingReview) {
    return (
      <Card className="gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-secondary">Your review</div>
        <p className="text-sm text-secondary">
          Thanks — you rated this driver <span className="font-semibold text-amber-700">{existingReview.score}★</span>.
        </p>
        {existingReview.comment ? <p className="text-sm italic text-secondary">"{existingReview.comment}"</p> : null}
      </Card>
    );
  }

  function toggleTag(id: string) {
    setTagIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function onSubmit() {
    try {
      await submit.mutateAsync({
        tripId: trip.id,
        passengerOtp,
        score,
        comment: comment.trim() || undefined,
        tagIds: tagIds.length ? tagIds : undefined,
      });
      toast.success('Thanks for rating your driver!');
      onSubmitted?.();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Already submitted — likely a re-tap; treat as success.
        toast.info('You\'ve already rated this trip.');
        onSubmitted?.();
        return;
      }
      if (err instanceof ApiError && err.status === 403) {
        toast.error('Your OTP doesn\'t match this trip — can\'t submit a review.');
        return;
      }
      toast.error('Couldn\'t submit your review — try again.');
    }
  }

  return (
    <Card className="gap-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-secondary">Rate your driver</div>
      <p className="text-sm text-secondary">How was your trip with {trip.assignedDriver?.fullName ?? 'your driver'}?</p>
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
        <label htmlFor="passenger-review-comment" className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-secondary">
          Comment (optional)
        </label>
        <textarea
          id="passenger-review-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value.slice(0, 500))}
          rows={3}
          placeholder="Was the driver punctual, polite, safe? Anything stand out?"
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <Button variant="full" onClick={() => void onSubmit()} disabled={submit.isPending}>
        {submit.isPending ? 'Submitting…' : 'Submit review'}
      </Button>
    </Card>
  );
}

export default PassengerReviewCard;
