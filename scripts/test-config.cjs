#!/usr/bin/env node
/**
 * Smoke test for the public /config endpoint (platform dispatch config; no auth).
 *   CONFIG_API_BASE=https://<ref>.supabase.co/functions/v1 node scripts/test-config.cjs
 * (also reads VITE_API_BASE_URL + '/functions/v1'). Skips cleanly if unset.
 */
const BASE = (process.env.CONFIG_API_BASE || (process.env.VITE_API_BASE_URL ? `${process.env.VITE_API_BASE_URL}/functions/v1` : '')).replace(/\/+$/, '');
if (!BASE) {
  console.log('[test-config] CONFIG_API_BASE not set — skipping.');
  process.exit(0);
}
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log(`  ✓ ${name}`);
  else { failures++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}

(async () => {
  console.log(`[test-config] base = ${BASE}`);
  const res = await fetch(`${BASE}/config`);
  const json = await res.json().catch(() => ({}));
  const d = json?.data || {};
  check('GET /config → 200', res.status === 200, `status=${res.status}`);
  check('returns a valid dispatch_algorithm', d.dispatch_algorithm === 'auto' || d.dispatch_algorithm === 'manual', `got ${JSON.stringify(d.dispatch_algorithm)}`);
  check('returns numeric timings', typeof d.dispatch_offer_seconds === 'number' && typeof d.dispatch_offline_grace_seconds === 'number' && typeof d.dispatch_heartbeat_stale_seconds === 'number');
  check('does NOT leak commercial settings', !('default_commission_pct' in d) && !('default_driver_bata' in d));
  const post = await fetch(`${BASE}/config`, { method: 'POST' });
  check('POST /config → 405', post.status === 405, `status=${post.status}`);

  console.log(failures === 0 ? '\n[test-config] ✅ all passed' : `\n[test-config] ❌ ${failures} failed`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
