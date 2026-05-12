#!/usr/bin/env node
/**
 * Smoke test for the /trips edge function (auth → create → read → driver bootstrap → apply →
 * assign → passenger-OTP lookup (GET /trips/by-otp/:otp) → cancel).
 *
 *   TRIPS_API_BASE=https://<ref>.supabase.co/functions/v1 node scripts/test-trips.cjs
 *
 * Skips cleanly (exit 0) if TRIPS_API_BASE is unset. Creates real Supabase auth users
 * (dev project) via /auth/verify-otp's dev-OTP mode.
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

  const list0 = await j('GET', '/trips');
  check('GET /trips (public) → 200 + array', list0.status === 200 && Array.isArray(list0.json?.data), `status=${list0.status} ${JSON.stringify(list0.json?.error || '')}`);

  const noAuth = await j('POST', '/trips', { body: { from_city_id: cityIds[0] } });
  check('POST /trips without auth → 401', noAuth.status === 401, `status=${noAuth.status}`);

  const post = await j('POST', '/trips', {
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
    'POST /trips (authed) → 200 + joined cities + driver_payout',
    post.status === 200 && post.json?.data?.id && post.json?.data?.from_city?.name && typeof post.json?.data?.driver_payout === 'number',
    `status=${post.status} ${JSON.stringify(post.json?.error || post.json?.data || '')}`,
  );
  check('driver_payout computed by trigger (= 14·140 − 10% − 98 + 300 = 1966)', post.json?.data?.driver_payout === 1966, `got ${post.json?.data?.driver_payout}`);

  const tid = post.json?.data?.id;
  if (tid) {
    const get = await j('GET', `/trips/${tid}`);
    check('GET /trips/:id → 200', get.status === 200 && get.json?.data?.id === tid, `status=${get.status}`);
    check('GET /trips/:id does not echo passenger_otp_hash', !('passenger_otp_hash' in (get.json?.data || {})), `keys=${Object.keys(get.json?.data || {}).join(',')}`);

    // driver bootstrap → apply → assign → passenger OTP → by-otp → start → live-location → complete
    const dPhone = `+919900${Math.floor(100000 + Math.random() * 900000)}`;
    await j('POST', '/auth/auth/request-otp', { body: { phone: dPhone } });
    const dAuth = await j('POST', '/auth/auth/verify-otp', { body: { phone: dPhone, otp: '123456', display_name: 'Trip Smoke Driver', role: 'driver' } });
    const dToken = dAuth.json?.data?.access_token;
    const drvId = (await j('POST', '/drivers', { token: dToken, body: { full_name: 'Trip Smoke Driver' } })).json?.data?.id;
    const apply = await j('POST', `/trips/${tid}/applicants`, { token: dToken, body: {} });
    const aid = apply.json?.data?.id;
    const assign = await j('POST', `/trips/${tid}/assign`, { token, body: { acceptance_id: aid } });
    const otp = assign.json?.data?.passenger_otp;
    check('POST /trips/:id/assign → 200 + status assigned + passenger_otp', assign.status === 200 && assign.json?.data?.status === 'assigned' && !!otp, `status=${assign.status} ${JSON.stringify(assign.json?.error || '')}`);
    if (otp) {
      const byOtp = await j('GET', `/trips/by-otp/${otp}`);
      check('GET /trips/by-otp/:otp → 200 + matching trip + assigned driver + no hash', byOtp.status === 200 && byOtp.json?.data?.id === tid && !!byOtp.json?.data?.assigned_driver?.full_name && !('passenger_otp_hash' in (byOtp.json?.data || {})), `status=${byOtp.status} ${JSON.stringify(byOtp.json?.error || byOtp.json?.data || '')}`);
    }
    const byBadOtp = await j('GET', '/trips/by-otp/000000');
    check('GET /trips/by-otp/<no match> → 404', byBadOtp.status === 404, `status=${byBadOtp.status}`);

    // start the trip, then the driver pings their location → the manager sees it on the trip
    const start = await j('POST', `/trips/${tid}/start`, { token: dToken, body: { passenger_otp: otp } });
    check('POST /trips/:id/start (assigned driver, valid OTP) → 200, status=in_progress', start.status === 200 && start.json?.data?.status === 'in_progress', `status=${start.status} ${JSON.stringify(start.json?.error || '')}`);
    if (drvId) await j('PATCH', `/drivers/${drvId}/location`, { token: dToken, body: { current_lat: 13.05, current_lng: 80.2 } });
    const live = await j('GET', `/trips/${tid}`);
    check('GET /trips/:id (in_progress) → assigned-driver position + distance_to_destination_km', live.status === 200 && live.json?.data?.assigned_driver?.current_lat != null && typeof live.json?.data?.distance_to_destination_km === 'number', `status=${live.status} driver=${JSON.stringify(live.json?.data?.assigned_driver)} dist=${live.json?.data?.distance_to_destination_km}`);
    const liveList = await j('GET', `/trips?status=in_progress&posted_by_user_id=${post.json?.data?.posted_by_user_id}`);
    check('GET /trips?status=in_progress&posted_by_user_id= → contains the trip with the driver position', liveList.status === 200 && (liveList.json?.data || []).some((t) => t.id === tid && t.assigned_driver?.current_lat != null), `len=${liveList.json?.data?.length}`);

    const complete = await j('POST', `/trips/${tid}/complete`, { token: dToken, body: { driver_notes: 'smoke' } });
    check('POST /trips/:id/complete (assigned driver) → 200, status=completed', complete.status === 200 && complete.json?.data?.status === 'completed', `status=${complete.status} ${JSON.stringify(complete.json?.error || '')}`);
  }

  if (failures) { console.error(`[test-trips] ${failures} check(s) failed`); process.exit(1); }
  console.log('[test-trips] all checks passed');
})().catch((e) => { console.error('[test-trips] error:', e); process.exit(1); });
