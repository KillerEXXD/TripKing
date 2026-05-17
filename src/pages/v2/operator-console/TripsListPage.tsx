import { useMemo, useState } from 'react';
import { useTrips } from '@/hooks/useTrips';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import type { Trip, TripStatus } from '@/types';
import { CommandKBar } from '@/components/v2/operator-console/CommandKBar';
import { FilterTabs, type FilterTab } from '@/components/v2/operator-console/FilterTabs';
import { TripRow } from '@/components/v2/operator-console/TripRow';

const FEED_STATUSES: TripStatus[] = ['open', 'has_applicants', 'accepted', 'in_progress'];

/**
 * v2 Operator Console — trips list. Dense table, monochrome, state-as-accent.
 * Consumes `useTrips` exactly like v1; presentation only differs.
 */
export function OperatorTripsListPage() {
  const [tab, setTab] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');

  const query = useTrips({ status: FEED_STATUSES });
  const trips = query.data ?? [];

  const counts = useMemo<Partial<Record<FilterTab, number>>>(() => {
    const c: Partial<Record<FilterTab, number>> = { all: trips.length };
    for (const t of trips) c[t.status] = (c[t.status] ?? 0) + 1;
    return c;
  }, [trips]);

  const filtered = useMemo<Trip[]>(() => {
    const term = search.trim().toLowerCase();
    return trips.filter((t) => {
      if (tab !== 'all' && t.status !== tab) return false;
      if (term && !`${t.fromCity?.name ?? ''} ${t.toCity?.name ?? ''}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [trips, tab, search]);

  return (
    <div className="mx-auto max-w-md">
      <header className="border-b border-border bg-surface px-3 py-3">
        <h1 className="text-[14px] font-semibold tracking-tight">Trips</h1>
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {trips.length} active · {counts.has_applicants ?? 0} need action
        </p>
      </header>
      <CommandKBar value={search} onChange={setSearch} />
      <FilterTabs active={tab} counts={counts} onChange={setTab} />
      <div role="region" aria-label="Trip list">
        {query.isLoading ? (
          <div className="p-3">
            <LoadingSkeleton rows={6} />
          </div>
        ) : query.isError ? (
          <div className="p-3">
            <ErrorState message="Couldn't load trips." onRetry={() => query.refetch()} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-3">
            <EmptyState title="No trips" message="Nothing matches the current filter." />
          </div>
        ) : (
          filtered.map((t) => <TripRow key={t.id} trip={t} />)
        )}
      </div>
    </div>
  );
}

export default OperatorTripsListPage;
