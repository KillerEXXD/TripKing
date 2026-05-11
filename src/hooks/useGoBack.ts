import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * A robust "go back" for header back-arrows.
 *
 * `navigate(-1)` does nothing when there's no in-app history — e.g. when the
 * page was opened directly (typed URL, refresh, a shared deep link, or after
 * a `<Navigate replace>` redirect). React Router stamps an `idx` onto
 * `window.history.state`; `idx > 0` means there's an earlier in-app entry to
 * go back to. Otherwise we send the user to a sensible parent route.
 *
 * @param fallback where to go when there's nothing to go back to (default `/home`).
 */
export function useGoBack(fallback: string = '/home') {
  const navigate = useNavigate();
  return useCallback(() => {
    const idx =
      typeof window !== 'undefined'
        ? (window.history.state as { idx?: number } | null)?.idx ?? 0
        : 0;
    if (idx > 0) navigate(-1);
    else navigate(fallback, { replace: true });
  }, [navigate, fallback]);
}
