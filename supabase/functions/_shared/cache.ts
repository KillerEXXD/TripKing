/**
 * In-memory cache primitive — Tier 3 of the caching strategy (see docs/CACHE_BASELINE.md).
 *
 * Per Deno-isolate Map<string, { data, expiresAt }>. Used directly for short-TTL hot paths
 * (e.g. `app_settings`) and as the fast path inside {@link ../sharedCache.ts}'s two-tier
 * lookup. The wrapper that ties this + sharedCache + single-flight together is
 * {@link ../withCache.ts}.
 *
 * Ported from TournamentPro's `_shared/cache.ts` with a small extension:
 * `cacheDeletePattern` for invalidation (e.g. `cacheDeletePattern('admin:car-types:*')`
 * on an admin write).
 *
 * Caveats:
 *   • Each Deno Deploy isolate has its own Map — a "memory hit" on instance A is a miss on
 *     instance B. For cross-instance consistency use the shared (DB-backed) tier instead.
 *   • Don't put PII in here unless the key already encodes the viewer (e.g. `:user-<id>`).
 *   • Isolates can be evicted at any time; treat the cache as best-effort.
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

export const CacheTTL = {
  SHORT: 30,        // live marketplace (vacancies, trips)
  MEDIUM: 300,      // profile / vehicle records
  LONG: 900,        // master / reference data (admin lookups)
  VERY_LONG: 3600,  // analytics rollups, slow-changing aggregates
} as const;

export function cacheGet<T>(key: string): T | null {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.data;
}

export function cacheSet<T>(key: string, data: T, ttlSeconds: number = CacheTTL.MEDIUM): void {
  store.set(key, { data, expiresAt: Date.now() + ttlSeconds * 1000 });
}

export function cacheDelete(key: string): boolean {
  return store.delete(key);
}

/** Delete every key matching a glob — only `*` is special (matches any run of non-empty chars). */
export function cacheDeletePattern(pattern: string): number {
  // Escape regex specials EXCEPT '*', then turn '*' into '.*'.
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  const re = new RegExp(`^${escaped}$`);
  let deleted = 0;
  for (const key of store.keys()) {
    if (re.test(key)) {
      store.delete(key);
      deleted++;
    }
  }
  return deleted;
}

export function cacheClear(): void {
  store.clear();
}

export function cacheSize(): number {
  return store.size;
}

/** Drop expired entries — called by the periodic interval below. Exported so tests can drive it. */
export function cacheCleanupExpired(): number {
  let removed = 0;
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now > entry.expiresAt) {
      store.delete(key);
      removed++;
    }
  }
  return removed;
}

// Periodic GC — every 5 min. `setInterval` in Deno returns a number, which we deliberately
// drop; the interval is intentionally pinned to the isolate lifetime.
if (typeof setInterval === 'function') {
  setInterval(cacheCleanupExpired, 5 * 60 * 1000);
}
