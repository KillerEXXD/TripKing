/**
 * L0 global safety net — the outermost catch in the layered exception handling.
 *
 * Sentry's default `globalHandlersIntegration` already captures uncaught errors
 * and unhandled promise rejections, so this layer deliberately does **not**
 * re-capture (that would double-report). It exists to:
 *   - log every uncaught error / rejection with the consistent `[TripKing]` prefix,
 *   - leave a breadcrumb for resource-load failures (failed `<img>`/`<script>`/CSS),
 *     which Sentry does not record by default but which often precede a real error.
 *
 * Install once from `main.tsx`, right after `initSentry()`.
 */

import * as Sentry from '@sentry/react';
import { logger } from '@/lib/logger';
import { isReported } from '@/lib/sentry';

let installed = false;

export function installGlobalErrorHandlers(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener(
    'error',
    (event: ErrorEvent) => {
      // Resource-load error (img/script/link) — `target` is the element, no `error`.
      const target = event.target as (HTMLElement & { src?: string; href?: string }) | null;
      if (target && target !== (window as unknown as EventTarget) && (target.src || target.href) && !event.error) {
        const url = target.src ?? target.href ?? '';
        logger.warn('resource failed to load:', url);
        Sentry.addBreadcrumb({ category: 'resource', level: 'warning', message: `failed to load ${target.tagName?.toLowerCase()}`, data: { url } });
        return;
      }
      if (isReported(event.error)) return;
      logger.error('uncaught error:', event.error ?? event.message);
    },
    true, // capture phase — needed to see resource-load errors
  );

  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    if (isReported(event.reason)) return;
    logger.error('unhandled promise rejection:', event.reason);
  });
}
