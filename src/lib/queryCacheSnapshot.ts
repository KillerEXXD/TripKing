/**
 * Small helper — walks the React Query cache and returns a privacy-safe
 * snapshot (keys + statuses only, never row payloads).
 */
import type { QueryClient } from '@tanstack/react-query';

export interface QuerySnapshotEntry {
  queryKey: unknown;
  status: 'pending' | 'success' | 'error';
  fetchStatus: 'fetching' | 'paused' | 'idle';
  isStale: boolean;
  dataUpdatedAt: number;
}

export function snapshotQueryCache(client: QueryClient): QuerySnapshotEntry[] {
  return client
    .getQueryCache()
    .getAll()
    .map((q) => ({
      queryKey: q.queryKey,
      status: q.state.status,
      fetchStatus: q.state.fetchStatus,
      isStale: q.isStale(),
      dataUpdatedAt: q.state.dataUpdatedAt,
    }));
}
