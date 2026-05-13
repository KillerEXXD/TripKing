import { Link } from 'react-router-dom';
import { MapPinned, Plus } from 'lucide-react';
import { Button } from '@/components/ui';
import { useMyActiveVacancies } from '@/hooks/useVacancies';
import { useAppSettings } from '@/hooks/useAdminConfig';

// Hard fallback if app_settings hasn't loaded yet — matches the DB DEFAULT 2 from
// migration 022 + the backend's no-data fallback in supabase/functions/vacancies/index.ts.
const MAX_ACTIVE_FALLBACK = 2;

interface Props {
  driverId: string;
}

/**
 * "I'm available" hero for drivers on `/vacancies`. Shows `X / max active` where `max`
 * is admin-configurable via `app_settings.max_active_vacancies_per_driver` (migration
 * 022, default 2). The matching backend constraint lives in
 * `supabase/functions/vacancies/index.ts` (POST returns 409 CONFLICT past the limit).
 */
export function IAmAvailableCard({ driverId }: Props) {
  const query = useMyActiveVacancies(driverId);
  const settings = useAppSettings();
  const max = settings.data?.maxActiveVacanciesPerDriver ?? MAX_ACTIVE_FALLBACK;
  const count = query.data?.length ?? 0;
  const atLimit = count >= max;
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
            {loading ? `— / ${max} active` : `${count} / ${max} active`}
            {atLimit ? ' — max reached' : ''}
          </span>
          {atLimit ? (
            <Button
              size="sm"
              variant="outline"
              disabled
              title={`Max ${max} active ${max === 1 ? 'vacancy' : 'vacancies'} — cancel one before posting another.`}
              aria-label={`Post availability (disabled — at the ${max}-active limit)`}
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
