import { useCallback } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

/**
 * Resolves and returns a function that takes the user back to a sensible
 * destination. Centralises every back-arrow / "back to home" path in the app
 * so the route shape (`/app/*` after PR #301) lives in exactly one place.
 *
 * Resolution order:
 *   1. `?from=<path>` URL search param — the in-app breadcrumb a producer
 *      Link set (e.g. HomeTile → /app/referrals?from=/app)
 *   2. `location.state.from` — set by some Links via `state={{ from: pathname }}`
 *      (ReviewSelectionsPage uses this style)
 *   3. `window.history.length > 1` → `navigate(-1)` (browser back, safe
 *      because we know the previous entry was in-tab)
 *   4. `fallback` (default `/app` = role-aware home)
 *
 * Pages don't need to know the app's route shape — they only declare "if I
 * have no breadcrumb, where's home for this surface?". For most pages that's
 * `/app`; flow pages can pass `/app/trips` or similar for a more contextual
 * fallback.
 *
 * Does NOT refresh data. TanStack Query handles cache freshness via mutation
 * invalidation + `refetchOnMount` + per-resource `staleTime` (see
 * src/lib/queryClient.ts). The back-arrow's job is purely the destination.
 */
export function useAppBack(fallback = '/app'): () => void {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const location = useLocation();

  return useCallback(() => {
    const fromParam = params.get('from');
    if (fromParam) {
      navigate(fromParam);
      return;
    }
    const stateFrom = (location.state as { from?: string } | null)?.from;
    if (stateFrom) {
      navigate(stateFrom);
      return;
    }
    if (typeof window !== 'undefined' && window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate(fallback);
  }, [navigate, params, location.state, fallback]);
}
