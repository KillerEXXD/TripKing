/**
 * `deferBackground` — fire-and-forget a best-effort task after the response goes out.
 *
 * Use for work that mustn't block the caller (cache warming, notification fan-out,
 * directory upserts, analytics events). The task runs in the same isolate but on
 * a separate microtask tick — Deno's runtime keeps the isolate alive long enough
 * for the promise to settle, similar to Cloudflare's `event.waitUntil` pattern.
 *
 * Rules of use:
 *   1. The task MUST be idempotent — Supabase may retry or replay isolates.
 *   2. NEVER throw out of it — wrap each await in `.catch(() => {})` or a
 *      try/catch, or use Promise.allSettled. An unhandled rejection in a
 *      detached task can crash the isolate for the NEXT request.
 *   3. Don't touch the original `req` or `res` from inside — they're closed.
 *   4. Cap the work to ~5s. Longer-running jobs belong in pg_cron / a queue.
 *
 * Why we don't use `EdgeRuntime.waitUntil`: Supabase's `EdgeRuntime` global isn't
 * declared in the Deno types we use, and behaviour around shutdown isn't documented
 * for the supabase/functions runtime. A plain detached promise gets the same effect
 * with no global-API dependency.
 */
export function deferBackground(task: () => Promise<unknown>): void {
  // Detach by returning to the event loop first. The .catch swallows any unhandled
  // rejection so it can't kill the isolate.
  queueMicrotask(() => {
    task().catch((err) => {
      try {
        console.error('[deferBackground] task failed:', err);
      } catch {
        /* logger gone; ignore */
      }
    });
  });
}
