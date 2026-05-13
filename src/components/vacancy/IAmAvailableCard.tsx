import { Link } from 'react-router-dom';
import { MapPinned, Plus } from 'lucide-react';
import { Button } from '@/components/ui';
import { useMyActiveVacancies } from '@/hooks/useVacancies';

const MAX_ACTIVE = 2;

interface Props {
  driverId: string;
}

/**
 * "I'm available" hero for drivers on `/vacancies`. Shows `X/2 active` and the
 * Post button (disabled at the limit). The matching backend constraint lives in
 * `supabase/functions/vacancies/index.ts` (POST returns 409 CONFLICT on the 3rd).
 */
export function IAmAvailableCard({ driverId }: Props) {
  const query = useMyActiveVacancies(driverId);
  const count = query.data?.length ?? 0;
  const atLimit = count >= MAX_ACTIVE;
  const loading = query.isPending;

  return (
    <div
      className="mx-4 mt-3 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4"
      data-testid="i-am-available-card"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700" aria-hidden>
        <MapPinned className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-emerald-900">I'm available</div>
        <p className="mt-0.5 text-xs text-emerald-800">
          {count === 0
            ? 'Let agents find you for trips going from your city.'
            : `You're listed in ${count === 1 ? 'one city' : `${count} cities`}.`}
        </p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-emerald-900">
            {loading ? '— / 2 active' : `${count} / ${MAX_ACTIVE} active`}
            {atLimit ? ' — max reached' : ''}
          </span>
          {atLimit ? (
            <Button
              size="sm"
              variant="outline"
              disabled
              title="Max 2 active vacancies — cancel one before posting another."
              aria-label="Post availability (disabled — at the 2-active limit)"
            >
              <Plus className="size-4" aria-hidden /> Post
            </Button>
          ) : (
            <Button asChild size="sm" variant="default">
              <Link to="/vacancies/new" aria-label="Post availability">
                <Plus className="size-4" aria-hidden /> Post
              </Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default IAmAvailableCard;
