/**
 * Deno unit tests for the in-memory cache primitive.
 *   Run locally:  deno test --allow-read supabase/functions/_shared/__tests__/cache.test.ts
 * The frontend Vitest suite cannot import Deno-specific modules, so these stay separate.
 */

import {
  CacheTTL,
  cacheCleanupExpired,
  cacheClear,
  cacheDelete,
  cacheDeletePattern,
  cacheGet,
  cacheSet,
  cacheSize,
} from '../cache.ts';

function beforeEach() {
  cacheClear();
}

Deno.test('cacheSet + cacheGet — round-trips a value', () => {
  beforeEach();
  cacheSet('k', { hello: 'world' }, 10);
  const got = cacheGet<{ hello: string }>('k');
  if (!got || got.hello !== 'world') throw new Error('round-trip failed');
});

Deno.test('cacheGet — returns null on miss', () => {
  beforeEach();
  if (cacheGet('nope') !== null) throw new Error('expected null on miss');
});

Deno.test('cacheGet — returns null on expired entry and evicts it', () => {
  beforeEach();
  cacheSet('e', 1, -1); // expired one second ago
  if (cacheGet('e') !== null) throw new Error('expected null on expired');
  if (cacheSize() !== 0) throw new Error('expired entry should be evicted on read');
});

Deno.test('cacheDelete — returns true on hit and false on miss', () => {
  beforeEach();
  cacheSet('a', 1, 10);
  if (cacheDelete('a') !== true) throw new Error('delete should return true on hit');
  if (cacheDelete('a') !== false) throw new Error('delete should return false on miss');
});

Deno.test('cacheDeletePattern — wildcard matches; reports the count', () => {
  beforeEach();
  cacheSet('admin:car-types:v1', 1, 10);
  cacheSet('admin:cities:v1', 2, 10);
  cacheSet('driver:abc:public:v1', 3, 10);
  const n = cacheDeletePattern('admin:*');
  if (n !== 2) throw new Error(`expected 2 deletions, got ${n}`);
  if (cacheGet('driver:abc:public:v1') !== 3) throw new Error('unrelated key should survive');
});

Deno.test('cacheDeletePattern — escapes regex specials in the literal portion', () => {
  beforeEach();
  cacheSet('a.b.c', 1, 10);
  cacheSet('axbxc', 2, 10);
  // The dots in the pattern must match dots, not "any char" — otherwise both would match.
  const n = cacheDeletePattern('a.b.c');
  if (n !== 1) throw new Error(`expected exact match only, got ${n}`);
  if (cacheGet('axbxc') !== 2) throw new Error('axbxc should not have matched');
});

Deno.test('cacheCleanupExpired — drops only expired entries', () => {
  beforeEach();
  cacheSet('keep', 'alive', 60);
  cacheSet('drop1', 'x', -1);
  cacheSet('drop2', 'y', -1);
  const removed = cacheCleanupExpired();
  if (removed !== 2) throw new Error(`expected 2 removed, got ${removed}`);
  if (cacheGet('keep') !== 'alive') throw new Error('non-expired entry was dropped');
});

Deno.test('CacheTTL — exports the four standard tiers', () => {
  if (CacheTTL.SHORT !== 30) throw new Error('SHORT should be 30s');
  if (CacheTTL.MEDIUM !== 300) throw new Error('MEDIUM should be 300s');
  if (CacheTTL.LONG !== 900) throw new Error('LONG should be 900s');
  if (CacheTTL.VERY_LONG !== 3600) throw new Error('VERY_LONG should be 3600s');
});
