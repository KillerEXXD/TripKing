import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { capturePageview } from '@/lib/posthog';

/** Fires a PostHog `$pageview` on every route change. Render once, inside the router. */
export function PostHogPageviewTracker() {
  const { pathname, search } = useLocation();
  useEffect(() => {
    capturePageview(pathname + search);
  }, [pathname, search]);
  return null;
}

export default PostHogPageviewTracker;
