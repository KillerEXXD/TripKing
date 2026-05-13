import { QueryCache, QueryClient, MutationCache } from '@tanstack/react-query';
import { toast } from 'sonner';
import { addDataBreadcrumb, captureDataError, isReported, messageForError } from '@/lib/sentry';

/**
 * Per-resource `staleTime` overrides (see CLAUDE.md §"Caching" and
 * docs/CACHE_BASELINE.md §7 — `master` was bumped from 5min → 15min in Phase 5 once the
 * server cache started honouring an `admin:*` invalidation pattern on every admin write,
 * so the client can stay stale longer without serving outdated lookups):
 *  - `immutable` — completed trips, finished reviews
 *  - `live`      — open/`has_applicants` trip lists, vacancy feed, applicant lists
 *  - `master`    — admin lookup data (car types, cities, tags, settings, …)
 *  - `profile`   — driver/agent profiles, analytics
 */
export const STALE = {
  immutable: Infinity,
  live: 30_000,
  master: 15 * 60_000,
  profile: 60_000,
} as const;

/**
 * Optional `meta` recognised by the global error funnel — set it on a `useQuery`
 * / `useMutation` to tweak how its errors are handled:
 *  - `silent`       — don't report to Sentry and don't toast (best-effort background work, e.g. geo pings)
 *  - `toastOnError` — show a `toast.error` with a friendly message (mutations rely on this; query views render `<ErrorState>` instead)
 *  - `feature`      — override the Sentry feature tag (defaults to a tag derived from the query key)
 */
export interface TripKingQueryMeta {
  silent?: boolean;
  toastOnError?: boolean;
  feature?: string;
}

function metaOf(meta: Record<string, unknown> | undefined): TripKingQueryMeta {
  return (meta ?? {}) as TripKingQueryMeta;
}

function statusOf(error: unknown): number | undefined {
  return error && typeof error === 'object' && 'status' in error ? (error as { status?: number }).status : undefined;
}

function featureFromQueryKey(key: readonly unknown[]): string {
  const head = key.length > 0 && typeof key[0] === 'string' ? key[0] : 'query';
  return `query:${head}`;
}

/** The single funnel for React-Query errors — report once (unless an inner layer already did), then optionally toast. */
function handleCacheError(error: unknown, opts: { meta: TripKingQueryMeta; feature: string; kind: 'query' | 'mutation' }): void {
  const { meta, feature, kind } = opts;
  const status = statusOf(error);
  if (meta.silent) {
    addDataBreadcrumb(`${kind} error (silent)`, { feature, status });
    return;
  }
  addDataBreadcrumb(`${kind} error`, { feature, status });
  // ApiErrors are already captured (with rich request context) by the API client; 401/404 are expected user errors.
  if (!isReported(error) && status !== 401 && status !== 404) {
    captureDataError(meta.feature ?? feature, error, { status });
  }
  if (meta.toastOnError) toast.error(messageForError(error));
}

/** Singleton QueryClient — `defaultOptions` per §6 of the spec, plus a global error funnel to Sentry (see {@link handleCacheError}). */
export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => handleCacheError(error, { meta: metaOf(query.meta), feature: featureFromQueryKey(query.queryKey), kind: 'query' }),
  }),
  mutationCache: new MutationCache({
    onError: (error, _vars, _onMutateResult, mutation) => {
      const meta = metaOf(mutation.options.meta);
      const keyHead = mutation.options.mutationKey?.[0];
      const feature = meta.feature ?? (typeof keyHead === 'string' ? `mutation:${keyHead}` : 'mutation');
      handleCacheError(error, { meta, feature, kind: 'mutation' });
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: STALE.master,
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
