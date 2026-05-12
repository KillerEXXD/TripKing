/**
 * Performance instrumentation wrapper for edge functions (the TournamentPro pattern):
 * times the handler, logs `METHOD path -> status ms`, sets a `Server-Timing` header, and
 * fire-and-forget-persists one row per request to `api_metrics` (migration 005). The persist
 * is non-blocking and best-effort — on Deno Deploy the isolate may terminate before it lands
 * (~90% persist rate observed elsewhere); never await it, never let it affect the response.
 */
import { serviceClient } from './supabase.ts';

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
      if (req.method !== 'OPTIONS') persist(name, req.method, 500, ms);
      throw err;
    }
  };
}
