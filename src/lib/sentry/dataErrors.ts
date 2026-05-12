/**
 * Data-layer error reporting — the single bridge from a thrown error to Sentry.
 *
 * Used by the API client, the React Query caches, the ErrorBoundary and the
 * global window bridge. Adds a `feature` tag, a derived `error_category` tag, a
 * stable fingerprint and (for API context) request metadata, then captures once.
 * Safe to call before `initSentry()` — it just logs in that case.
 *
 * Ported from hudr-pwa/src/lib/sentry/dataErrors.ts, trimmed to TripKing's shape.
 */

import * as Sentry from '@sentry/react';
import { logger } from '@/lib/logger';
import { isSentryInitialized } from './init';
import { isReported, markReported } from './report';

export type ErrorCategory =
  | 'network'
  | 'timeout'
  | 'server_5xx'
  | 'rate_limit'
  | 'not_found'
  | 'forbidden'
  | 'unauthorized'
  | 'client_4xx'
  | 'parse'
  | 'transform'
  | 'validation'
  | 'render'
  | 'unknown';

export interface DataErrorContext {
  /** HTTP endpoint, if this is an API error. */
  endpoint?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  status?: number;
  durationMs?: number;
  /** How many retries the client had already made. */
  retryAttempt?: number;
  /** Truncated request/response body or other free-form context. */
  body?: unknown;
  componentStack?: string | null;
  [key: string]: unknown;
}

interface ErrorLike {
  name?: string;
  message?: string;
  status?: number;
}

function asErrorLike(error: unknown): ErrorLike {
  if (error && typeof error === 'object') return error as ErrorLike;
  return { message: String(error) };
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(typeof error === 'string' ? error : JSON.stringify(error));
}

/** Classify a thrown value for Sentry tagging / friendly-message lookup. Looks at HTTP status first, then the name/message. */
export function classifyError(error: unknown, ctx?: { status?: number }): ErrorCategory {
  const e = asErrorLike(error);
  const status = ctx?.status ?? e.status;
  if (typeof status === 'number' && status > 0) {
    if (status >= 500) return 'server_5xx';
    if (status === 429) return 'rate_limit';
    if (status === 408) return 'timeout';
    if (status === 404) return 'not_found';
    if (status === 403) return 'forbidden';
    if (status === 401) return 'unauthorized';
    if (status === 422 || status === 400) return 'validation';
    if (status >= 400) return 'client_4xx';
  }
  const name = e.name ?? '';
  const msg = (e.message ?? '').toLowerCase();
  if (name === 'ApiError' && (status === 0 || /network/.test(msg))) return 'network';
  if (name.endsWith('TransformError') || name === 'EmptyResponseError') return 'transform';
  if (name === 'ChunkLoadError' || /loading chunk|dynamically imported module/.test(msg)) return 'render';
  if (status === 408 || /timeout|aborted/.test(msg)) return 'timeout';
  if (/network|failed to fetch/.test(msg)) return 'network';
  if (/json|parse|unexpected token/.test(msg)) return 'parse';
  if (/validation|invalid|required/.test(msg)) return 'validation';
  return 'unknown';
}

/** Add a breadcrumb tracking a data action (request start/success, navigation, mutation) leading up to a possible error. */
export function addDataBreadcrumb(action: string, ctx: { feature?: string } & Partial<DataErrorContext>, level: Sentry.SeverityLevel = 'info'): void {
  if (!isSentryInitialized()) return;
  Sentry.addBreadcrumb({
    category: 'data',
    level,
    message: `${ctx.feature ?? 'data'}: ${action}`,
    data: {
      endpoint: ctx.endpoint,
      method: ctx.method,
      status: ctx.status,
      duration_ms: ctx.durationMs,
      retry_attempt: ctx.retryAttempt,
    },
  });
}

/** Report a thrown error to Sentry with a feature tag, derived category and (if present) request context. Reported-once aware. */
export function captureDataError(feature: string, error: unknown, context?: DataErrorContext): string | undefined {
  logger.debug(`[dataError:${feature}]`, error, context);
  if (!isSentryInitialized()) return undefined;
  if (isReported(error)) return undefined;

  const errorObj = toError(error);
  const category = classifyError(error, { status: context?.status });
  const bodyStr =
    context?.body === undefined ? undefined : typeof context.body === 'string' ? context.body.slice(0, 500) : JSON.stringify(context.body).slice(0, 500);

  const eventId = Sentry.captureException(errorObj, {
    tags: { feature, error_category: category, http_method: context?.method },
    contexts: {
      ...(context?.endpoint || context?.status
        ? { api_error: { endpoint: context?.endpoint, method: context?.method, status_code: context?.status, duration_ms: context?.durationMs, retry_attempt: context?.retryAttempt, response_body: bodyStr } }
        : {}),
      ...(context?.componentStack ? { react: { componentStack: context.componentStack } } : {}),
    },
    fingerprint: ['data-error', feature, category, typeof context?.status === 'number' ? String(context.status) : 'no-status', errorObj.name],
  });
  markReported(error);
  return eventId;
}

/** Note a slow data operation as a Sentry message (not an error). */
export function captureDataPerformanceIssue(feature: string, durationMs: number, ctx?: Partial<DataErrorContext>): void {
  if (!isSentryInitialized()) return;
  Sentry.captureMessage(`${feature} slow response`, {
    level: 'warning',
    tags: { feature, performance_issue: 'slow_response', duration_category: durationMs < 5000 ? 'slow' : durationMs < 10000 ? 'very_slow' : 'critical' },
    contexts: { performance: { feature, endpoint: ctx?.endpoint, method: ctx?.method, duration_ms: durationMs } },
  });
}

/** Start an inactive performance span for a data operation. Caller must `.end()` it. */
export function startDataTransaction(name: string, feature: string, ctx?: Partial<DataErrorContext>): Sentry.Span | undefined {
  if (!isSentryInitialized()) return undefined;
  return Sentry.startInactiveSpan({ name, op: `data.${feature}`, attributes: { feature, endpoint: ctx?.endpoint, method: ctx?.method } });
}

/**
 * Wrap an async function with breadcrumb + timing + guaranteed Sentry capture.
 * Use on service functions whose errors might escape React Query (e.g. called
 * directly from a context/effect rather than through a hook). Re-throws.
 */
export function withErrorTracking<TArgs extends unknown[], TReturn>(feature: string, endpoint: string, fn: (...args: TArgs) => Promise<TReturn>): (...args: TArgs) => Promise<TReturn> {
  return async (...args: TArgs): Promise<TReturn> => {
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    addDataBreadcrumb('request', { feature, endpoint });
    try {
      const result = await fn(...args);
      const durationMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt);
      addDataBreadcrumb('success', { feature, endpoint, durationMs });
      if (durationMs > 5000) captureDataPerformanceIssue(feature, durationMs, { endpoint });
      return result;
    } catch (error) {
      const durationMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt);
      captureDataError(feature, error, { endpoint, durationMs });
      throw error;
    }
  };
}

export interface SentryDebugIds {
  lastEventId: string;
  traceId: string;
  replayId: string;
}

/** IDs that link a UX surface (e.g. a support form) directly to the Sentry event / trace / replay. Best-effort. */
export function getSentryDebugIds(): SentryDebugIds {
  const empty: SentryDebugIds = { lastEventId: '', traceId: '', replayId: '' };
  if (!isSentryInitialized()) return empty;
  try {
    const lastEventId = Sentry.lastEventId() ?? '';
    let traceId = '';
    try {
      traceId = Sentry.getCurrentScope().getPropagationContext()?.traceId ?? '';
    } catch {
      /* propagation context may be unavailable */
    }
    let replayId = '';
    try {
      const replay = Sentry.getClient()?.getIntegrationByName?.('Replay') as { getReplayId?: () => string | undefined } | undefined;
      replayId = replay?.getReplayId?.() ?? '';
    } catch {
      /* replay may be unavailable */
    }
    return { lastEventId, traceId, replayId };
  } catch {
    return empty;
  }
}
