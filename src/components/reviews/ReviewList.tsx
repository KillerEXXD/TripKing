import { Star } from 'lucide-react';
import { Card } from '@/components/ui';
import type { RaterRole, Review } from '@/types';

const RATER_LABEL: Record<RaterRole, string> = {
  passenger: 'A passenger',
  driver: 'A driver',
  trip_manager: 'A trip manager',
  admin: 'TripKing',
};

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604_800) return `${Math.floor(s / 86_400)}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
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

/** Read-only list of reviews. Pass `tagLabels` to render tag chips by label. */
export function ReviewList({ reviews, tagLabels }: { reviews: Review[]; tagLabels?: Record<string, string> }) {
  return (
    <div className="space-y-2">
      {reviews.map((r) => (
        <Card key={r.id} className="gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <Stars score={r.score} />
            <span className="text-xs text-secondary">{relTime(r.createdAt)}</span>
          </div>
          {r.comment ? <p className="text-sm">{r.comment}</p> : null}
          {r.tagIds.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {r.tagIds.map((id) => (
                <span key={id} className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                  ★ {tagLabels?.[id] ?? 'tag'}
                </span>
              ))}
            </div>
          ) : null}
          <div className="text-xs text-secondary">— {RATER_LABEL[r.raterRole] ?? 'A user'}</div>
        </Card>
      ))}
    </div>
  );
}

export default ReviewList;
