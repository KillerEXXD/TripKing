/**
 * Pure decision: should this request go through the Cloudflare cache, or bypass to origin?
 *
 * Rules (matches docs/CLOUDFLARE_CACHE_RULES.md):
 *   1. Only GET is cacheable. POST/PATCH/PUT/DELETE always bypass.
 *   2. "User auth" (Authorization: Bearer <not-the-anon-key>) → bypass — every per-user
 *      payload is private. The anon Bearer (when present) IS allowed because it's the
 *      same string for every anonymous caller and the response is byte-identical.
 *   3. Beyond this gate, origin's `Cache-Control` decides storage: a `private` /
 *      `no-store` response from origin is fetched but NOT put in cache. That logic
 *      lives in worker.js; this function only decides whether to attempt a cache lookup.
 *
 * Exported pure so it's unit-testable without the Workers runtime.
 */

const ANON_BEARER_PREFIX = 'Bearer ';

export function shouldAttemptCache(request, anonKey) {
  if (request.method !== 'GET') return false;
  const auth = request.headers.get('authorization') ?? request.headers.get('Authorization') ?? '';
  if (auth === '') return true; // anonymous request — cache
  if (!auth.startsWith(ANON_BEARER_PREFIX)) return false; // weird auth scheme — be safe
  const token = auth.slice(ANON_BEARER_PREFIX.length);
  if (anonKey && token === anonKey) return true; // anon Bearer is fine
  return false; // user JWT — bypass
}

/**
 * Should the fetched response actually be written to cache?
 * Honour the origin's `Cache-Control`: must include `public` and must NOT include
 * `private`, `no-store`, or `no-cache`. 200-range status only.
 */
export function shouldStoreResponse(response) {
  if (response.status < 200 || response.status >= 300) return false;
  const cc = response.headers.get('Cache-Control') ?? '';
  if (!/\bpublic\b/i.test(cc)) return false;
  if (/\bno-store\b|\bno-cache\b|\bprivate\b/i.test(cc)) return false;
  return true;
}
