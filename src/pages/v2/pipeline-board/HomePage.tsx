import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTrips } from '@/hooks/useTrips';
import { LoadingSkeleton } from '@/components/feedback';
import { PIPELINE_COLUMNS } from '@/components/v2/pipeline-board/ColumnChips';
import type { TripStatus } from '@/types';

const STATUSES: TripStatus[] = PIPELINE_COLUMNS.map((c) => c.status);

/**
 * v2 Pipeline Board — home. The 5 columns as the whole landing.
 * Tap a column to drop into the board pre-filtered to that stage.
 */
export function PipelineHomePage() {
  const { user } = useAuth();
  const query = useTrips({ status: STATUSES });
  const trips = query.data ?? [];

  const counts = useMemo<Partial<Record<TripStatus, number>>>(() => {
    const c: Partial<Record<TripStatus, number>> = {};
    for (const t of trips) c[t.status] = (c[t.status] ?? 0) + 1;
    return c;
  }, [trips]);

  return (
    <div className="mx-auto max-w-md px-4 pb-8 pt-4">
      <header>
        <div className="text-[12px] uppercase tracking-wide text-muted-foreground">Welcome back</div>
        <h1 className="text-[20px] font-semibold">{user?.displayName ?? 'Agent'}</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {trips.length} trips moving through your pipeline.
        </p>
      </header>

      <section className="mt-5 grid grid-cols-2 gap-3" aria-label="Pipeline overview">
        {query.isLoading ? (
          <div className="col-span-2"><LoadingSkeleton rows={3} /></div>
        ) : (
          PIPELINE_COLUMNS.map((col) => {
            const n = counts[col.status] ?? 0;
            return (
              <Link
                key={col.status}
                to="/v4/trips"
                data-tint={col.status}
                className="rounded-card p-4"
              >
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{col.label}</div>
                <div className="mt-1 text-[28px] font-bold leading-none">{n}</div>
                <div className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  Open column <ArrowRight className="size-3" aria-hidden />
                </div>
              </Link>
            );
          })
        )}
      </section>

      <Link
        to="/v4/trips"
        className="mt-5 flex items-center justify-between rounded-card bg-surface p-4 shadow-card"
      >
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Or</div>
          <div className="text-[14px] font-semibold">Open the full board</div>
        </div>
        <ArrowRight className="size-4" />
      </Link>
    </div>
  );
}

export default PipelineHomePage;
