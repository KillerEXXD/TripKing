/**
 * tripking-api-proxy — Cloudflare Worker that fronts api.tripkingapp.com and proxies
 * to Supabase Edge Functions, with edge caching for the public read paths.
 *
 * Why this exists: Supabase's edge runs on Cloudflare, and a bare CNAME from a
 * customer zone to a Supabase project produces Cloudflare error 1014 (CNAME
 * cross-user banned). This Worker traps the request on TripKing's zone BEFORE the
 * CNAME hop, re-fetches the Supabase URL with the right Host, and rebroadcasts the
 * response. Net effect: api.tripkingapp.com works AND we get Cloudflare's edge cache.
 *
 * Caching policy is shared with docs/CLOUDFLARE_CACHE_RULES.md:
 *   - GET without user-Authorization → cacheable. Origin's `Cache-Control` decides
 *     storage (must include `public` and not include `private` / `no-store`).
 *   - Anything else → bypass. The PII / "varies-by-viewer" rule from CACHE_BASELINE.md §4
 *     is enforced by origin emitting `private` on those responses (Phase 2 commit 4a56b2a).
 *
 * Pure logic (shouldAttemptCache, shouldStoreResponse, buildOriginRequest, preflight,
 * withCors) lives in sibling modules and is unit-tested in __tests__/.
 */

import { shouldAttemptCache, shouldStoreResponse } from './cacheability.js';
import { preflight, withCors } from './cors.js';
import { buildOriginRequest } from './proxy.js';

export default {
  async fetch(request, env, ctx) {
    try {
      const pre = preflight(request);
      if (pre) return pre;

      const upstream = buildOriginRequest(request, env);

      if (!shouldAttemptCache(request, env.SUPABASE_ANON_KEY ?? '')) {
        const res = await fetch(upstream);
        return tagAndCors(res, 'BYPASS');
      }

      const cache = caches.default;
      // Cache by the original public URL so client-side debugging matches what the cache
      // sees. Querystring is part of the URL, so paged/filtered responses cache distinctly.
      const cacheKey = new Request(request.url, { method: 'GET' });
      const cached = await cache.match(cacheKey);
      if (cached) return tagAndCors(cached, 'HIT');

      const res = await fetch(upstream);
      if (shouldStoreResponse(res)) {
        // Clone before storing — body is single-use; strip Set-Cookie so the cache accepts it.
        const cacheable = stripSetCookie(res.clone());
        ctx.waitUntil(cache.put(cacheKey, cacheable));
        return tagAndCors(res, 'MISS');
      }
      return tagAndCors(res, 'DYNAMIC');
    } catch (err) {
      const message = err && err.message ? String(err.message) : 'unknown';
      return new Response(
        JSON.stringify({ success: false, data: null, error: { code: 'PROXY_ERROR', message } }),
        { status: 502, headers: { 'Content-Type': 'application/json' } },
      );
    }
  },
};

/** Add X-Cache-Tier + the standard CORS headers to a response. */
function tagAndCors(res, tier) {
  const tagged = withCors(res);
  tagged.headers.set('X-Cache-Tier', `worker:${tier}`);
  return tagged;
}

function stripSetCookie(res) {
  const headers = new Headers(res.headers);
  headers.delete('Set-Cookie');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
