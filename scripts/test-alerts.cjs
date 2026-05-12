#!/usr/bin/env node
/**
 * Smoke test for the /alerts edge function (owner-scoped saved searches).
 *   ALERTS_API_BASE=https://<ref>.supabase.co/functions/v1 node scripts/test-alerts.cjs
 * Skips cleanly (exit 0) if ALERTS_API_BASE is unset.
 *
 * Covers: every route needs auth (401), create (422 on missing from_city_id, 422 on bad notify_via),
 * GET list scoped to the caller, GET/:id owner-only (403 for others), PATCH (pause), DELETE, 404 after delete.
 */
const BASE = (process.env.ALERTS_API_BASE || (process.env.VITE_API_BASE_URL ? `${process.env.VITE_API_BASE_URL}/functions/v1` : '')).replace(/\/+$/, '');
if (!BASE) {
  console.log('[test-alerts] ALERTS_API_BASE not set — skipping.');
  process.exit(0);
}
const NONE = '00000000-0000-0000-0000-000000000000';
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log(`  ✓ ${name}`);
  else { failures++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}
async function j(method, path, { body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
}
async function tokenFor(role) {
  const phone = `+919900${Math.floor(100000 + Math.random() * 900000)}`;
  await j('POST', '/auth/auth/request-otp', { body: { phone } });
  const auth = await j('POST', '/auth/auth/verify-otp', { body: { phone, otp: '123456', display_name: `Smoke ${role}`, role } });
  return auth.json?.data?.access_token;
}

(async () => {
  console.log(`[test-alerts] base = ${BASE}`);

  const noAuthList = await j('GET', '/alerts');
  check('GET /alerts without auth → 401', noAuthList.status === 401, `status=${noAuthList.status}`);

  const token = await tokenFor('trip_manager');
  const token2 = await tokenFor('driver');
  check('auth tokens obtained', !!token && !!token2);
  if (!token || !token2) process.exit(1);

  const cities = await j('GET', '/admin/cities');
  const cityList = cities.json?.data || [];
  const cityId = cityList[0]?.id;
  const city2Id = cityList[1]?.id || cityId;
  check('have at least 1 city', !!cityId);
  if (!cityId) process.exit(1);

  const listEmpty = await j('GET', '/alerts', { token });
  check('GET /alerts (mine) → 200 + array', listEmpty.status === 200 && Array.isArray(listEmpty.json?.data), `status=${listEmpty.status}`);

  // ── create ─────────────────────────────────────────────────────────────
  const noAuthPost = await j('POST', '/alerts', { body: { from_city_id: cityId } });
  check('POST /alerts without auth → 401', noAuthPost.status === 401, `status=${noAuthPost.status}`);
  const noCity = await j('POST', '/alerts', { token, body: { name: 'No city' } });
  check('POST /alerts without from_city_id → 422', noCity.status === 422, `status=${noCity.status}`);
  const badChannel = await j('POST', '/alerts', { token, body: { from_city_id: cityId, notify_via: ['carrier-pigeon'] } });
  check('POST /alerts with a bad notify_via channel → 422', badChannel.status === 422, `status=${badChannel.status}`);

  const created = await j('POST', '/alerts', { token, body: { name: 'Smoke Alert', from_city_id: cityId, from_radius_km: 30, to_city_id: city2Id, min_rate_per_km: 12, notify_via: ['in_app', 'push'] } });
  const alertId = created.json?.data?.id;
  check('POST /alerts → 200 + id + user_id + joined from_city', created.status === 200 && !!alertId && !!created.json?.data?.user_id && created.json?.data?.from_city?.id === cityId, `status=${created.status} ${JSON.stringify(created.json?.error || '')}`);
  check('POST /alerts persists notify_via', Array.isArray(created.json?.data?.notify_via) && created.json.data.notify_via.includes('push'), `got=${JSON.stringify(created.json?.data?.notify_via)}`);
  if (!alertId) process.exit(1);

  // ── reads — owner-scoped ───────────────────────────────────────────────
  const get404 = await j('GET', `/alerts/${NONE}`, { token });
  check('GET /alerts/<nonexistent> → 404', get404.status === 404, `status=${get404.status}`);
  const noAuthGet = await j('GET', `/alerts/${alertId}`);
  check('GET /alerts/:id without auth → 401', noAuthGet.status === 401, `status=${noAuthGet.status}`);
  const gotOne = await j('GET', `/alerts/${alertId}`, { token });
  check('GET /alerts/:id (owner) → 200 + matching id', gotOne.status === 200 && gotOne.json?.data?.id === alertId, `status=${gotOne.status}`);
  const notOwnerGet = await j('GET', `/alerts/${alertId}`, { token: token2 });
  check('GET /alerts/:id by a non-owner → 403', notOwnerGet.status === 403, `status=${notOwnerGet.status}`);
  const mine = await j('GET', '/alerts', { token });
  check('GET /alerts (mine) → contains my alert', mine.status === 200 && (mine.json?.data || []).some((a) => a.id === alertId), `len=${mine.json?.data?.length}`);
  const notMine = await j('GET', '/alerts', { token: token2 });
  check('GET /alerts (other user) → does NOT contain my alert', notMine.status === 200 && !(notMine.json?.data || []).some((a) => a.id === alertId), `len=${notMine.json?.data?.length}`);

  // ── update (pause) ─────────────────────────────────────────────────────
  const notOwnerPatch = await j('PATCH', `/alerts/${alertId}`, { token: token2, body: { name: 'Hijack' } });
  check('PATCH /alerts/:id by a non-owner → 403', notOwnerPatch.status === 403, `status=${notOwnerPatch.status}`);
  const patched = await j('PATCH', `/alerts/${alertId}`, { token, body: { name: 'Renamed Alert', is_active: false, paused_at: new Date().toISOString() } });
  check('PATCH /alerts/:id (owner) → 200 + new name + paused', patched.status === 200 && patched.json?.data?.name === 'Renamed Alert' && patched.json?.data?.is_active === false, `status=${patched.status} ${JSON.stringify(patched.json?.error || '')}`);

  // ── delete ─────────────────────────────────────────────────────────────
  const notOwnerDel = await j('DELETE', `/alerts/${alertId}`, { token: token2 });
  check('DELETE /alerts/:id by a non-owner → 403', notOwnerDel.status === 403, `status=${notOwnerDel.status}`);
  const noAuthDel = await j('DELETE', `/alerts/${alertId}`);
  check('DELETE /alerts/:id without auth → 401', noAuthDel.status === 401, `status=${noAuthDel.status}`);
  const deleted = await j('DELETE', `/alerts/${alertId}`, { token });
  check('DELETE /alerts/:id (owner) → 200', deleted.status === 200 && deleted.json?.data?.deleted === alertId, `status=${deleted.status}`);
  const goneNow = await j('GET', `/alerts/${alertId}`, { token });
  check('GET /alerts/:id after delete → 404', goneNow.status === 404, `status=${goneNow.status}`);

  if (failures) { console.error(`[test-alerts] ${failures} check(s) failed`); process.exit(1); }
  console.log('[test-alerts] all checks passed');
})().catch((e) => { console.error('[test-alerts] error:', e); process.exit(1); });
