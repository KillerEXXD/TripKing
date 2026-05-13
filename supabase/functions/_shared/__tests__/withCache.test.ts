/**
 * Deno unit tests for the withCache wrapper (memory tier only — the shared tier requires
 * a Supabase service client and is exercised end-to-end by scripts/test-cache.cjs).
 *
 *   Run locally:  deno test --allow-read supabase/functions/_shared/__tests__/withCache.test.ts
 */

import { cacheClear } from '../cache.ts';
import { withCache } from '../withCache.ts';

function beforeEach() {
  cacheClear();
}

Deno.test('memory miss → fetcher runs → next read is a memory hit', async () => {
  beforeEach();
  let calls = 0;
  const fetcher = () => Promise.resolve(++calls);

  const a = await withCache({ key: 'k1', ttl: 60, tier: 'memory' }, fetcher);
  if (a.hit !== 'miss') throw new Error(`first call should miss, got ${a.hit}`);
  if (a.data !== 1) throw new Error(`fetcher returned ${a.data}, expected 1`);

  const b = await withCache({ key: 'k1', ttl: 60, tier: 'memory' }, fetcher);
  if (b.hit !== 'memory') throw new Error(`second call should be memory hit, got ${b.hit}`);
  if (b.data !== 1) throw new Error('cached value should be reused');
  if (calls !== 1) throw new Error(`fetcher should run once, ran ${calls}`);
});

Deno.test('single-flight — concurrent misses share one fetcher run', async () => {
  beforeEach();
  let calls = 0;
  const fetcher = () =>
    new Promise<number>((resolve) => setTimeout(() => resolve(++calls), 20));

  const [a, b, c] = await Promise.all([
    withCache({ key: 'sf', ttl: 60, tier: 'memory' }, fetcher),
    withCache({ key: 'sf', ttl: 60, tier: 'memory' }, fetcher),
    withCache({ key: 'sf', ttl: 60, tier: 'memory' }, fetcher),
  ]);

  if (calls !== 1) throw new Error(`single-flight should collapse to 1 call, got ${calls}`);
  if (a.data !== 1 || b.data !== 1 || c.data !== 1) {
    throw new Error('all callers should see the same value');
  }
  // First in wins the 'miss' label; the others are also 'miss' (they shared the in-flight promise).
  // What matters is the call count, asserted above.
});

Deno.test('singleFlight=false — concurrent misses each run the fetcher', async () => {
  beforeEach();
  let calls = 0;
  const fetcher = () =>
    new Promise<number>((resolve) => setTimeout(() => resolve(++calls), 20));

  await Promise.all([
    withCache({ key: 'noflight', ttl: 60, tier: 'memory', singleFlight: false }, fetcher),
    withCache({ key: 'noflight', ttl: 60, tier: 'memory', singleFlight: false }, fetcher),
  ]);

  if (calls !== 2) throw new Error(`expected 2 fetcher runs without single-flight, got ${calls}`);
});

Deno.test('fetcher throw — error propagates and is NOT cached', async () => {
  beforeEach();
  let attempts = 0;
  const fetcher = () => {
    attempts++;
    if (attempts === 1) throw new Error('boom');
    return Promise.resolve('ok');
  };

  let threw = false;
  try {
    await withCache({ key: 'thrower', ttl: 60, tier: 'memory' }, fetcher);
  } catch (e) {
    threw = e instanceof Error && e.message === 'boom';
  }
  if (!threw) throw new Error('expected the error to propagate');

  // Next call should run the fetcher again (the throw must not have been cached).
  const second = await withCache({ key: 'thrower', ttl: 60, tier: 'memory' }, fetcher);
  if (second.data !== 'ok') throw new Error('second call should succeed');
  if (second.hit !== 'miss') throw new Error('second call should still be a miss');
  if (attempts !== 2) throw new Error(`fetcher should have run twice, ran ${attempts}`);
});

Deno.test("tier='shared' without cacheType — throws", async () => {
  beforeEach();
  let threw = false;
  try {
    await withCache({ key: 'x', ttl: 60, tier: 'shared' }, () => Promise.resolve(1));
  } catch (e) {
    threw = e instanceof Error && e.message.includes("'cacheType' is required");
  }
  if (!threw) throw new Error("expected a clear error when cacheType is missing on tier='shared'");
});
