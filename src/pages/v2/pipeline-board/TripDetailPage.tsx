import { Link } from 'react-router-dom';
import { ChevronLeft, Check } from 'lucide-react';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';
import { formatINR, formatPickupTime } from '@/lib/utils';
import { routeChainText } from '@/components/trip/RouteChain';
import { PIPELINE_COLUMNS } from '@/components/v2/pipeline-board/ColumnChips';
import { useTripDetail } from '@/pages/v2/shared/useTripDetail';
import type { TripStatus } from '@/types';

/**
 * v2 Pipeline Board — trip detail. Stage progress dots dominate the
 * top of the screen; below: a soft tinted info card matching the trip's
 * current column; an action CTA that hints the next stage.
 */
export function PipelineTripDetailPage() {
  const { isLoading, isError, refetch, data: trip } = useTripDetail();

  if (isLoading) {
    return (
      <div className="p-4">
        <LoadingSkeleton rows={5} />
      </div>
    );
  }
  if (isError || !trip) {
    return (
      <div className="p-4">
        <ErrorState message="Couldn't load trip." onRetry={() => refetch()} />
      </div>
    );
  }

  const idx = PIPELINE_COLUMNS.findIndex((c) => c.status === trip.status);
  const nextCol = idx >= 0 && idx < PIPELINE_COLUMNS.length - 1 ? PIPELINE_COLUMNS[idx + 1] : null;

  return (
    <div className="mx-auto max-w-md pb-6">
      <header className="flex items-center gap-2 px-4 pt-3">
        <Link to="/v4/trips" aria-label="Back to board" className="rounded-control p-1 hover:bg-surface-muted">
          <ChevronLeft className="size-5" />
        </Link>
        <h1 className="text-[16px] font-semibold">{routeChainText(trip)}</h1>
      </header>

      <StageProgress current={trip.status} />

      <section data-tint={trip.status} className="mx-4 mt-4 rounded-card p-4">
        <div className="rounded-card bg-surface p-4 shadow-card">
          <Info label="When" value={formatPickupTime(trip.pickupAt)} />
          <Info label="Vehicle" value={`${trip.carTypeLabel ?? '—'} · ${trip.seatsRequired} seats`} />
          <Info label="Distance" value={`${Math.round(trip.expectedDistanceKm)} km`} />
          <Info label="Fare" value={formatINR(trip.totalFare)} />
          <Info label="Your payout" value={formatINR(trip.driverPayout)} strong />
          <Info label="Applicants" value={String(trip.applicantCount)} />
        </div>
      </section>

      <div className="px-4 pt-4">
        <button
          type="button"
          className="h-12 w-full rounded-control bg-primary text-[14px] font-semibold text-primary-foreground"
        >
          {nextCol ? `Move to ${nextCol.label} →` : 'Trip closed'}
        </button>
      </div>
    </div>
  );
}

function StageProgress({ current }: { current: TripStatus }) {
  const currentIdx = PIPELINE_COLUMNS.findIndex((c) => c.status === current);
  return (
    <ol className="mx-4 mt-3 flex items-center gap-2" aria-label="Trip pipeline stage">
      {PIPELINE_COLUMNS.map((col, i) => {
        const done = i < currentIdx;
        const here = i === currentIdx;
        return (
          <li key={col.status} className="flex flex-1 items-center gap-1">
            <div
              className={`grid size-6 place-items-center rounded-full text-[10px] font-semibold ${
                done
                  ? 'bg-primary text-primary-foreground'
                  : here
                    ? 'bg-primary text-primary-foreground ring-4 ring-primary/20'
                    : 'border border-border bg-surface text-muted-foreground'
              }`}
              title={col.label}
            >
              {done ? <Check className="size-3.5" /> : i + 1}
            </div>
            {i < PIPELINE_COLUMNS.length - 1 ? (
              <div className={`h-px flex-1 ${i < currentIdx ? 'bg-primary' : 'bg-border'}`} />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function Info({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-1.5 last:border-0">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={`text-[14px] ${strong ? 'font-semibold' : ''}`}>{value}</span>
    </div>
  );
}

export default PipelineTripDetailPage;
