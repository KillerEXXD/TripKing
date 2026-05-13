/**
 * SW → page error bridge. The custom service worker (`src/sw.ts`) posts
 * `{ type: 'sw-error', kind, message, stack?, url? }` messages on every
 * `error` / `unhandledrejection` it catches. This listener funnels those
 * into Sentry tagged `source: 'service-worker'`, so SW-context bugs show
 * up alongside main-thread errors.
 *
 * Why a bridge instead of bundling the Sentry SDK in the worker: our SW
 * is a thin Workbox passthrough (precache + asset SWR). The bridge is
 * ~70 lines and uses the existing Sentry client; full-SDK-in-SW would
 * add ~15kb to every install for no observable improvement. (Workbox's
 * own docs recommend this pattern for thin SWs.)
 *
 * Rate-limit: 10 reports per page session. A SW in a crash loop must
 * not drown Sentry — anything past the limit is silently dropped, with
 * a single console breadcrumb so a developer can spot the throttling in
 * devtools.
 *
 * Install once from `main.tsx`, right after `installGlobalErrorHandlers()`.
 */

import * as Sentry from '@sentry/react';
import { logger } from '@/lib/logger';

const MAX_REPORTS_PER_SESSION = 10;
let reportCount = 0;
let installed = false;

interface SwErrorMessage {
  type: 'sw-error';
  kind: 'error' | 'unhandledrejection';
  message: string;
  stack?: string;
  url?: string;
}

function isSwErrorMessage(data: unknown): data is SwErrorMessage {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  if (d.type !== 'sw-error') return false;
  if (d.kind !== 'error' && d.kind !== 'unhandledrejection') return false;
  return typeof d.message === 'string';
}

export function installSwErrorBridge(): void {
  if (installed) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  installed = true;

  navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
    if (!isSwErrorMessage(event.data)) return;
    if (reportCount >= MAX_REPORTS_PER_SESSION) {
      if (reportCount === MAX_REPORTS_PER_SESSION) {
        logger.warn('[sw-bridge] suppressing further SW errors this session (rate limit)');
        reportCount++; // bump so the warn only fires once
      }
      return;
    }
    reportCount++;
    const err = new Error(`[sw] ${event.data.message}`);
    if (event.data.stack) err.stack = event.data.stack;
    Sentry.captureException(err, {
      tags: { source: 'service-worker', kind: event.data.kind },
      extra: { swUrl: event.data.url },
    });
  });
}

/** Test-only — resets module state between tests. NEVER call from production code. */
export function __resetSwErrorBridgeForTests(): void {
  installed = false;
  reportCount = 0;
}
