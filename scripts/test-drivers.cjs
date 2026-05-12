#!/usr/bin/env node
/**
 * Smoke test for the /drivers + /agents edge functions.
 *   DRIVERS_API_BASE=https://<ref>.supabase.co/functions/v1 node scripts/test-drivers.cjs
 * Skips cleanly (exit 0) if DRIVERS_API_BASE is unset.
 *
 * Covers: public list (200 + array), 404, unauth write (401), non-owner write (403),
 * "create my profile" happy path + idempotency, GET/PATCH/PATCH-location, agent twin.
 */
const BASE = (process.env.DRIVERS_API_BASE || (process.env.VITE_API_BASE_URL ? `${process.env.VITE_API_BASE_URL}/functions/v1` : '')).replace(/\/+$/, '');
if (!BASE) {
  console.log('[test-drivers] DRIVERS_API_BASE not set — skipping.');
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
  console.log(`[test-drivers] base = ${BASE}`);

  // tokens: a driver and a second (agent) user
  const token = await tokenFor('driver');
  check('driver auth token obtained', !!token);
  const token2 = await tokenFor('trip_manager');
  check('agent auth token obtained', !!token2);
  if (!token || !token2) { process.exit(1); }

  const cities = await j('GET', '/admin/cities');
  const cityId = (cities.json?.data || [])[0]?.id;
  const city2Id = (cities.json?.data || [])[1]?.id || cityId;

  // ── public reads ───────────────────────────────────────────────────────
  const list = await j('GET', '/drivers');
  check('GET /drivers → 200 + array', list.status === 200 && Array.isArray(list.json?.data), `status=${list.status} ${JSON.stringify(list.json?.error || '')}`);
  const list404 = await j('GET', `/drivers/${NONE}`);
  check('GET /drivers/<nonexistent> → 404', list404.status === 404, `status=${list404.status}`);

  // ── writes need auth ───────────────────────────────────────────────────
  const noAuthPost = await j('POST', '/drivers', { body: { full_name: 'Nope' } });
  check('POST /drivers without auth → 401', noAuthPost.status === 401, `status=${noAuthPost.status}`);

  // ── create my driver profile (idempotent) ──────────────────────────────
  const created = await j('POST', '/drivers', { token, body: { full_name: 'Smoke Driver', home_city_id: cityId } });
  const driverId = created.json?.data?.id;
  check('POST /drivers (create my profile) → 200 + id + user_id', created.status === 200 && !!driverId && !!created.json?.data?.user_id, `status=${created.status} ${JSON.stringify(created.json?.error || '')}`);
  check('POST /drivers sets full_name', created.json?.data?.full_name === 'Smoke Driver', `got=${created.json?.data?.full_name}`);
  if (!driverId) { console.error('[test-drivers] cannot continue without a driver id'); process.exit(1); }
  const recreated = await j('POST', '/drivers', { token, body: { full_name: 'Ignored Rename' } });
  check('POST /drivers again → 200 + same id (idempotent)', recreated.status === 200 && recreated.json?.data?.id === driverId, `status=${recreated.status} id=${recreated.json?.data?.id}`);

  // ── reads + owner writes ───────────────────────────────────────────────
  const gotOne = await j('GET', `/drivers/${driverId}`);
  check('GET /drivers/:id → 200 + matching id', gotOne.status === 200 && gotOne.json?.data?.id === driverId, `status=${gotOne.status}`);

  const noAuthPatch = await j('PATCH', `/drivers/${driverId}`, { body: { full_name: 'Hijack' } });
  check('PATCH /drivers/:id without auth → 401', noAuthPatch.status === 401, `status=${noAuthPatch.status}`);

  const notOwnerPatch = await j('PATCH', `/drivers/${driverId}`, { token: token2, body: { full_name: 'Hijack' } });
  check('PATCH /drivers/:id by a non-owner → 403', notOwnerPatch.status === 403, `status=${notOwnerPatch.status}`);

  const patched = await j('PATCH', `/drivers/${driverId}`, { token, body: { full_name: 'Renamed Driver', current_city_id: city2Id } });
  check('PATCH /drivers/:id (owner) → 200 + new name', patched.status === 200 && patched.json?.data?.full_name === 'Renamed Driver', `status=${patched.status} ${JSON.stringify(patched.json?.error || '')}`);

  const located = await j('PATCH', `/drivers/${driverId}/location`, { token, body: { current_city_id: cityId, current_lat: 12.916, current_lng: 79.132 } });
  check('PATCH /drivers/:id/location (owner) → 200', located.status === 200, `status=${located.status} ${JSON.stringify(located.json?.error || '')}`);
  const locatedNotOwner = await j('PATCH', `/drivers/${driverId}/location`, { token: token2, body: { current_city_id: cityId } });
  check('PATCH /drivers/:id/location by a non-owner → 403', locatedNotOwner.status === 403, `status=${locatedNotOwner.status}`);

  // ── agents twin ────────────────────────────────────────────────────────
  const agentsList = await j('GET', '/agents');
  check('GET /agents → 200 + array', agentsList.status === 200 && Array.isArray(agentsList.json?.data), `status=${agentsList.status}`);
  const agent404 = await j('GET', `/agents/${NONE}`);
  check('GET /agents/<nonexistent> → 404', agent404.status === 404, `status=${agent404.status}`);

  const agentCreated = await j('POST', '/agents', { token: token2, body: { full_name: 'Smoke Agent', business_name: 'Smoke Travels', business_city_id: cityId } });
  const agentId = agentCreated.json?.data?.id;
  check('POST /agents (create my profile) → 200 + id + user_id', agentCreated.status === 200 && !!agentId && !!agentCreated.json?.data?.user_id, `status=${agentCreated.status} ${JSON.stringify(agentCreated.json?.error || '')}`);
  if (agentId) {
    const agentRecreated = await j('POST', '/agents', { token: token2, body: {} });
    check('POST /agents again → 200 + same id (idempotent)', agentRecreated.status === 200 && agentRecreated.json?.data?.id === agentId, `status=${agentRecreated.status}`);
    const agentPatched = await j('PATCH', `/agents/${agentId}`, { token: token2, body: { business_name: 'Renamed Travels' } });
    check('PATCH /agents/:id (owner) → 200 + new business_name', agentPatched.status === 200 && agentPatched.json?.data?.business_name === 'Renamed Travels', `status=${agentPatched.status}`);
    const agentPatchNoAuth = await j('PATCH', `/agents/${agentId}`, { body: { business_name: 'Hijack' } });
    check('PATCH /agents/:id without auth → 401', agentPatchNoAuth.status === 401, `status=${agentPatchNoAuth.status}`);
    const agentPatchNotOwner = await j('PATCH', `/agents/${agentId}`, { token, body: { business_name: 'Hijack' } });
    check('PATCH /agents/:id by a non-owner → 403', agentPatchNotOwner.status === 403, `status=${agentPatchNotOwner.status}`);
  }

  // create-my-agent via POST /drivers { role: 'trip_manager' } — the onboarding convenience path
  const viaDriversRoute = await j('POST', '/drivers', { token, body: { role: 'trip_manager', full_name: 'Driver Turned Agent', business_name: 'Crossover Cabs' } });
  check('POST /drivers { role: trip_manager } → 200 + agent id + user_id', viaDriversRoute.status === 200 && !!viaDriversRoute.json?.data?.id && !!viaDriversRoute.json?.data?.user_id, `status=${viaDriversRoute.status} ${JSON.stringify(viaDriversRoute.json?.error || '')}`);

  // ── admin KYC workflow ─────────────────────────────────────────────────
  const adminToken = await tokenFor('admin');
  check('admin auth token obtained', !!adminToken);
  const kycNoAuth = await j('PATCH', `/drivers/${driverId}/kyc`, { body: { kyc_status: 'docs_submitted' } });
  check('PATCH /drivers/:id/kyc without auth → 401', kycNoAuth.status === 401, `status=${kycNoAuth.status}`);
  const kycNotAdmin = await j('PATCH', `/drivers/${driverId}/kyc`, { token, body: { kyc_status: 'docs_submitted' } });
  check('PATCH /drivers/:id/kyc by a non-admin → 403', kycNotAdmin.status === 403, `status=${kycNotAdmin.status}`);
  if (adminToken) {
    const kycBad = await j('PATCH', `/drivers/${driverId}/kyc`, { token: adminToken, body: { kyc_status: 'unicorn' } });
    check('PATCH /drivers/:id/kyc with a bad status → 422', kycBad.status === 422, `status=${kycBad.status}`);
    const kycOk = await j('PATCH', `/drivers/${driverId}/kyc`, { token: adminToken, body: { kyc_status: 'docs_submitted', note: 'smoke' } });
    check('PATCH /drivers/:id/kyc (admin) → 200 + kyc_status updated', kycOk.status === 200 && kycOk.json?.data?.kyc_status === 'docs_submitted', `status=${kycOk.status} ${JSON.stringify(kycOk.json?.error || '')}`);
    const queue = await j('GET', '/drivers?kyc_status=docs_submitted,video_pending');
    check('GET /drivers?kyc_status=<csv> → contains the driver', queue.status === 200 && (queue.json?.data || []).some((d) => d.id === driverId), `len=${queue.json?.data?.length}`);
    const agentKyc = await j('PATCH', `/agents/${agentId}/kyc`, { token: adminToken, body: { kyc_status: 'approved' } });
    check('PATCH /agents/:id/kyc (admin) → 200 + kyc_status updated', agentKyc.status === 200 && agentKyc.json?.data?.kyc_status === 'approved', `status=${agentKyc.status} ${JSON.stringify(agentKyc.json?.error || '')}`);
  }

  // ── "my profile" lookups ───────────────────────────────────────────────
  const meNoAuth = await j('GET', '/drivers/me');
  check('GET /drivers/me without auth → 401', meNoAuth.status === 401, `status=${meNoAuth.status}`);
  const meNoProfile = await j('GET', '/drivers/me', { token: adminToken });
  check('GET /drivers/me for a user with no driver profile → 404', meNoProfile.status === 404, `status=${meNoProfile.status}`);
  const me = await j('GET', '/drivers/me', { token });
  check('GET /drivers/me → 200 + the caller’s driver profile', me.status === 200 && me.json?.data?.id === driverId && !!me.json?.data?.user_id, `status=${me.status} ${JSON.stringify(me.json?.error || me.json?.data || '')}`);
  const agentMeNoProfile = await j('GET', '/agents/me', { token: adminToken });
  check('GET /agents/me for a user with no agent profile → 404', agentMeNoProfile.status === 404, `status=${agentMeNoProfile.status}`);
  const agentMe = await j('GET', '/agents/me', { token: token2 });
  check('GET /agents/me → 200 + the caller’s agent profile', agentMe.status === 200 && agentMe.json?.data?.id === agentId, `status=${agentMe.status} ${JSON.stringify(agentMe.json?.error || '')}`);

  if (failures) { console.error(`[test-drivers] ${failures} check(s) failed`); process.exit(1); }
  console.log('[test-drivers] all checks passed');
})().catch((e) => { console.error('[test-drivers] error:', e); process.exit(1); });
