/**
 * Two-tier shared cache (Tier 4 of the caching strategy — see docs/CACHE_BASELINE.md).
 *
 * Flow:
 *   1. `sharedCacheGet(key)` checks in-memory ({@link ./cache.ts}); if hit → return.
 *   2. Otherwise queries `public.api_cache`; if hit → backfill memory + return.
 *   3. On miss the caller fetches the truth and calls `sharedCacheSet(key, …)`.
 *
 * The wrapper that hides this loop (and adds single-flight stampede protection) is
 * {@link ./withCache.ts}. Most call sites should use `withCache`, not these primitives
 * directly.
 *
 * Differences from the TournamentPro reference:
 *   • Single `entity_kind` + `entity_id` pair for polymorphic invalidation (vs per-FK columns).
 *   • Atomic `hit_count` bump via the `api_cache_record_hit` SQL function (migration 020).
 *   • All errors are swallowed; cache failures must never break the response path.
 */

import { serviceClient } from './supabase.ts';
import { cacheGet as memGet, cacheSet as memSet } from './cache.ts';

export type CacheType = 'admin' | 'profile' | 'live' | 'private' | 'analytics' | 'computed';

export interface SharedCacheSetOptions {
  /** Bulk-invalidation grouping — e.g. `('driver', driverId)`, `('admin', 'car-types')`. */
  entityKind?: string;
  entityId?: string;
}

interface ApiCacheRow {
  data: unknown;
  expires_at: string;
}

/** Memory-then-DB get. Returns null on miss/expired/error. */
export async function sharedCacheGet<T>(key: string): Promise<T | null> {
  const mem = memGet<T>(key);
  if (mem !== null) return mem;

  try {
    const db = serviceClient();
    const { data, error } = await db
      .from('api_cache')
      .select('data, expires_at')
      .eq('cache_key', key)
      .maybeSingle<ApiCacheRow>();

    if (error || !data) return null;

    const ttlMs = new Date(data.expires_at).getTime() - Date.now();
    if (ttlMs <= 0) {
      // Lazy purge — let the cron handle it, but don't return stale.
      return null;
    }

    // Atomic hit-count bump — fire and forget.
    db.rpc('api_cache_record_hit', { p_key: key }).then(() => {}, () => {});

    // Backfill the in-memory tier for subsequent reads on this isolate.
    memSet(key, data.data, Math.floor(ttlMs / 1000));
    return data.data as T;
  } catch {
    return null;
  }
}

/** Write to both tiers. Errors on the DB tier are swallowed (memory tier is fire-and-forget by nature). */
export async function sharedCacheSet<T>(
  key: string,
  cacheType: CacheType,
  data: T,
  ttlSeconds: number,
  opts: SharedCacheSetOptions = {},
): Promise<void> {
  memSet(key, data, ttlSeconds);
  try {
    const db = serviceClient();
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    await db.from('api_cache').upsert(
      {
        cache_key: key,
        cache_type: cacheType,
        data: data as unknown as Record<string, unknown>,
        entity_kind: opts.entityKind ?? null,
        entity_id: opts.entityId ?? null,
        expires_at: expiresAt,
        hit_count: 0,
        last_hit_at: null,
      },
      { onConflict: 'cache_key' },
    );
  } catch {
    /* swallow — cache failures must never break a response */
  }
}

export async function sharedCacheDelete(key: string): Promise<void> {
  try {
    const db = serviceClient();
    await db.from('api_cache').delete().eq('cache_key', key);
  } catch {
    /* swallow */
  }
}

/** Bulk invalidation by entity (the polymorphic `(kind, id)` index makes this O(log n)). */
export async function sharedCacheInvalidateEntity(entityKind: string, entityId: string): Promise<number> {
  try {
    const db = serviceClient();
    const { data } = await db
      .from('api_cache')
      .delete()
      .eq('entity_kind', entityKind)
      .eq('entity_id', entityId)
      .select('cache_key');
    return data?.length ?? 0;
  } catch {
    return 0;
  }
}

/** Bulk invalidation by cache type — e.g. "drop every `admin:*` entry after a reference-data edit". */
export async function sharedCacheInvalidateType(cacheType: CacheType): Promise<number> {
  try {
    const db = serviceClient();
    const { data } = await db
      .from('api_cache')
      .delete()
      .eq('cache_type', cacheType)
      .select('cache_key');
    return data?.length ?? 0;
  } catch {
    return 0;
  }
}
