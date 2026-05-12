import * as Sentry from '@sentry/react';
import { APP_VERSION } from '@/version';
import { logger } from '@/lib/logger';

let initialized = false;

/** Init Sentry if `VITE_SENTRY_DSN` is set (no-op otherwise). Called once from `main.tsx`. */
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn || initialized) return;
  Sentry.init({
    dsn,
    release: `tripking@${APP_VERSION}`,
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
  });
  initialized = true;
}

/** Report a data-layer / render error with a feature tag. Safe to call before init (logs only). */
export function captureDataError(feature: string, error: unknown, context?: Record<string, unknown>): void {
  logger.debug(`[dataError:${feature}]`, error, context);
  if (!initialized) return;
  Sentry.captureException(error, { tags: { feature }, extra: context });
}

/** Associate the current user with subsequent events. */
export function setSentryUser(user: { id: string; role?: string } | null): void {
  if (!initialized) return;
  Sentry.setUser(user ? { id: user.id, role: user.role } : null);
}
