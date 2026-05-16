#!/usr/bin/env node
/**
 * Smoke test for /cron-qase-poll. Verifies auth + that an invocation against the live
 * Qase API + DB returns a structured summary (without asserting specific counts — those
 * depend on what's in Qase at the moment).
 *
 *   CRON_QASE_POLL_API_BASE=https://<ref>.supabase.co/functions/v1 \
 *   CRON_QASE_KEY=<the function's CRON_QASE_KEY secret> \
 *   node scripts/test-cron-qase-poll.cjs
 *
 * Skips cleanly (exit 0) if either env is unset.
 *
 * Covers:
 *  - GET without X-Cron-Key → 401
 *  - GET with bad key → 401
 *  - GET with valid key → 200 + summary object with the expected keys + cron_state row touched
 */
const BASE = (process.env.CRON_QASE_POLL_API_BASE || process.env.WEBHOOK_QASE_API_BASE || (process.env.VITE_API_BASE_URL ? `${process.env.VITE_API_BASE_URL}/functions/v1` : '')).replace(/\/+$/, '');
const KEY = process.env.CRON_QASE_KEY || '';
if (!BASE) { console.log('[test-cron-qase-poll] CRON_QASE_POLL_API_BASE not set — skipping.'); process.exit(0); }
if (!KEY) { console.log('[test-cron-qase-poll] CRON_QASE_KEY not set — skipping.'); process.exit(0); }

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log(`  ✓ ${name}`);
  else { failures++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}
async function get(headers = {}) {
  const res = await fetch(`${BASE}/cron-qase-poll`, { method: 'GET', headers });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
}

(async () => {
  console.log(`[test-cron-qase-poll] base = ${BASE}`);

  check('GET without X-Cron-Key → 401', (await get()).status === 401);
  check('GET with bad X-Cron-Key → 401', (await get({ 'X-Cron-Key': 'nope' })).status === 401);

  const res = await get({ 'X-Cron-Key': KEY });
  const d = res.json?.data;
  check('GET with valid key → 200', res.status === 200, `status=${res.status} ${JSON.stringify(res.json?.error || '')}`);
  check('Response summary has keys { fetched, fresh, created, updated, resolved, failed, watermark_from, watermark_to, polled_at }',
    res.status === 200 && d && typeof d.fetched === 'number' && typeof d.fresh === 'number' && typeof d.created === 'number' && typeof d.updated === 'number' && typeof d.resolved === 'number' && typeof d.failed === 'number' && typeof d.watermark_from === 'number' && typeof d.watermark_to === 'number' && typeof d.polled_at === 'string',
    `data=${JSON.stringify(d)}`);
  check('Idempotent — second call returns 200 with fresh:0 (watermark advanced)',
    (await get({ 'X-Cron-Key': KEY })).json?.data?.fresh === 0,
    'expected fresh=0 on second call within seconds');

  if (failures) { console.error(`[test-cron-qase-poll] ${failures} check(s) failed`); process.exit(1); }
  console.log('[test-cron-qase-poll] all checks passed');
})().catch((e) => { console.error('[test-cron-qase-poll] error:', e); process.exit(1); });
