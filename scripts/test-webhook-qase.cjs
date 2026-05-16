#!/usr/bin/env node
/**
 * Smoke test for /webhook-qase. POSTs a fake Qase defect.created payload (HMAC-signed
 * with QASE_WEBHOOK_SECRET) and asserts a `bug_reports` row was created.
 *
 *   WEBHOOK_QASE_API_BASE=https://<ref>.supabase.co/functions/v1 \
 *   QASE_WEBHOOK_SECRET=<same-secret-set-on-the-function> \
 *   node scripts/test-webhook-qase.cjs
 *
 * Skips cleanly (exit 0) if WEBHOOK_QASE_API_BASE is unset.
 *
 * Covers:
 *  - GET /health returns 200 (Qase "test webhook" button hits this)
 *  - POST without signature → 401
 *  - POST with bad signature → 401
 *  - POST defect.created with valid signature → 200 + bug created
 *  - POST same defect.created again (re-delivery) → 200 + idempotent update (no duplicate)
 *  - POST defect.resolved → bug row flips to status=resolved
 *  - Unhandled event type → 200 with `ignored: true`
 */
const crypto = require('crypto');

const BASE = (process.env.WEBHOOK_QASE_API_BASE || (process.env.VITE_API_BASE_URL ? `${process.env.VITE_API_BASE_URL}/functions/v1` : '')).replace(/\/+$/, '');
const SECRET = process.env.QASE_WEBHOOK_SECRET || '';
if (!BASE) { console.log('[test-webhook-qase] WEBHOOK_QASE_API_BASE not set — skipping.'); process.exit(0); }
if (!SECRET) { console.log('[test-webhook-qase] QASE_WEBHOOK_SECRET not set — skipping.'); process.exit(0); }

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log(`  ✓ ${name}`);
  else { failures++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}
function sign(body) { return crypto.createHmac('sha256', SECRET).update(body).digest('hex'); }
async function post(body, sigOverride) {
  const headers = { 'Content-Type': 'application/json', 'X-Qase-Signature': sigOverride ?? sign(body) };
  const res = await fetch(`${BASE}/webhook-qase`, { method: 'POST', headers, body });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
}
async function postUnsigned(body) {
  const res = await fetch(`${BASE}/webhook-qase`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  return { status: res.status };
}

(async () => {
  console.log(`[test-webhook-qase] base = ${BASE}`);

  // Health (no signature required).
  const health = await fetch(`${BASE}/webhook-qase/health`);
  check('GET /webhook-qase/health → 200', health.status === 200, `status=${health.status}`);

  const defectId = `smoke-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  // Unauthorized variants.
  const body = JSON.stringify({
    event: 'defect.created',
    data: { id: defectId, title: `Smoke defect ${defectId}`, severity: 'major', status: 'open', url: `https://app.qase.io/defect/${defectId}`, automation_id: 'R6.3', case_id: 999, run_id: 42, actual_result: 'expect(locator).toBeVisible() failed', attachments: [{ url: 'https://example.com/trace.zip', filename: 'trace.zip', mime: 'application/zip', size: 12345 }] },
  });
  check('POST without signature → 401', (await postUnsigned(body)).status === 401);
  check('POST with bad signature → 401', (await post(body, 'deadbeef'.repeat(8))).status === 401);

  // Valid defect.created.
  const created = await post(body);
  const bugId = created.json?.data?.bug_id;
  const bugNumber = created.json?.data?.bug_number;
  check('POST valid defect.created → 200 + created:true + bug_id + bug_number',
    created.status === 200 && created.json?.data?.created === true && !!bugId && !!bugNumber,
    `status=${created.status} ${JSON.stringify(created.json?.data || created.json?.error || '')}`);

  // Idempotent re-delivery: same defect.id → no duplicate row, status=200 with updated:true.
  const reDeliver = await post(body);
  check('POST same defect.created again → 200 + updated:true (idempotent)',
    reDeliver.status === 200 && reDeliver.json?.data?.updated === true && reDeliver.json?.data?.bug_id === bugId,
    `status=${reDeliver.status} ${JSON.stringify(reDeliver.json?.data || '')}`);

  // defect.resolved → flips status to resolved.
  const resolveBody = JSON.stringify({ event: 'defect.resolved', data: { id: defectId } });
  const resolved = await post(resolveBody);
  check('POST defect.resolved → 200 + resolved:true on existing bug',
    resolved.status === 200 && resolved.json?.data?.resolved === true && resolved.json?.data?.bug_id === bugId,
    `${JSON.stringify(resolved.json?.data || '')}`);

  // Re-resolving is a no-op.
  const resolveAgain = await post(resolveBody);
  check('POST defect.resolved again → 200 with already:resolved',
    resolveAgain.status === 200 && (resolveAgain.json?.data?.already === 'resolved' || resolveAgain.json?.data?.resolved === true),
    `${JSON.stringify(resolveAgain.json?.data || '')}`);

  // Unhandled event type ignored.
  const ignoreBody = JSON.stringify({ event: 'case.created', data: { id: 'x' } });
  const ignored = await post(ignoreBody);
  check('POST unhandled event → 200 + ignored:true', ignored.status === 200 && ignored.json?.data?.ignored === true);

  if (failures) { console.error(`[test-webhook-qase] ${failures} check(s) failed`); process.exit(1); }
  console.log('[test-webhook-qase] all checks passed');
})().catch((e) => { console.error('[test-webhook-qase] error:', e); process.exit(1); });
