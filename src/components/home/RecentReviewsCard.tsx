import { Star } from 'lucide-react';
import { useDriverReviews } from '@/hooks/useReviews';
import { SectionCard } from '@/components/ui';

const REVIEWS_LIMIT = 3;

/**
 * Home card — recent published driver→manager reviews for the signed-in agent.
 *
 * Renders nothing when there are no reviews yet (consistent with the "hide empty
 * cards on home" pattern — until a driver leaves a review, the agent has nothing
 * to read). On error it stays silent (the card is non-critical chrome — a flaky
 * /reviews fetch shouldn't paint a red banner on the home screen).
 *
 * Fix for Qase defect D4 (P7.4) — reviews were stored but never surfaced.
 */
export function RecentReviewsCard({ userId }: { userId: string }) {
  const q = useDriverReviews(userId, { direction: 'driver_to_manager', limit: REVIEWS_LIMIT });
  const reviews = (q.data ?? []).filter((r) => r.isPublished);

  if (q.isPending) {
    return (
      <SectionCard accent="amber" label="Recent reviews" icon={<Star className="size-3.5" aria-hidden />}>
        <div className="h-10 animate-pulse rounded bg-amber-accent-light/60" />
      </SectionCard>
    );
  }
  if (reviews.length === 0) return null;

  const avg = reviews.reduce((sum, r) => sum + r.score, 0) / reviews.length;

  return (
    <SectionCard
      accent="amber"
      label="Recent reviews"
      icon={<Star className="size-3.5" aria-hidden />}
      rightAction={<span className="text-xs font-semibold text-amber-accent">{avg.toFixed(1)}★ · {reviews.length}</span>}
    >
      <ul className="space-y-2">
        {reviews.map((r) => (
          <li key={r.id} className="rounded-md bg-white/60 p-2">
            <div className="flex items-center gap-1 text-xs font-semibold text-amber-900">
              {Array.from({ length: r.score }).map((_, i) => (
                <Star key={i} className="size-3 fill-amber-500 text-amber-500" aria-hidden />
              ))}
              <span className="ml-auto text-[10px] uppercase tracking-wide text-secondary">
                {new Date(r.createdAt).toLocaleDateString()}
              </span>
            </div>
            {r.comment ? <p className="mt-1 line-clamp-3 text-sm text-foreground">{r.comment}</p> : null}
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
