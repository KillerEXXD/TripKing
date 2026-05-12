import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { logger } from '@/lib/logger';

/**
 * `React.lazy` that recovers from a stale-deployment chunk failure: if the
 * dynamic `import()` rejects, reload the page once so the browser fetches the
 * current bundle. The returned promise never resolves on that path (the page is
 * already reloading), so React keeps showing the Suspense fallback in the meantime.
 *
 * Use this instead of bare `lazy(() => import(...))` for every route module.
 * `ErrorBoundary` also detects chunk errors as a second safety net.
 */
// `ComponentType<any>` mirrors React's own `lazy` signature — props are unknowable here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithRetry<T extends ComponentType<any>>(importFn: () => Promise<{ default: T }>): LazyExoticComponent<T> {
  return lazy(() =>
    importFn().catch((error: unknown) => {
      logger.warn('chunk failed to load — reloading for the latest bundle:', error);
      window.location.reload();
      return new Promise<{ default: T }>(() => {
        /* never resolves — the reload is in flight */
      });
    }),
  );
}
