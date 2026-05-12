/**
 * "Report once" marker — the layered exception handling (apiClient → React Query
 * caches → ErrorBoundary → the global window bridge) all funnel toward Sentry, so
 * the layer that *first* captures an error stamps it and outer layers skip it.
 *
 * The mark is a non-enumerable Symbol so it never leaks into JSON / logs / Sentry
 * `extra`. Non-object errors (strings, etc.) are wrapped before capture elsewhere,
 * so they're treated as never-reported here.
 */

const REPORTED = Symbol('tk.reported');

/** Mark `error` as already sent to Sentry. No-op for non-objects. */
export function markReported(error: unknown): void {
  if (error && typeof error === 'object') {
    Object.defineProperty(error, REPORTED, { value: true, enumerable: false, configurable: true });
  }
}

/** True if a previous layer already reported this error to Sentry. */
export function isReported(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as Record<symbol, unknown>)[REPORTED]);
}
