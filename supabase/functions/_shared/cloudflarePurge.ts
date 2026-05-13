/**
 * Cloudflare cache-purge helper — Phase 4 invalidation across the CDN tier.
 *
 * Called by mutation handlers right next to their server-side cache invalidation
 * (`cacheDeletePattern(...)`, `sharedCacheInvalidateType(...)`). Layered invalidation:
 *   - Edge function memory   → cacheDeletePattern (immediate)
 *   - Postgres `api_cache`   → sharedCacheInvalidateType (atomic, cluster-wide)
 *   - Cloudflare edge cache  → this module (best-effort, fire-and-forget)
 *
 * Fire-and-forget: cache failures must never break the mutation response. If
 * either secret is missing or the API call fails, we log + return — the next read
 * after the TTL window will refresh anyway.
 *
 * Set the secrets once per environment with:
 *   npx supabase secrets set --project-ref saxcbebqxgatiktsebxw \
 *     CLOUDFLARE_ZONE_ID=... CLOUDFLARE_PURGE_TOKEN=...
 *
 * The CLI helper at `scripts/cloudflare-purge.cjs` exposes the same API for
 * ad-hoc purges from a developer shell.
 */

const PURGE_URL = (zone: string): string =>
  `https://api.cloudflare.com/client/v4/zones/${zone}/purge_cache`;

let warnedMissing = false;

/** Build the absolute URLs the Cloudflare Worker would have cached for a given API path. */
export function purgeUrlsFor(paths: string[], base = 'https://api.tripkingapp.com'): string[] {
  return paths.map((p) => (p.startsWith('http') ? p : `${base}${p.startsWith('/') ? '' : '/'}${p}`));
}

/**
 * Best-effort purge of one or more API URLs from the Cloudflare edge cache.
 * Returns `true` on success, `false` on any failure (logged, never thrown).
 */
export async function purgeCloudflare(urls: string[]): Promise<boolean> {
  if (urls.length === 0) return true;
  const zone = Deno.env.get('CLOUDFLARE_ZONE_ID');
  const token = Deno.env.get('CLOUDFLARE_PURGE_TOKEN');
  if (!zone || !token) {
    // Logged once per isolate lifetime — silent thereafter so it doesn't drown the log stream.
    if (!warnedMissing) {
      warnedMissing = true;
      console.warn('[purgeCloudflare] CLOUDFLARE_ZONE_ID / CLOUDFLARE_PURGE_TOKEN not set — skipping');
    }
    return false;
  }
  try {
    const res = await fetch(PURGE_URL(zone), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ files: urls }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '<no body>');
      console.warn(`[purgeCloudflare] HTTP ${res.status}: ${text.slice(0, 200)}`);
      return false;
    }
    const j: unknown = await res.json().catch(() => null);
    const success = j && typeof j === 'object' && (j as { success?: boolean }).success === true;
    if (!success) {
      console.warn(`[purgeCloudflare] non-success body: ${JSON.stringify(j).slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`[purgeCloudflare] threw: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

/**
 * Convenience — fire purge in the background without blocking the response.
 * The mutation handler can call `purgeCloudflareAsync(...)` and return immediately;
 * Deno keeps the isolate alive long enough to flush the fetch (`waitUntil`-style).
 */
export function purgeCloudflareAsync(urls: string[]): void {
  // Intentional: NOT awaited. Errors are caught inside purgeCloudflare.
  void purgeCloudflare(urls);
}
