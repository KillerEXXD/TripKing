#!/usr/bin/env node
/**
 * Smoke test for the /analytics edge function (Phase 5).
 *   ANALYTICS_API_BASE=https://<ref>.supabase.co/functions/v1 node scripts/test-analytics.cjs
 * Skips cleanly (exit 0) if ANALYTICS_API_BASE is unset.
 *
 * Covers: every route needs auth (401); /admin is admin-only (403 for non-admin) and returns the
 * dashboard blob; /agent returns the caller's analytics (and ?user_id is admin-or-self);
 * /api-metrics is admin-only and returns the per-endpoint latency/error rollup.
 */
const BASE = (process.env.ANALYTICS_API_BASE || (process.env.VITE_API_BASE_URL ? `${process.env.VITE_API_BASE_URL}/functions/v1` : '')).replace(/\/+$/, '');
if (!BASE) {
  console.log('[test-analytics] ANALYTICS_API_BASE not set — skipping.');
  process.exit(0);
}
const NONE = '00000000-0000-0000-0000-000000000000';
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log(`  ✓ ${name}`);
  else { failures++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}
async function j(method, path, { token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method, headers });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
}
async function signIn(role) {
  const phone = `+919900${Math.floor(100000 + Math.random() * 900000)}`;
  await fetch(`${BASE}/auth/auth/request-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }) });
  const res = await fetch(`${BASE}/auth/auth/verify-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, otp: '123456', display_name: `Smoke ${role}`, role }) });
  const body = await res.json().catch(() => ({}));
  return { token: body?.data?.access_token, userId: body?.data?.user?.id };
}
const isNum = (v) => typeof v === 'number';

(async () => {
  console.log(`[test-analytics] base = ${BASE}`);

  const noAuthAdmin = await j('GET', '/analytics/admin');
  check('GET /analytics/admin without auth → 401', noAuthAdmin.status === 401, `status=${noAuthAdmin.status}`);
  const noAuthAgent = await j('GET', '/analytics/agent');
  check('GET /analytics/agent without auth → 401', noAuthAgent.status === 401, `status=${noAuthAgent.status}`);
  const bad = await j('GET', '/analytics/wat', { token: 'x' });
  check('GET /analytics/<unknown> without a valid token → 401', bad.status === 401, `status=${bad.status}`);

  const agent = await signIn('trip_manager');
  const admin = await signIn('admin');
  check('agent + admin tokens obtained', !!agent.token && !!agent.userId && !!admin.token);
  if (!agent.token || !admin.token) process.exit(1);

  // ── /analytics/admin ───────────────────────────────────────────────────
  const adminForbidden = await j('GET', '/analytics/admin', { token: agent.token });
  check('GET /analytics/admin by a non-admin → 403', adminForbidden.status === 403, `status=${adminForbidden.status}`);
  const dash = await j('GET', '/analytics/admin', { token: admin.token });
  const d = dash.json?.data || {};
  check('GET /analytics/admin (admin) → 200 + dashboard blob', dash.status === 200 && isNum(d.users_total) && isNum(d.trips_total) && d.trips_by_status && typeof d.trips_by_status === 'object' && Array.isArray(d.trips_monthly), `status=${dash.status} keys=${Object.keys(d).join(',')}`);
  check('GET /analytics/admin → trips_monthly has 6 entries', Array.isArray(d.trips_monthly) && d.trips_monthly.length === 6, `len=${d.trips_monthly?.length}`);

  // ── /analytics/agent ───────────────────────────────────────────────────
  const mine = await j('GET', '/analytics/agent', { token: agent.token });
  const a = mine.json?.data || {};
  check('GET /analytics/agent (own) → 200 + agent_user_id = caller + numeric stats', mine.status === 200 && a.agent_user_id === agent.userId && isNum(a.trips_posted) && a.trips_by_status && typeof a.trips_by_status === 'object', `status=${mine.status} ${JSON.stringify(a)}`);
  check('GET /analytics/agent → monthly has 6 entries', Array.isArray(a.monthly) && a.monthly.length === 6, `len=${a.monthly?.length}`);
  const otherForbidden = await j('GET', `/analytics/agent?user_id=${NONE}`, { token: agent.token });
  check('GET /analytics/agent?user_id=<other> by a non-admin → 403', otherForbidden.status === 403, `status=${otherForbidden.status}`);
  const asAdmin = await j('GET', `/analytics/agent?user_id=${agent.userId}`, { token: admin.token });
  check('GET /analytics/agent?user_id=<agent> by admin → 200 + matching agent_user_id', asAdmin.status === 200 && asAdmin.json?.data?.agent_user_id === agent.userId, `status=${asAdmin.status}`);
  const selfViaParam = await j('GET', `/analytics/agent?user_id=${agent.userId}`, { token: agent.token });
  check('GET /analytics/agent?user_id=<self> by self → 200', selfViaParam.status === 200, `status=${selfViaParam.status}`);

  // ── /analytics/driver ──────────────────────────────────────────────────
  const drvNoAuth = await j('GET', '/analytics/driver');
  check('GET /analytics/driver without auth → 401', drvNoAuth.status === 401, `status=${drvNoAuth.status}`);
  const drv = await j('GET', '/analytics/driver', { token: agent.token });
  const dr = drv.json?.data || {};
  check('GET /analytics/driver (own) → 200 + driver_user_id = caller + numeric stats', drv.status === 200 && dr.driver_user_id === agent.userId && isNum(dr.earnings_total) && isNum(dr.trips_completed) && typeof dr.has_driver_profile === 'boolean' && dr.trips_by_status && typeof dr.trips_by_status === 'object', `status=${drv.status} ${JSON.stringify(dr)}`);
  check('GET /analytics/driver → monthly has 6 {month, completed, earnings} entries', Array.isArray(dr.monthly) && dr.monthly.length === 6 && dr.monthly.every((p) => typeof p.month === 'string' && isNum(p.completed) && isNum(p.earnings)), `len=${dr.monthly?.length}`);
  const drvOtherForbidden = await j('GET', `/analytics/driver?user_id=${NONE}`, { token: agent.token });
  check('GET /analytics/driver?user_id=<other> by a non-admin → 403', drvOtherForbidden.status === 403, `status=${drvOtherForbidden.status}`);
  const drvAsAdmin = await j('GET', `/analytics/driver?user_id=${agent.userId}`, { token: admin.token });
  check('GET /analytics/driver?user_id=<u> by admin → 200 + matching driver_user_id', drvAsAdmin.status === 200 && drvAsAdmin.json?.data?.driver_user_id === agent.userId, `status=${drvAsAdmin.status}`);

  // ── /analytics/api-metrics ─────────────────────────────────────────────
  const metricsNoAuth = await j('GET', '/analytics/api-metrics');
  check('GET /analytics/api-metrics without auth → 401', metricsNoAuth.status === 401, `status=${metricsNoAuth.status}`);
  const metricsForbidden = await j('GET', '/analytics/api-metrics', { token: agent.token });
  check('GET /analytics/api-metrics by a non-admin → 403', metricsForbidden.status === 403, `status=${metricsForbidden.status}`);
  const metrics = await j('GET', '/analytics/api-metrics?hours=24', { token: admin.token });
  const mm = metrics.json?.data || {};
  check('GET /analytics/api-metrics (admin) → 200 + rollup blob', metrics.status === 200 && isNum(mm.total) && isNum(mm.errors) && Array.isArray(mm.endpoints) && typeof mm.since === 'string', `status=${metrics.status} keys=${Object.keys(mm).join(',')}`);
  check('GET /analytics/api-metrics → endpoint rows have count/avg_ms/p95_ms', mm.endpoints.length === 0 || (isNum(mm.endpoints[0].count) && isNum(mm.endpoints[0].avg_ms) && isNum(mm.endpoints[0].p95_ms) && typeof mm.endpoints[0].endpoint === 'string'), JSON.stringify(mm.endpoints?.[0]));
  check('GET /analytics/api-metrics → hours echoed (24)', mm.hours === 24, `hours=${mm.hours}`);

  if (failures) { console.error(`[test-analytics] ${failures} check(s) failed`); process.exit(1); }
  console.log('[test-analytics] all checks passed');
})().catch((e) => { console.error('[test-analytics] error:', e); process.exit(1); });
