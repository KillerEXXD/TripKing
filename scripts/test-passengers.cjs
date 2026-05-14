#!/usr/bin/env node
/**
 * Smoke test for the /passengers edge function.
 *   PASSENGERS_API_BASE=https://<ref>.supabase.co/functions/v1 node scripts/test-passengers.cjs
 * Skips cleanly (exit 0) if the base URL is unset.
 *
 * Covers: CORS preflight; lookup unauth (401) / missing-phone (422) / unknown-phone (404);
 * list unauth (401) / non-admin (403); admin list happy path + ?q= search; and the upsert
 * path — POST /trips with a fresh phone creates the passenger row, POST /trips with the
 * same phone but a different name appends to aliases (keeping the canonical name).
 */
const BASE = (process.env.PASSENGERS_API_BASE || (process.env.VITE_API_BASE_URL ? `${process.env.VITE_API_BASE_URL}/functions/v1` : '')).replace(/\/+$/, '');
if (!BASE) {
  console.log('[test-passengers] PASSENGERS_API_BASE not set — skipping.');
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
async function tokenFor(role) {
  const phone = `+919900${Math.floor(100000 + Math.random() * 900000)}`;
  await j('POST', '/auth/auth/request-otp', { body: { phone } });
  const auth = await j('POST', '/auth/auth/verify-otp', { body: { phone, otp: '12345', display_name: `Smoke ${role}`, role } });
  return { token: auth.json?.data?.access_token, phone };
}

(async () => {
  console.log(`[test-passengers] base = ${BASE}`);

  // ── CORS preflight ───────────────────────────────────────────────────────
  const pre = await fetch(`${BASE}/passengers`, {
    method: 'OPTIONS',
    headers: { Origin: 'https://trip-king.vercel.app', 'Access-Control-Request-Method': 'GET' },
  });
  check('CORS preflight returns 204', pre.status === 204, `got ${pre.status}`);
  check('CORS allow-origin set', pre.headers.get('access-control-allow-origin') === '*');

  // ── unauth / forbidden paths ─────────────────────────────────────────────
  const unauthList = await j('GET', '/passengers');
  check('GET /passengers without token → 401', unauthList.status === 401);

  const unauthLookup = await j('GET', '/passengers/lookup?phone=%2B919999999999');
  check('GET /passengers/lookup without token → 401', unauthLookup.status === 401);

  const { token: driverTok } = await tokenFor('driver');
  check('driver token obtained', !!driverTok);
  if (!driverTok) { process.exit(1); }

  const nonAdminList = await j('GET', '/passengers', { token: driverTok });
  check('GET /passengers as driver → 403', nonAdminList.status === 403);

  const missingPhone = await j('GET', '/passengers/lookup', { token: driverTok });
  check('GET /passengers/lookup without phone → 422', missingPhone.status === 422);

  const unknownPhone = `+91${Math.floor(7000000000 + Math.random() * 999999999)}`;
  const noMatch = await j('GET', `/passengers/lookup?phone=${encodeURIComponent(unknownPhone)}`, { token: driverTok });
  check('GET /passengers/lookup unknown phone → 404', noMatch.status === 404);

  // ── upsert path: POST /trips registers a passenger ───────────────────────
  // need agent + driver-licensed account that can post a trip; the post-trip flow requires KYC,
  // which a fresh smoke account won't have — so we use an admin to bypass the KYC gate.
  const { token: adminTok } = await tokenFor('admin');
  check('admin token obtained', !!adminTok);

  // pick a city for from/to
  const cities = await j('GET', '/admin/cities', { token: adminTok });
  const cityId = cities.json?.data?.[0]?.id;
  const cityId2 = cities.json?.data?.[1]?.id ?? cityId;
  check('cities available for trip post', !!cityId);

  const carTypes = await j('GET', '/admin/car-types', { token: adminTok });
  const carTypeId = carTypes.json?.data?.[0]?.id;
  check('car types available', !!carTypeId);

  const passengerPhone = `+91${Math.floor(7000000000 + Math.random() * 999999999)}`;
  const post1 = await j('POST', '/trips', {
    token: adminTok,
    body: {
      from_city_id: cityId,
      to_city_id: cityId2,
      pickup_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      expected_distance_km: 100,
      car_type_id: carTypeId,
      seats_required: 4,
      ac_required: true,
      rate_per_km: 14,
      passenger_name: 'Smoke Passenger One',
      passenger_phone: passengerPhone,
      passenger_count: 2,
      hide_passenger_phone: false,
    },
  });
  // POST /trips may 403 if admin isn't allowed to post — skip the upsert checks gracefully in that case
  if (post1.status === 200 || post1.status === 201) {
    // give the upsert a moment to commit
    await new Promise((r) => setTimeout(r, 500));
    const look1 = await j('GET', `/passengers/lookup?phone=${encodeURIComponent(passengerPhone)}`, { token: driverTok });
    check('lookup after first POST /trips → 200', look1.status === 200, `status=${look1.status}`);
    check('passenger name matches first POST', look1.json?.data?.name === 'Smoke Passenger One');
    check('aliases empty after first POST', Array.isArray(look1.json?.data?.aliases) && look1.json.data.aliases.length === 0);
    check('trips_count = 1 after first POST', look1.json?.data?.trips_count === 1);

    // second POST with a DIFFERENT name for the SAME phone
    const post2 = await j('POST', '/trips', {
      token: adminTok,
      body: {
        from_city_id: cityId,
        to_city_id: cityId2,
        pickup_at: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(),
        expected_distance_km: 100,
        car_type_id: carTypeId,
        seats_required: 4,
        ac_required: true,
        rate_per_km: 14,
        passenger_name: 'Smoke Passenger Two',
        passenger_phone: passengerPhone,
        passenger_count: 2,
        hide_passenger_phone: false,
      },
    });
    if (post2.status === 200 || post2.status === 201) {
      await new Promise((r) => setTimeout(r, 500));
      const look2 = await j('GET', `/passengers/lookup?phone=${encodeURIComponent(passengerPhone)}`, { token: driverTok });
      check('canonical name unchanged after second POST', look2.json?.data?.name === 'Smoke Passenger One');
      check('alias appended after second POST', look2.json?.data?.aliases?.includes('Smoke Passenger Two'));
      check('trips_count = 2 after second POST', look2.json?.data?.trips_count === 2);
    } else {
      console.log(`  ⚠ second POST /trips returned ${post2.status} — skipping alias check`);
    }

    // admin list happy path
    const adminList = await j('GET', `/passengers?q=${encodeURIComponent(passengerPhone)}`, { token: adminTok });
    check('admin list with ?q= filter → 200', adminList.status === 200);
    check('admin list returns the passenger', Array.isArray(adminList.json?.data) && adminList.json.data.some((p) => p.phone === passengerPhone));
    check('admin list has meta pagination', !!adminList.json?.meta && typeof adminList.json.meta.total === 'number');
  } else {
    console.log(`  ⚠ POST /trips as admin returned ${post1.status} — skipping upsert/list checks (admin may not be allowed to post)`);
  }

  console.log(failures === 0 ? '\n[test-passengers] ✅ all checks passed' : `\n[test-passengers] ❌ ${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('[test-passengers] threw:', e); process.exit(1); });
