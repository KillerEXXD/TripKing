import { Link } from 'react-router-dom';
import { MapPinned, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Button } from '@/components/ui';
import { useCancelVacancy, useMyActiveVacancies } from '@/hooks/useVacancies';
import { useAppSettings } from '@/hooks/useAdminConfig';
import { formatClockTime, formatINR, formatShortDate } from '@/lib/utils';
import type { Vacancy } from '@/types';

// Hard fallback if app_settings hasn't loaded yet — matches the DB DEFAULT 2 from
// migration 022 + the backend's no-data fallback in supabase/functions/vacancies/index.ts.
const MAX_ACTIVE_FALLBACK = 2;

interface Props {
  driverId: string;
}

function windowLabel(v: Vacancy): string {
  const from = new Date(v.availableFrom);
  if (Number.isNaN(from.getTime())) return v.availableFrom;
  const to = v.availableUntil ? new Date(v.availableUntil) : null;
  if (!to || Number.isNaN(to.getTime())) return `from ${formatShortDate(from)}, ${formatClockTime(from)}`;
  const sameDay = from.toDateString() === to.toDateString();
  return sameDay
    ? `${formatShortDate(from)}, ${formatClockTime(from)} – ${formatClockTime(to)}`
    : `${formatShortDate(from)} ${formatClockTime(from)} – ${formatShortDate(to)} ${formatClockTime(to)}`;
}

function MyVacancyCard({ vacancy }: { vacancy: Vacancy }) {
  const cancel = useCancelVacancy();
  const where = vacancy.currentPlace?.name ?? vacancy.currentCity.name;
  const destinations = vacancy.destinationCities.map((c) => c.name).join(', ');

  function onRemove() {
    if (!window.confirm(`Remove your availability from ${where}?`)) return;
    cancel.mutate(vacancy.id, {
      onSuccess: () => toast.success('Removed — agents won’t see this any more.'),
      onError: () => toast.error('Couldn’t remove that — please try again.'),
    });
  }

  return (
    <div className="rounded-xl border border-emerald-200 bg-white p-3 shadow-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1.5 text-sm">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-secondary">From</div>
            <div className="font-bold text-foreground">{where}</div>
          </div>
          {destinations ? (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-secondary">To</div>
              <div className="text-foreground">{destinations}</div>
            </div>
          ) : null}
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-secondary">When</div>
            <div className="text-foreground">{windowLabel(vacancy)}</div>
          </div>
          {vacancy.minRatePerKm || vacancy.notes ? (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {vacancy.minRatePerKm ? <Badge variant="muted">≥ {formatINR(vacancy.minRatePerKm)}/km</Badge> : null}
              {vacancy.notes ? <span className="text-xs text-secondary">“{vacancy.notes}”</span> : null}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onRemove}
          disabled={cancel.isPending}
          aria-label={`Remove availability from ${where}`}
          className="shrink-0 rounded-md p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-40"
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

/**
 * "I'm available" hero for drivers on `/vacancies`. Shows `X / max active` where `max`
 * is admin-configurable via `app_settings.max_active_vacancies_per_driver` (migration
 * 022, default 2). Each active vacancy renders as its own card below the hero with
 * a Remove button so the driver can drop one without losing the others. The matching
 * backend constraint lives in `supabase/functions/vacancies/index.ts` (POST returns
 * 409 CONFLICT past the limit).
 */
export function IAmAvailableCard({ driverId }: Props) {
  const query = useMyActiveVacancies(driverId);
  const settings = useAppSettings();
  const max = settings.data?.maxActiveVacanciesPerDriver ?? MAX_ACTIVE_FALLBACK;
  const vacancies = query.data ?? [];
  const count = vacancies.length;
  const atLimit = count >= max;
  const loading = query.isPending;

  return (
    <div className="mx-4 mt-3 space-y-2" data-testid="i-am-available-card">
      <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700" aria-hidden>
          <MapPinned className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-emerald-900">I&apos;m vacant</div>
          <p className="mt-0.5 text-xs text-emerald-800">
            {count === 0
              ? 'Let agents find you for trips going from your city.'
              : 'Each posting below is live. Remove the ones you no longer want.'}
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
                title={`Max ${max} active ${max === 1 ? 'vacancy' : 'vacancies'} — remove one before posting another.`}
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

      {vacancies.map((v) => (
        <MyVacancyCard key={v.id} vacancy={v} />
      ))}
    </div>
  );
}

export default IAmAvailableCard;
