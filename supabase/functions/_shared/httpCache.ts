/**
 * HTTP cache headers — Phase 2 of the caching strategy. Adds `Cache-Control` and `ETag`
 * to cached responses so the browser, the Service Worker, and (in Phase 3) Cloudflare
 * can all respect the same TTL.
 *
 * Ported pattern from TournamentPro's `_shared/response.ts` cacheControlFor() with one
 * conservative change: `s-maxage` is set equal to the origin TTL (not 2× it) so the CDN
 * never serves something staler than the origin would. Add stale-while-revalidate to soften
 * the cliff at expiry.
 *
 * The PII / Cloudflare trap rule (docs/CACHE_BASELINE.md §4) is enforced here by REQUIRING
 * the caller to pass `scope`: 'public' for anonymous-safe payloads, 'private' for
 * per-user payloads. There is no default — the type system forces a decision.
 */

export type CacheScope = 'public' | 'private';

export interface CacheControlOptions {
  /** TTL in seconds. */
  ttl: number;
  /** 'public' if the response is byte-identical for every viewer; 'private' otherwise. */
  scope: CacheScope;
  /** Optional stale-while-revalidate window (seconds). Defaults to `ttl` (TournamentPro's pattern). */
  swr?: number;
}

/** Build a Cache-Control header value. */
export function cacheControl(opts: CacheControlOptions): string {
  const { ttl, scope, swr } = opts;
  if (ttl <= 0) return 'private, no-store, no-cache, must-revalidate';
  const swrWindow = swr ?? ttl;
  if (scope === 'public') {
    return `public, max-age=${ttl}, s-maxage=${ttl}, stale-while-revalidate=${swrWindow}`;
  }
  // private: browser may cache but no shared cache (Cloudflare / proxies must skip)
  return `private, max-age=${ttl}, stale-while-revalidate=${swrWindow}`;
}

/** Set Cache-Control on a Response (ignored silently if headers are immutable). */
export function setCacheControl(res: Response, opts: CacheControlOptions): Response {
  try {
    res.headers.set('Cache-Control', cacheControl(opts));
  } catch {
    /* immutable headers — ignore */
  }
  return res;
}

/** Compute a weak ETag for a payload. Stable across isolates because the hash is deterministic. */
export async function weakEtagFor(body: string): Promise<string> {
  const bytes = new TextEncoder().encode(body);
  const digest = await crypto.subtle.digest('SHA-1', bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `W/"${hex.slice(0, 16)}"`;
}

/**
 * Return 304 Not Modified if the request's If-None-Match matches the computed ETag for
 * `body`; otherwise stamp the ETag on `res` and return it. Caller still owns the response.
 *
 * Usage:
 *   const body = JSON.stringify(envelope);
 *   const res = new Response(body, {...});
 *   return await maybeNotModified(req, res, body);
 */
export async function maybeNotModified(req: Request, res: Response, body: string): Promise<Response> {
  const etag = await weakEtagFor(body);
  const inm = req.headers.get('if-none-match') ?? req.headers.get('If-None-Match');
  if (inm && inm.trim() === etag) {
    // 304 — preserve cache headers from the original response so the client knows the TTL.
    const headers = new Headers();
    headers.set('ETag', etag);
    const cc = res.headers.get('Cache-Control');
    if (cc) headers.set('Cache-Control', cc);
    const cache = res.headers.get('X-Cache');
    if (cache) headers.set('X-Cache', cache);
    return new Response(null, { status: 304, headers });
  }
  try {
    res.headers.set('ETag', etag);
  } catch {
    /* immutable — ignore */
  }
  return res;
}
