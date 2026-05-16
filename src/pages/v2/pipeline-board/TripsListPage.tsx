import { useMemo, useState } from 'react';
import { useTrips } from '@/hooks/useTrips';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import type { TripStatus } from '@/types';
import { ColumnChips, PIPELINE_COLUMNS } from '@/components/v2/pipeline-board/ColumnChips';
import { KanbanColumn } from '@/components/v2/pipeline-board/KanbanColumn';
import { PipelineCard } from '@/components/v2/pipeline-board/PipelineCard';
import { SwipeIndicator } from '@/components/v2/pipeline-board/SwipeIndicator';

const PIPELINE_STATUSES: TripStatus[] = PIPELINE_COLUMNS.map((c) => c.status);

/**
 * v2 Pipeline Board — trips list. Horizontal kanban; mobile shows one
 * column at a time with column chips + swipe indicator to move between.
 */
export function PipelineTripsListPage() {
  const [active, setActive] = useState<TripStatus>('has_applicants');

  const query = useTrips({ status: PIPELINE_STATUSES });
  const trips = query.data ?? [];

  const counts = useMemo<Partial<Record<TripStatus, number>>>(() => {
    const c: Partial<Record<TripStatus, number>> = {};
    for (const t of trips) c[t.status] = (c[t.status] ?? 0) + 1;
    return c;
  }, [trips]);

  const activeColumn = PIPELINE_COLUMNS.find((c) => c.status === active) ?? PIPELINE_COLUMNS[0];
  const activeTrips = trips.filter((t) => t.status === active);
  const activeIdx = PIPELINE_COLUMNS.indexOf(activeColumn);
  const prev = activeIdx > 0 ? PIPELINE_COLUMNS[activeIdx - 1] : null;
  const next = activeIdx < PIPELINE_COLUMNS.length - 1 ? PIPELINE_COLUMNS[activeIdx + 1] : null;

  return (
    <div className="mx-auto max-w-md pb-6">
      <header className="px-4 pt-4">
        <h1 className="text-[20px] font-semibold">Trips</h1>
        <p className="mt-0.5 text-[12px] text-muted-foreground">{trips.length} in the pipeline</p>
      </header>
      <ColumnChips active={active} counts={counts} onChange={setActive} />
      <SwipeIndicator
        hasPrev={!!prev}
        hasNext={!!next}
        onPrev={() => prev && setActive(prev.status)}
        onNext={() => next && setActive(next.status)}
        prevLabel={prev?.label ?? ''}
        nextLabel={next?.label ?? ''}
      />
      <div className="px-4 pt-3">
        {query.isLoading ? (
          <LoadingSkeleton rows={4} />
        ) : query.isError ? (
          <ErrorState message="Couldn't load trips." onRetry={() => query.refetch()} />
        ) : (
          <KanbanColumn
            status={activeColumn.status}
            label={activeColumn.label}
            count={activeTrips.length}
          >
            {activeTrips.length === 0 ? (
              <EmptyState title="Empty column" message={`No trips in ${activeColumn.label.toLowerCase()}.`} />
            ) : (
              activeTrips.map((t) => <PipelineCard key={t.id} trip={t} />)
            )}
          </KanbanColumn>
        )}
      </div>
    </div>
  );
}

export default PipelineTripsListPage;
