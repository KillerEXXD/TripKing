#!/usr/bin/env node
/**
 * Smoke test for the /trips edge function (auth → create → read → cancel).
 *
 *   TRIPS_API_BASE=https://<ref>.supabase.co/functions/v1 node scripts/test-trips.cjs
 *
 * Skips cleanly (exit 0) if TRIPS_API_BASE is unset. Creates a real Supabase auth user
 * (dev project) via /auth/verify-otp's dev-OTP mode, then posts + cancels a test trip.
 */
const BASE = (process.env.TRIPS_API_BASE || (process.env.VITE_API_BASE_URL ? `${process.env.VITE_API_BASE_URL}/functions/v1` : '')).replace(/\/+$/, '');
if (!BASE) {
  console.log('[test-trips] TRIPS_API_BASE not set — skipping (deploy the `trips` edge function first).');
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
  console.log(`[test-trips] base = ${BASE}`);
  const phone = `+919900${Math.floor(100000 + Math.random() * 900000)}`;
  await j('POST', '/auth/auth/request-otp', { body: { phone } });
  const auth = await j('POST', '/auth/auth/verify-otp', { body: { phone, otp: '123456', display_name: 'Trip Smoke', role: 'trip_manager' } });
  const token = auth.json?.data?.access_token;
  check('auth token obtained', !!token, `status=${auth.status} ${JSON.stringify(auth.json?.error || '')}`);
  if (!token) { process.exit(1); }

  const cities = await j('GET', '/admin/cities');
  const carTypes = await j('GET', '/admin/car-types');
  const cityIds = (cities.json?.data || []).map((c) => c.id);
  const carTypeId = (carTypes.json?.data || [])[0]?.id;
  check('have ≥2 cities + a car type', cityIds.length >= 2 && !!carTypeId, `cities=${cityIds.length} carType=${carTypeId}`);

  const list0 = await j('GET', '/trips/trips');
  check('GET /trips/trips (public) → 200 + array', list0.status === 200 && Array.isArray(list0.json?.data), `status=${list0.status} ${JSON.stringify(list0.json?.error || '')}`);

  const noAuth = await j('POST', '/trips/trips', { body: { from_city_id: cityIds[0] } });
  check('POST /trips/trips without auth → 401', noAuth.status === 401, `status=${noAuth.status}`);

  const post = await j('POST', '/trips/trips', {
    token,
    body: {
      from_city_id: cityIds[0],
      to_city_id: cityIds[1],
      pickup_at: new Date(Date.now() + 86400000).toISOString(),
      expected_distance_km: 140,
      car_type_id: carTypeId,
      rate_per_km: 14,
      commission_pct: 10,
      gst_amount: 98,
      driver_bata: 300,
      passenger_name: 'Smoke Pax',
      passenger_phone: '+918888888888',
      passenger_count: 2,
    },
  });
  check(
    'POST /trips/trips (authed) → 200 + joined cities + driver_payout',
    post.status === 200 && post.json?.data?.id && post.json?.data?.from_city?.name && typeof post.json?.data?.driver_payout === 'number',
    `status=${post.status} ${JSON.stringify(post.json?.error || post.json?.data || '')}`,
  );
  check('driver_payout computed by trigger (= 14·140 − 10% − 98 + 300 = 1966)', post.json?.data?.driver_payout === 1966, `got ${post.json?.data?.driver_payout}`);

  const tid = post.json?.data?.id;
  if (tid) {
    const get = await j('GET', `/trips/trips/${tid}`);
    check('GET /trips/trips/:id → 200', get.status === 200 && get.json?.data?.id === tid, `status=${get.status}`);
    const reasons = await j('GET', '/admin/cancel-reasons');
    const rid = (reasons.json?.data || []).find((r) => r.applies_to === 'agent' || r.applies_to === 'both')?.id;
    const cancel = await j('POST', `/trips/trips/${tid}/cancel`, { token, body: { cancel_reason_id: rid || null } });
    check('POST /trips/trips/:id/cancel (poster) → 200, status=cancelled', cancel.status === 200 && cancel.json?.data?.status === 'cancelled', `status=${cancel.status} ${JSON.stringify(cancel.json?.error || '')}`);
  }

  if (failures) { console.error(`[test-trips] ${failures} check(s) failed`); process.exit(1); }
  console.log('[test-trips] all checks passed');
})().catch((e) => { console.error('[test-trips] error:', e); process.exit(1); });
