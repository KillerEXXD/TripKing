/* eslint-disable no-console */
/**
 * Tiny logger wrapper — never `console.log` directly in committed code.
 * `debug`/`info` are dev-only; `warn`/`error` always fire (and feed Sentry
 * via the API client / ErrorBoundary).
 */
const isDev = import.meta.env.DEV;

export const logger = {
  debug: (...args: unknown[]): void => {
    if (isDev) console.debug('[TripKing]', ...args);
  },
  info: (...args: unknown[]): void => {
    if (isDev) console.info('[TripKing]', ...args);
  },
  warn: (...args: unknown[]): void => {
    console.warn('[TripKing]', ...args);
  },
  error: (...args: unknown[]): void => {
    console.error('[TripKing]', ...args);
  },
};
