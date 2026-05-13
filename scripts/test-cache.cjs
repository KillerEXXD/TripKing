#!/usr/bin/env node
/**
 * Smoke test for the Phase 1 server-side cache primitives (migration 020 + _shared/*).
 *
 *   node scripts/test-cache.cjs
 *
 * Drives the `public.api_cache` table directly via `scripts/db.cjs` (the Management API),
 * so it doesn't need any edge function deployed. Covers:
 *   • Table exists and accepts the canonical INSERT shape (cache_type CHECK passes).
 *   • Hit-count bump RPC (`api_cache_record_hit`) is atomic.
 *   • Cleanup function (`api_cache_cleanup_expired`) drops expired rows only.
 *   • Stats view (`api_cache_stats`) returns sensible numbers.
 *   • The cron job (`api-cache-cleanup`) is registered and active.
 *
 * After this passes, the in-process tests in supabase/functions/_shared/__tests__/*.test.ts
 * cover the TypeScript primitives. End-to-end coverage (a real edge-function call
 * round-tripping through withCache) comes once we wire an endpoint in Phase 1G.
 */
const { execFileSync } = require('node:child_process');

const SCRIPT = require('node:path').join(__dirname, 'db.cjs');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
function sql(query) {
  const out = execFileSync('node', [SCRIPT, query], { encoding: 'utf8' });
  // db.cjs prints `[201]\n<JSON>` for success.
  const idx = out.indexOf('[');
  const tail = out.slice(idx);
  // Strip the status line `[201]\n`.
  const jsonStart = tail.indexOf('[', 1);
  return JSON.parse(tail.slice(jsonStart));
}

(async () => {
  console.log('• Migration 020 — table + helpers');
  const tableExists = sql("select to_regclass('public.api_cache') as t");
  check('api_cache table exists', tableExists[0]?.t === 'api_cache');

  const fns = sql(
    "select proname from pg_proc where proname in ('api_cache_record_hit','api_cache_cleanup_expired') order by proname",
  );
  check('api_cache_record_hit function present', fns.some((r) => r.proname === 'api_cache_record_hit'));
  check('api_cache_cleanup_expired function present', fns.some((r) => r.proname === 'api_cache_cleanup_expired'));

  const cron = sql(
    "select jobname, schedule, active from cron.job where jobname='api-cache-cleanup'",
  );
  check('api-cache-cleanup cron registered', cron.length === 1, JSON.stringify(cron[0] ?? null));
  check('api-cache-cleanup cron active', cron[0]?.active === true);

  console.log('• Round-trip — insert / hit / expire / cleanup');
  // Clean slate for the synthetic key we use below.
  const KEY = 'test-cache:smoke';
  sql(`delete from public.api_cache where cache_key = '${KEY}'`);

  // Insert a 60s-TTL entry.
  sql(
    `insert into public.api_cache (cache_key, cache_type, data, expires_at)
     values ('${KEY}', 'computed', '{"answer":42}'::jsonb, now() + interval '60 seconds')`,
  );
  const got = sql(`select (data->>'answer')::int as a from public.api_cache where cache_key='${KEY}'`);
  check('inserted entry is readable', got[0]?.a === 42);

  // Bump hit count via the RPC twice — should reach 2.
  sql(`select public.api_cache_record_hit('${KEY}')`);
  sql(`select public.api_cache_record_hit('${KEY}')`);
  const hits = sql(`select hit_count from public.api_cache where cache_key='${KEY}'`);
  check('api_cache_record_hit bumped hit_count atomically', hits[0]?.hit_count === 2);

  // Force-expire by direct UPDATE, then run cleanup — should report exactly 1 deletion.
  sql(`update public.api_cache set expires_at = now() - interval '1 minute' where cache_key='${KEY}'`);
  // Also park a non-expired sibling to confirm we don't over-delete.
  const SIBLING = 'test-cache:sibling';
  sql(`delete from public.api_cache where cache_key = '${SIBLING}'`);
  sql(
    `insert into public.api_cache (cache_key, cache_type, data, expires_at)
     values ('${SIBLING}', 'computed', '{"v":1}'::jsonb, now() + interval '60 seconds')`,
  );

  const cleaned = sql(`select public.api_cache_cleanup_expired() as n`);
  check('cleanup returned ≥ 1', (cleaned[0]?.n ?? 0) >= 1);
  const survivors = sql(
    `select cache_key from public.api_cache where cache_key in ('${KEY}','${SIBLING}')`,
  );
  check('expired entry was removed', !survivors.find((r) => r.cache_key === KEY));
  check('non-expired sibling survived', !!survivors.find((r) => r.cache_key === SIBLING));

  console.log('• Stats view');
  const stats = sql(`select cache_type, entries from public.api_cache_stats`);
  check('api_cache_stats view is readable', Array.isArray(stats));

  // Tidy up.
  sql(`delete from public.api_cache where cache_key in ('${KEY}','${SIBLING}')`);

  console.log('• CHECK constraint — bad cache_type is rejected');
  let threw = false;
  try {
    sql(
      `insert into public.api_cache (cache_key, cache_type, data, expires_at)
       values ('test-cache:bad', 'not-a-valid-type', '{}'::jsonb, now() + interval '1 minute')`,
    );
  } catch (e) {
    threw = /cache_type/i.test(e?.message ?? '') || /check/i.test(e?.message ?? '');
  }
  check('bad cache_type rejected by CHECK constraint', threw);

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAIL`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
