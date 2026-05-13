/**
 * `withCache` — the single-flight cache wrapper TripKing standardises on for every cached
 * read. Sits next to {@link ./withTiming.ts} and is the only public entry point most call
 * sites should touch (don't reach for the lower-level primitives directly unless you have a
 * specific reason).
 *
 * Behaviour:
 *   • `tier: 'memory'`  — uses the per-isolate in-memory cache only (fastest, cheapest).
 *   • `tier: 'shared'`  — checks memory, then `public.api_cache`, then runs the fetcher.
 *   • Single-flight by key — concurrent callers waiting on the same cold miss share one
 *     fetcher invocation (closes TournamentPro's stampede gap). Toggleable via
 *     `singleFlight: false` if a caller has a genuine reason (rare).
 *   • Returns `{ data, hit }` so the caller can stamp a response header
 *     (`X-Cache: memory|shared|miss`) and log into `api_metrics.cache_status` (Phase 4).
 *
 * Errors:
 *   • A fetcher throw is NOT cached. The throw propagates; nothing is stored.
 *   • Cache infrastructure errors are swallowed (the read still returns fresh data via the
 *     fetcher) — cache failures must never break the response path.
 */

import { cacheGet as memGet, cacheSet as memSet } from './cache.ts';
import {
  type CacheType,
  type SharedCacheSetOptions,
  sharedCacheGet,
  sharedCacheSet,
} from './sharedCache.ts';

export type CacheHit = 'memory' | 'shared' | 'miss';

export interface WithCacheOptions extends SharedCacheSetOptions {
  /** Cache key — semantic, versioned (e.g. `admin:car-types:v1`). See CACHE_BASELINE.md §3. */
  key: string;
  /** Time to live in seconds. */
  ttl: number;
  /** `memory` = per-isolate only; `shared` = memory + Postgres `api_cache`. */
  tier: 'memory' | 'shared';
  /** Required for `tier: 'shared'`; used as the row's `cache_type`. */
  cacheType?: CacheType;
  /** Dedupe concurrent fetches for the same key on this isolate. Default: true. */
  singleFlight?: boolean;
}

// In-flight promises keyed by cache-key. A Map (not WeakMap) — keys are strings.
const inflight = new Map<string, Promise<unknown>>();

export interface WithCacheResult<T> {
  data: T;
  hit: CacheHit;
}

export async function withCache<T>(
  opts: WithCacheOptions,
  fetcher: () => Promise<T>,
): Promise<WithCacheResult<T>> {
  const { key, ttl, tier, cacheType, singleFlight = true } = opts;
  if (tier === 'shared' && !cacheType) {
    throw new Error(`withCache: 'cacheType' is required when tier='shared' (key=${key})`);
  }

  // Tier 1 — in-memory (always checked).
  const mem = memGet<T>(key);
  if (mem !== null) return { data: mem, hit: 'memory' };

  // Tier 2 — shared (only if requested).
  if (tier === 'shared') {
    const shared = await sharedCacheGet<T>(key);
    if (shared !== null) return { data: shared, hit: 'shared' };
  }

  // Miss — fetch (single-flight by default).
  const run = async (): Promise<T> => {
    const fresh = await fetcher();
    if (tier === 'shared') {
      // sharedCacheSet writes both tiers; non-awaited DB part is OK but here we await to
      // ensure the next request on this isolate sees the value (matters for tests).
      await sharedCacheSet<T>(key, cacheType as CacheType, fresh, ttl, {
        entityKind: opts.entityKind,
        entityId: opts.entityId,
      });
    } else {
      memSet(key, fresh, ttl);
    }
    return fresh;
  };

  if (!singleFlight) {
    return { data: await run(), hit: 'miss' };
  }

  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) {
    // Coalesce — share the in-flight fetcher result.
    return { data: await existing, hit: 'miss' };
  }
  const promise = run().finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return { data: await promise, hit: 'miss' };
}

/** Attach the cache outcome as a response header — call from edge functions for observability. */
export function tagCacheHit(res: Response, hit: CacheHit): Response {
  try {
    res.headers.set('X-Cache', hit);
  } catch {
    /* immutable headers on some responses — ignore */
  }
  return res;
}

import { type CacheScope, setCacheControl, maybeNotModified } from './httpCache.ts';

/**
 * Tag X-Cache + Cache-Control + (conditionally) ETag on a 200 Response in one call.
 * On an If-None-Match match, returns 304 with the same Cache-Control + X-Cache.
 *
 * Pass `body` only if you want ETag-based revalidation (it must be the exact JSON the
 * Response carries). Omit for endpoints where 304 churn isn't worth the SHA-1 hash.
 */
export async function tagResponse(
  req: Request,
  res: Response,
  opts: { hit: CacheHit; ttl: number; scope: CacheScope; body?: string },
): Promise<Response> {
  tagCacheHit(res, opts.hit);
  setCacheControl(res, { ttl: opts.ttl, scope: opts.scope });
  if (opts.body !== undefined) {
    return await maybeNotModified(req, res, opts.body);
  }
  return res;
}
