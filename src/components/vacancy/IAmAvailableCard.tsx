import { useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ChevronDown, MapPinned, Pencil, Plus, Trash2 } from 'lucide-react';
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

function OnTripBanner({ vacancy }: { vacancy: Vacancy }) {
  const lt = vacancy.linkedTrip;
  const route = lt && lt.fromCityName && lt.toCityName ? `${lt.fromCityName} → ${lt.toCityName}` : 'your accepted trip';
  const when = lt ? formatShortDate(new Date(lt.pickupAt)) : null;
  return (
    <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
      <p>
        You&apos;ve accepted <span className="font-semibold">{route}</span>
        {when ? <> on <span className="font-semibold">{when}</span></> : null}. This vacancy is hidden from agents and will be removed when the trip starts.
      </p>
    </div>
  );
}

function MyVacancyCard({ vacancy }: { vacancy: Vacancy }) {
  const cancel = useCancelVacancy();
  const where = vacancy.currentPlace?.name ?? vacancy.currentCity.name;
  const destinations = vacancy.destinationCities.map((c) => c.name).join(', ');
  const onTrip = vacancy.status === 'on_trip';

  function onRemove() {
    if (!window.confirm(`Remove your availability from ${where}?`)) return;
    cancel.mutate(vacancy.id, {
      onSuccess: () => toast.success('Removed — agents won’t see this any more.'),
      onError: () => toast.error('Couldn’t remove that — please try again.'),
    });
  }

  return (
    <div className="bg-white p-3 first:rounded-t-none [&:not(:first-child)]:border-t [&:not(:first-child)]:border-emerald-100">
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
          {onTrip ? <OnTripBanner vacancy={vacancy} /> : null}
        </div>
        <div className="flex shrink-0 items-start gap-1">
          {onTrip ? (
            <span
              aria-label="Editing disabled — this vacancy is locked to an accepted trip"
              className="rounded-md p-1.5 text-emerald-300"
              title="Editing disabled — this vacancy is locked to an accepted trip"
            >
              <Pencil className="size-4" aria-hidden />
            </span>
          ) : (
            <Link
              to={`/app/vacancies/${vacancy.id}/edit`}
              aria-label={`Edit availability from ${where}`}
              className="rounded-md p-1.5 text-emerald-700 hover:bg-emerald-50"
            >
              <Pencil className="size-4" aria-hidden />
            </Link>
          )}
          <button
            type="button"
            onClick={onRemove}
            disabled={cancel.isPending}
            aria-label={`Remove availability from ${where}`}
            className="rounded-md p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-40"
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * "I'm available" hero for drivers on `/app/vacancies`. Shows `X / max active` where `max`
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
  const hasList = count > 0;
  const [collapsed, setCollapsed] = useState(true);
  const expanded = hasList && !collapsed;
  const listId = 'my-vacancies-list';

  const toggle = () => setCollapsed((c) => !c);
  const onHeaderKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    }
  };
  const stop = (e: ReactMouseEvent) => e.stopPropagation();

  return (
    <div className="mx-4 mb-3 mt-3" data-testid="i-am-available-card">
      {/*
        Visually matches the PriorityCard emerald tone (border-2, hover) but uses a bespoke layout.
        Even after PR 6 added rightAction + footerSlot, this card has a large left-side icon chip
        (size-10) and a count/chevron line inline with the subtitle, neither of which fits the
        standard inline-icon + small-label header. Keeping bespoke; visual tokens stay aligned.
      */}
      <div className="overflow-hidden rounded-2xl border-2 border-emerald-300 bg-emerald-50 transition-colors hover:bg-emerald-100/60">
        <div
          className={`flex items-start gap-3 p-4 ${hasList ? 'cursor-pointer' : ''}`}
          {...(hasList
            ? {
                role: 'button',
                tabIndex: 0,
                onClick: toggle,
                onKeyDown: onHeaderKeyDown,
                'aria-expanded': expanded ? 'true' : 'false',
                'aria-controls': listId,
              }
            : {})}
        >
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
              <span className="flex items-center gap-1 text-xs font-medium text-emerald-900">
                {loading ? `— / ${max} active` : `${count} / ${max} active`}
                {atLimit ? ' — max reached' : ''}
                {hasList ? (
                  <ChevronDown
                    className={`size-4 transition-transform ${expanded ? '' : '-rotate-90'}`}
                    aria-hidden
                  />
                ) : null}
              </span>
              {atLimit ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled
                  onClick={stop}
                  title={`Max ${max} active ${max === 1 ? 'vacancy' : 'vacancies'} — remove one before posting another.`}
                  aria-label={`Post vacant (disabled — at the ${max}-active limit)`}
                >
                  <Plus className="size-4" aria-hidden /> Post
                </Button>
              ) : (
                <Button asChild size="sm" variant="default">
                  <Link to="/app/vacancies/new" onClick={stop} aria-label="Post vacant">
                    <Plus className="size-4" aria-hidden /> Post
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </div>

        {expanded ? (
          <div id={listId} className="border-t border-emerald-200 bg-white">
            {vacancies.map((v) => (
              <MyVacancyCard key={v.id} vacancy={v} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default IAmAvailableCard;
