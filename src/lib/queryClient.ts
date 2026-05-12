import { QueryClient } from '@tanstack/react-query';

/**
 * Per-resource `staleTime` overrides (see CLAUDE.md §"Caching"):
 *  - `immutable` — completed trips, finished reviews
 *  - `live`      — open/`has_applicants` trip lists, vacancy feed, applicant lists
 *  - `master`    — admin lookup data (car types, cities, tags, settings, …)
 *  - `profile`   — driver/agent profiles, analytics
 */
export const STALE = {
  immutable: Infinity,
  live: 30_000,
  master: 5 * 60_000,
  profile: 60_000,
} as const;

/** Singleton QueryClient — `defaultOptions` per §6 of the spec. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STALE.master,
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
