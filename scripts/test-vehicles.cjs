#!/usr/bin/env node
/**
 * Smoke test for the /vehicles edge function.
 *   VEHICLES_API_BASE=https://<ref>.supabase.co/functions/v1 node scripts/test-vehicles.cjs
 * Skips cleanly (exit 0) if VEHICLES_API_BASE is unset. (Full POST coverage needs a driver
 * profile, which arrives with the /drivers function — for now: list / 404 / 401 / 403.)
 */
const BASE = (process.env.VEHICLES_API_BASE || (process.env.VITE_API_BASE_URL ? `${process.env.VITE_API_BASE_URL}/functions/v1` : '')).replace(/\/+$/, '');
if (!BASE) {
  console.log('[test-vehicles] VEHICLES_API_BASE not set — skipping.');
  process.exit(0);
}
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

(async () => {
  console.log(`[test-vehicles] base = ${BASE}`);
  const phone = `+919900${Math.floor(100000 + Math.random() * 900000)}`;
  await j('POST', '/auth/auth/request-otp', { body: { phone } });
  const auth = await j('POST', '/auth/auth/verify-otp', { body: { phone, otp: '123456', display_name: 'Vehicle Smoke', role: 'driver' } });
  const token = auth.json?.data?.access_token;
  check('auth token obtained', !!token, `status=${auth.status} ${JSON.stringify(auth.json?.error || '')}`);
  if (!token) { process.exit(1); }
  const carTypes = await j('GET', '/admin/car-types');
  const carTypeId = (carTypes.json?.data || [])[0]?.id;

  const list = await j('GET', '/vehicles');
  check('GET /vehicles → 200 + array', list.status === 200 && Array.isArray(list.json?.data), `status=${list.status} ${JSON.stringify(list.json?.error || '')}`);

  const byDriver = await j('GET', '/vehicles?driver_id=00000000-0000-0000-0000-000000000000');
  check('GET /vehicles?driver_id=<none> → 200 + empty array', byDriver.status === 200 && Array.isArray(byDriver.json?.data) && byDriver.json.data.length === 0, `status=${byDriver.status} len=${byDriver.json?.data?.length}`);

  const get404 = await j('GET', '/vehicles/00000000-0000-0000-0000-000000000000');
  check('GET /vehicles/<nonexistent> → 404', get404.status === 404, `status=${get404.status}`);

  const noAuth = await j('POST', '/vehicles', { body: { car_type_id: carTypeId, year: 2020 } });
  check('POST /vehicles without auth → 401', noAuth.status === 401, `status=${noAuth.status}`);

  // the smoke user has a users row but no drivers row → 403
  const noDriver = await j('POST', '/vehicles', { token, body: { car_type_id: carTypeId, year: 2020 } });
  check('POST /vehicles by a user with no driver profile → 403', noDriver.status === 403, `status=${noDriver.status}`);

  if (failures) { console.error(`[test-vehicles] ${failures} check(s) failed`); process.exit(1); }
  console.log('[test-vehicles] all checks passed');
})().catch((e) => { console.error('[test-vehicles] error:', e); process.exit(1); });
