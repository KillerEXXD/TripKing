#!/usr/bin/env node
/**
 * Smoke test for the /vehicles edge function.
 *   VEHICLES_API_BASE=https://<ref>.supabase.co/functions/v1 node scripts/test-vehicles.cjs
 * Skips cleanly (exit 0) if VEHICLES_API_BASE is unset.
 *
 * Covers: public list (200 + array), 404, unauth POST (401), no-driver-profile POST (403),
 * create (+ derived eligibility_status), PATCH/DELETE owner/non-owner, and the admin
 * eligibility-dashboard filters (?eligibility=, ?needs_attention=true).
 */
const BASE = (process.env.VEHICLES_API_BASE || (process.env.VITE_API_BASE_URL ? `${process.env.VITE_API_BASE_URL}/functions/v1` : '')).replace(/\/+$/, '');
if (!BASE) {
  console.log('[test-vehicles] VEHICLES_API_BASE not set — skipping.');
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
  const auth = await j('POST', '/auth/auth/verify-otp', { body: { phone, otp: '123456', display_name: `Vehicle Smoke ${role}`, role } });
  return auth.json?.data?.access_token;
}
const hasVeh = (rows, vid) => Array.isArray(rows) && rows.some((v) => v && v.id === vid);

(async () => {
  console.log(`[test-vehicles] base = ${BASE}`);
  const token = await tokenFor('driver');
  const noDriverToken = await tokenFor('trip_manager'); // a user with no driver profile
  check('auth tokens obtained', !!token && !!noDriverToken);
  if (!token || !noDriverToken) process.exit(1);
  const carTypeId = ((await j('GET', '/admin/car-types')).json?.data || [])[0]?.id;
  check('have a car type', !!carTypeId);
  if (!carTypeId) process.exit(1);

  // ── public reads ───────────────────────────────────────────────────────
  const list = await j('GET', '/vehicles');
  check('GET /vehicles → 200 + array', list.status === 200 && Array.isArray(list.json?.data), `status=${list.status} ${JSON.stringify(list.json?.error || '')}`);
  const byNoDriver = await j('GET', `/vehicles?driver_id=${NONE}`);
  check('GET /vehicles?driver_id=<none> → 200 + empty array', byNoDriver.status === 200 && Array.isArray(byNoDriver.json?.data) && byNoDriver.json.data.length === 0, `len=${byNoDriver.json?.data?.length}`);
  const get404 = await j('GET', `/vehicles/${NONE}`);
  check('GET /vehicles/<nonexistent> → 404', get404.status === 404, `status=${get404.status}`);

  // ── writes need auth + a driver profile ────────────────────────────────
  const noAuth = await j('POST', '/vehicles', { body: { car_type_id: carTypeId, year: 2020 } });
  check('POST /vehicles without auth → 401', noAuth.status === 401, `status=${noAuth.status}`);
  const noDriver = await j('POST', '/vehicles', { token: noDriverToken, body: { car_type_id: carTypeId, year: 2020 } });
  check('POST /vehicles by a user with no driver profile → 403', noDriver.status === 403, `status=${noDriver.status}`);

  // ── bootstrap a driver, then add vehicles ──────────────────────────────
  const drv = await j('POST', '/drivers', { token, body: { full_name: 'Vehicle Smoke Driver' } });
  const driverId = drv.json?.data?.id;
  check('driver profile created', drv.status === 200 && !!driverId, `status=${drv.status} ${JSON.stringify(drv.json?.error || '')}`);
  if (!driverId) process.exit(1);

  const newCar = await j('POST', '/vehicles', { token, body: { car_type_id: carTypeId, year: 2024, registration_number: 'TN-NEW-0001' } });
  const newId = newCar.json?.data?.id;
  check('POST /vehicles (recent year) → 200 + eligibility_status eligible', newCar.status === 200 && !!newId && newCar.json?.data?.eligibility_status === 'eligible', `status=${newCar.status} elig=${newCar.json?.data?.eligibility_status}`);
  const oldCar = await j('POST', '/vehicles', { token, body: { car_type_id: carTypeId, year: 2008, registration_number: 'TN-OLD-0001' } });
  const oldId = oldCar.json?.data?.id;
  check('POST /vehicles (old year) → 200 + eligibility_status expired', oldCar.status === 200 && !!oldId && oldCar.json?.data?.eligibility_status === 'expired', `status=${oldCar.status} elig=${oldCar.json?.data?.eligibility_status}`);
  if (!newId || !oldId) process.exit(1);

  // ── reads + owner writes ───────────────────────────────────────────────
  const gotOne = await j('GET', `/vehicles/${newId}`);
  check('GET /vehicles/:id → 200 + matching id', gotOne.status === 200 && gotOne.json?.data?.id === newId, `status=${gotOne.status}`);
  const byDriver = await j('GET', `/vehicles?driver_id=${driverId}`);
  check('GET /vehicles?driver_id= → 2 vehicles', byDriver.status === 200 && (byDriver.json?.data || []).filter((v) => v.driver_id === driverId).length === 2, `len=${byDriver.json?.data?.length}`);
  const patchNotOwner = await j('PATCH', `/vehicles/${newId}`, { token: noDriverToken, body: { seats: 7 } });
  check('PATCH /vehicles/:id by a non-owner → 403', patchNotOwner.status === 403, `status=${patchNotOwner.status}`);
  const patched = await j('PATCH', `/vehicles/${newId}`, { token, body: { seats: 7, ac: false } });
  check('PATCH /vehicles/:id (owner) → 200 + updated', patched.status === 200 && patched.json?.data?.seats === 7 && patched.json?.data?.ac === false, `status=${patched.status} ${JSON.stringify(patched.json?.error || '')}`);
  const setInactive = await j('PATCH', `/vehicles/${newId}`, { token, body: { is_active: false } });
  check('PATCH /vehicles/:id { is_active:false } → 200', setInactive.status === 200 && setInactive.json?.data?.is_active === false, `status=${setInactive.status}`);
  const listExcludesInactive = await j('GET', `/vehicles?driver_id=${driverId}`);
  check('GET /vehicles?driver_id= excludes inactive by default', !hasVeh(listExcludesInactive.json?.data, newId), `data=${JSON.stringify((listExcludesInactive.json?.data || []).map((v) => v.id))}`);
  const listInclInactive = await j('GET', `/vehicles?driver_id=${driverId}&include_inactive=true`);
  check('GET /vehicles?include_inactive=true → includes the inactive one', hasVeh(listInclInactive.json?.data, newId), `len=${listInclInactive.json?.data?.length}`);
  await j('PATCH', `/vehicles/${newId}`, { token, body: { is_active: true } }); // reactivate so it shows in the eligibility filters

  // ── admin eligibility-dashboard filters ────────────────────────────────
  const expired = await j('GET', '/vehicles?eligibility=expired');
  check('GET /vehicles?eligibility=expired → contains the old vehicle, not the new', expired.status === 200 && hasVeh(expired.json?.data, oldId) && !hasVeh(expired.json?.data, newId) && (expired.json?.data || []).every((v) => v.eligibility_status === 'expired'), `data=${JSON.stringify((expired.json?.data || []).map((v) => [v.id, v.eligibility_status]))}`);
  const needsAttn = await j('GET', '/vehicles?needs_attention=true');
  check('GET /vehicles?needs_attention=true → contains the old vehicle, not the (eligible) new one', needsAttn.status === 200 && hasVeh(needsAttn.json?.data, oldId) && !hasVeh(needsAttn.json?.data, newId) && (needsAttn.json?.data || []).every((v) => v.eligibility_status !== 'eligible'), `data=${JSON.stringify((needsAttn.json?.data || []).map((v) => [v.id, v.eligibility_status]))}`);

  // ── delete ─────────────────────────────────────────────────────────────
  const delNotOwner = await j('DELETE', `/vehicles/${oldId}`, { token: noDriverToken });
  check('DELETE /vehicles/:id by a non-owner → 403', delNotOwner.status === 403, `status=${delNotOwner.status}`);
  const del = await j('DELETE', `/vehicles/${oldId}`, { token });
  check('DELETE /vehicles/:id (owner) → 200', del.status === 200 && del.json?.data?.deleted === oldId, `status=${del.status}`);
  const goneNow = await j('GET', `/vehicles/${oldId}`);
  check('GET /vehicles/:id after delete → 404', goneNow.status === 404, `status=${goneNow.status}`);

  if (failures) { console.error(`[test-vehicles] ${failures} check(s) failed`); process.exit(1); }
  console.log('[test-vehicles] all checks passed');
})().catch((e) => { console.error('[test-vehicles] error:', e); process.exit(1); });
