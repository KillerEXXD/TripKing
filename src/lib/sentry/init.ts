import * as Sentry from '@sentry/react';
import { useEffect } from 'react';
import { createRoutesFromChildren, matchRoutes, useLocation, useNavigationType } from 'react-router-dom';
import { APP_VERSION } from '@/version';
import { logger } from '@/lib/logger';

let initialized = false;

/** True once `initSentry()` has run with a DSN. Used by the capture helpers to no-op cleanly in dev. */
export function isSentryInitialized(): boolean {
  return initialized;
}

/** dev (localhost) · preview (*.vercel.app) · production — drives the Sentry `environment` tag. */
function detectEnvironment(): string {
  if (typeof window === 'undefined') return 'ssr';
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) return 'development';
  if (host.endsWith('.vercel.app')) return 'preview';
  return 'production';
}

/**
 * Noise we never want in Sentry — chunk-load failures (handled by a reload), benign
 * browser quirks, browser-SW infrastructure errors (registration MIME-type / network).
 *
 * Note: we deliberately do NOT filter on `/\bsw\.js\b/` any more. Our own SW errors
 * arrive via the swErrorBridge tagged `source: 'service-worker'` and we DO want those
 * in Sentry. The intercept lower in `beforeSend` lets them through before this list
 * is checked.
 */
const NOISE_MESSAGE_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /loading chunk \d+ failed/i,
  /loading css chunk/i,
  /importing a module script failed/i,
  /\bchunkloaderror\b/i,
  /resizeobserver loop/i,
  /failed to register .* service ?worker/i,
  /is not a valid javascript mime type/i,
];

/** True when the event came in via swErrorBridge (we set `tags.source = 'service-worker'`). */
function isOurSwBridgeEvent(event: Sentry.ErrorEvent): boolean {
  const tags = event.tags as Record<string, unknown> | undefined;
  return tags?.source === 'service-worker';
}

function isExtensionFrame(filename: string | undefined): boolean {
  return Boolean(filename && /^(chrome|moz|safari|webkit|ms-browser)-extension:\/\//i.test(filename));
}

/**
 * Initialize Sentry — call once from `main.tsx`, before React renders, so the
 * SDK's `window` `error`/`unhandledrejection` hooks are armed as early as possible.
 * No-op when `VITE_SENTRY_DSN` is unset (local dev without Sentry).
 */
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn || initialized) return;

  try {
    Sentry.init({
      dsn,
      release: `tripking@${APP_VERSION}`,
      environment: detectEnvironment(),
      enabled: import.meta.env.PROD || import.meta.env.VITE_SENTRY_ENABLED === 'true',
      integrations: [
        Sentry.reactRouterV7BrowserTracingIntegration({
          useEffect,
          useLocation,
          useNavigationType,
          createRoutesFromChildren,
          matchRoutes,
        }),
        Sentry.replayIntegration({ maskAllText: false, blockAllMedia: false }),
      ],
      tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
      // Session replay: never for normal sessions, always when an error occurs.
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 1.0,
      ignoreErrors: [
        'ResizeObserver loop limit exceeded',
        'ResizeObserver loop completed with undelivered notifications',
        'Non-Error promise rejection captured',
      ],
      beforeSend(event, hint) {
        // Always let our own SW-bridge events through — they're explicitly captured by
        // `src/lib/swErrorBridge.ts` from the custom service worker and shouldn't be
        // filtered by the SW-infra noise patterns below.
        if (isOurSwBridgeEvent(event)) return event;
        const original = hint?.originalException as { status?: number } | undefined;
        // 401 (bad/expired creds — the client refreshes) and 404 (stale links) are user errors, not bugs.
        if (original && typeof original === 'object' && (original.status === 401 || original.status === 404)) {
          return null;
        }
        const message = (event.exception?.values?.[0]?.value ?? event.message ?? '').toString();
        if (NOISE_MESSAGE_PATTERNS.some((re) => re.test(message))) return null;
        const apiStatus = event.contexts?.api_error?.status_code;
        if ((apiStatus === 401 || apiStatus === 404) && /not found|unauthor/i.test(message)) return null;
        // Errors whose every stack frame is a browser extension aren't ours.
        const frames = event.exception?.values?.[0]?.stacktrace?.frames ?? [];
        if (frames.length > 0 && frames.every((f) => isExtensionFrame(f.filename ?? undefined))) return null;
        return event;
      },
    });
    initialized = true;
  } catch (error) {
    // Don't let an init failure take down the app.
    logger.error('[Sentry] init failed:', error);
  }
}
