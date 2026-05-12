/**
 * Sentry bootstrap.
 *
 * Stub for the scaffold commit; the real `@sentry/react` init (BrowserTracing,
 * Replay, `VITE_SENTRY_DSN`, release = `APP_VERSION`) lands in the
 * "providers + bootstrap" commit. Kept as a no-op so `main.tsx` can call it
 * unconditionally.
 */
export function initSentry(): void {
  // intentionally empty until Sentry is wired
}

/**
 * Report a data-layer error (transform failure, unexpected API shape).
 * Stub — becomes a Sentry `captureException` with feature tagging.
 */
export function captureDataError(_feature: string, _error: unknown, _context?: Record<string, unknown>): void {
  // intentionally empty until Sentry is wired
}
