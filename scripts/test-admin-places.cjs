#!/usr/bin/env node
/**
 * Smoke test for the /admin/places routes (curate the geocoded `places` table — Phase B follow-up).
 *   ADMIN_PLACES_API_BASE=https://<ref>.supabase.co/functions/v1 node scripts/test-admin-places.cjs
 * Skips cleanly (exit 0) if ADMIN_PLACES_API_BASE is unset.
 *
 * Covers: every route is admin-only (401 unauth, 403 for a non-admin); GET /admin/places + filters
 * (active=false, q=); PATCH /admin/places/:id (deactivate, set city_id, empty → 422, bad id → 404);
 * POST /admin/places/:id/merge { into } (self → 422, missing into → 422, bad ids → 404; happy path
 * repoints + deletes the loser); DELETE /admin/places/:id (unreferenced → 200, then 404).
 */
const BASE = (process.env.ADMIN_PLACES_API_BASE || (process.env.VITE_API_BASE_URL ? `${process.env.VITE_API_BASE_URL}/functions/v1` : '')).replace(/\/+$/, '');
if (!BASE) {
  console.log('[test-admin-places] ADMIN_PLACES_API_BASE not set — skipping.');
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
async function signIn(role) {
  const phone = `+919900${Math.floor(100000 + Math.random() * 900000)}`;
  await j('POST', '/auth/auth/request-otp', { body: { phone } });
  const r = await j('POST', '/auth/auth/verify-otp', { body: { phone, otp: '12345', display_name: `Smoke ${role}`, role } });
  return r.json?.data?.access_token;
}
const containsId = (res, id) => res.status === 200 && Array.isArray(res.json?.data) && res.json.data.some((p) => p.id === id);

(async () => {
  console.log(`[test-admin-places] base = ${BASE}`);
  const adminToken = await signIn('admin');
  const driverToken = await signIn('driver');
  check('admin + driver tokens obtained', !!adminToken && !!driverToken);
  if (!adminToken) process.exit(1);
  const cityId = ((await j('GET', '/admin/cities')).json?.data || [])[0]?.id;

  // ── auth gating ────────────────────────────────────────────────────────
  check('GET /admin/places without auth → 401', (await j('GET', '/admin/places')).status === 401);
  check('GET /admin/places by a non-admin → 403', (await j('GET', '/admin/places', { token: driverToken })).status === 403);
  const list0 = await j('GET', '/admin/places', { token: adminToken });
  check('GET /admin/places (admin) → 200 + array', list0.status === 200 && Array.isArray(list0.json?.data), `status=${list0.status}`);

  // ── create three throwaway places via the public find-or-create route ──
  const ppid = `adm-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const mk = async (suffix, name, lat, lng) => (await j('POST', '/places', { body: { provider: 'smoketest', providerPlaceId: `${ppid}-${suffix}`, name, lat, lng } })).json?.data?.id;
  const placeA = await mk('a', `AdmPlace Alpha ${ppid}`, 12.97, 77.59);
  const placeB = await mk('b', `AdmPlace Bravo ${ppid}`, 12.98, 77.60);
  const placeC = await mk('c', `AdmPlace Charlie ${ppid}`, 13.00, 77.62);
  check('POST /places → three throwaway places created', !!placeA && !!placeB && !!placeC, `a=${placeA} b=${placeB} c=${placeC}`);
  if (!placeA || !placeB || !placeC) process.exit(1);

  // ── PATCH /admin/places/:id ────────────────────────────────────────────
  check('PATCH /admin/places/:id without auth → 401', (await j('PATCH', `/admin/places/${placeA}`, { body: { is_active: false } })).status === 401);
  check('PATCH /admin/places/:id by a non-admin → 403', (await j('PATCH', `/admin/places/${placeA}`, { token: driverToken, body: { is_active: false } })).status === 403);
  const deact = await j('PATCH', `/admin/places/${placeA}`, { token: adminToken, body: { is_active: false } });
  check('PATCH /admin/places/:id { is_active: false } (admin) → 200 + is_active=false', deact.status === 200 && deact.json?.data?.is_active === false, `status=${deact.status} ${JSON.stringify(deact.json?.error || deact.json?.data?.is_active)}`);
  if (cityId) {
    const setCity = await j('PATCH', `/admin/places/${placeA}`, { token: adminToken, body: { city_id: cityId } });
    check('PATCH /admin/places/:id { city_id } (admin) → 200 + city_id set', setCity.status === 200 && setCity.json?.data?.city_id === cityId, `status=${setCity.status}`);
  }
  check('PATCH /admin/places/:id {} (nothing) → 422', (await j('PATCH', `/admin/places/${placeA}`, { token: adminToken, body: {} })).status === 422);
  check('PATCH /admin/places/<bad id> → 404', (await j('PATCH', `/admin/places/${NONE}`, { token: adminToken, body: { is_active: true } })).status === 404);

  // ── filters ────────────────────────────────────────────────────────────
  check('GET /admin/places?active=false → contains the deactivated place', containsId(await j('GET', '/admin/places?active=false', { token: adminToken }), placeA), 'placeA not in active=false list');
  check('GET /admin/places?q=<name fragment> → contains the place', containsId(await j('GET', `/admin/places?q=Alpha%20${ppid}`, { token: adminToken }), placeA), 'placeA not found by q=');

  // ── merge (dedupe) ─────────────────────────────────────────────────────
  check('POST /admin/places/:id/merge without auth → 401', (await j('POST', `/admin/places/${placeB}/merge`, { body: { into: placeA } })).status === 401);
  check('POST /admin/places/:id/merge by a non-admin → 403', (await j('POST', `/admin/places/${placeB}/merge`, { token: driverToken, body: { into: placeA } })).status === 403);
  check('POST /admin/places/:id/merge { into: <self> } → 422', (await j('POST', `/admin/places/${placeB}/merge`, { token: adminToken, body: { into: placeB } })).status === 422);
  check('POST /admin/places/:id/merge {} (no into) → 422', (await j('POST', `/admin/places/${placeB}/merge`, { token: adminToken, body: {} })).status === 422);
  check('POST /admin/places/<bad loser>/merge { into: placeA } → 404', (await j('POST', `/admin/places/${NONE}/merge`, { token: adminToken, body: { into: placeA } })).status === 404);
  const merge = await j('POST', `/admin/places/${placeB}/merge`, { token: adminToken, body: { into: placeA } });
  check('POST /admin/places/:id/merge (admin) → 200 + merged=loser, into=winner', merge.status === 200 && merge.json?.data?.merged === placeB && merge.json?.data?.into === placeA && typeof merge.json?.data?.fk_rows_repointed === 'number', `status=${merge.status} ${JSON.stringify(merge.json?.data || merge.json?.error)}`);
  check('after merge → the loser place is gone (PATCH it → 404)', (await j('PATCH', `/admin/places/${placeB}`, { token: adminToken, body: { is_active: true } })).status === 404);

  // ── delete ─────────────────────────────────────────────────────────────
  check('DELETE /admin/places/:id without auth → 401', (await j('DELETE', `/admin/places/${placeC}`)).status === 401);
  check('DELETE /admin/places/:id by a non-admin → 403', (await j('DELETE', `/admin/places/${placeC}`, { token: driverToken })).status === 403);
  const del = await j('DELETE', `/admin/places/${placeC}`, { token: adminToken });
  check('DELETE /admin/places/:id (admin, unreferenced) → 200 + deleted', del.status === 200 && del.json?.data?.deleted === placeC, `status=${del.status} ${JSON.stringify(del.json?.error || del.json?.data)}`);
  check('DELETE /admin/places/:id again → 404', (await j('DELETE', `/admin/places/${placeC}`, { token: adminToken })).status === 404);

  if (failures) { console.error(`[test-admin-places] ${failures} check(s) failed`); process.exit(1); }
  console.log('[test-admin-places] all checks passed');
})().catch((e) => { console.error('[test-admin-places] error:', e); process.exit(1); });
