/**
 * Performance instrumentation wrapper for edge functions (the TournamentPro pattern):
 * times the handler, logs `METHOD path -> status ms`, sets a `Server-Timing` header.
 * (DB metric persistence to an `api_metrics` table is a TODO once that table exists.)
 */
export function withTiming(name: string, handler: (req: Request) => Promise<Response>): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const started = performance.now();
    const path = new URL(req.url).pathname;
    try {
      const res = await handler(req);
      const ms = Math.round(performance.now() - started);
      if (req.method !== 'OPTIONS') console.log(`[${name}] ${req.method} ${path} -> ${res.status} ${ms}ms`);
      try {
        res.headers.set('Server-Timing', `total;dur=${ms};desc="${name}"`);
      } catch {
        /* immutable headers on some responses — ignore */
      }
      return res;
    } catch (err) {
      const ms = Math.round(performance.now() - started);
      console.error(`[${name}] ${req.method} ${path} -> threw after ${ms}ms`, err);
      throw err;
    }
  };
}
