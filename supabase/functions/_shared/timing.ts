/**
 * Performance instrumentation + outermost error boundary for edge functions
 * (the TournamentPro pattern, extended): times the handler, logs
 * `METHOD path -> status ms`, sets a `Server-Timing` header, fire-and-forget-persists
 * one row per request to `api_metrics` (migration 005), and — if the handler throws —
 * reports the exception to Sentry (`source=edge-fn`) and returns a `fail('INTERNAL', …, 500)`
 * envelope rather than re-throwing, so the client always gets the `{ success, error }`
 * shape (never a raw runtime 500). The metrics persist is best-effort — on Deno Deploy the
 * isolate may terminate before it lands; never await it, never let it affect the response.
 */
import { serviceClient } from './supabase.ts';
import { fail } from './cors.ts';
import { ERROR_CODES } from './codes.ts';
import { captureServerException } from './sentry.ts';

// memoized per-isolate (each Deno Deploy isolate gets fresh module scope; reused isolates reuse this)
let _metrics: ReturnType<typeof serviceClient> | null | undefined;
function metricsClient(): ReturnType<typeof serviceClient> | null {
  if (_metrics === undefined) {
    try {
      _metrics = serviceClient();
    } catch {
      _metrics = null; // SUPABASE_URL / SERVICE_ROLE_KEY not set — skip metrics
    }
  }
  return _metrics ?? null;
}
function persist(name: string, method: string, status: number, ms: number): void {
  const c = metricsClient();
  if (!c) return;
  // fire-and-forget — swallow both resolution paths
  c.from('api_metrics').insert({ endpoint: name, method, status, duration_ms: ms }).then(
    () => {},
    () => {},
  );
}

export function withTiming(name: string, handler: (req: Request) => Promise<Response>): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const started = performance.now();
    const path = new URL(req.url).pathname;
    try {
      const res = await handler(req);
      const ms = Math.round(performance.now() - started);
      if (req.method !== 'OPTIONS') {
        console.log(`[${name}] ${req.method} ${path} -> ${res.status} ${ms}ms`);
        persist(name, req.method, res.status, ms);
      }
      try {
        res.headers.set('Server-Timing', `total;dur=${ms};desc="${name}"`);
      } catch {
        /* immutable headers on some responses — ignore */
      }
      return res;
    } catch (err) {
      const ms = Math.round(performance.now() - started);
      console.error(`[${name}] ${req.method} ${path} -> threw after ${ms}ms`, err);
      if (req.method !== 'OPTIONS') {
        persist(name, req.method, 500, ms);
        captureServerException(err, { fn: name, method: req.method, path, status: 500 });
      }
      const res = fail(ERROR_CODES.INTERNAL, 'Something went wrong on our side. We have been notified — please try again.', 500);
      try {
        res.headers.set('Server-Timing', `total;dur=${ms};desc="${name}"`);
      } catch {
        /* ignore */
      }
      return res;
    }
  };
}
