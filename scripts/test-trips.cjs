#!/usr/bin/env node
/**
 * Smoke test for the /trips edge function (auth → create → read → driver bootstrap → apply →
 * "my applications" (GET /trips/applied) → assign → passenger_otp echo (poster-only) → by-otp →
 * start → live location → "trips I'm driving" (GET /trips?assigned_driver_id=me|<uuid>) → complete).
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
    const apply = await j('POST', `/trips/${tid}/applicants`, { token: dToken, body: { applicant_message: 'smoke apply' } });
    const aid = apply.json?.data?.id;

    // "my applications" — the driver can read back their own trip_acceptances (poster-only is GET /:id/applicants)
    const appliedNoAuth = await j('GET', '/trips/applied');
    check('GET /trips/applied without auth → 401', appliedNoAuth.status === 401, `status=${appliedNoAuth.status}`);
    const applied = await j('GET', '/trips/applied', { token: dToken });
    const mine = (applied.json?.data || []).find((a) => a.trip_id === tid);
    check('GET /trips/applied (driver) → contains my application + its joined trip', applied.status === 200 && !!mine && mine.id === aid && !!mine.trip?.from_city?.name && !('passenger_otp_hash' in (mine.trip || {})), `status=${applied.status} ${JSON.stringify(applied.json?.data || applied.json?.error || '').slice(0, 200)}`);

    const assign = await j('POST', `/trips/${tid}/assign`, { token, body: { acceptance_id: aid } });
    const otp = assign.json?.data?.passenger_otp;
    check('POST /trips/:id/assign → 200 + status assigned + passenger_otp', assign.status === 200 && assign.json?.data?.status === 'assigned' && !!otp, `status=${assign.status} ${JSON.stringify(assign.json?.error || '')}`);

    // passenger_otp is echoed on GET /trips/:id ONLY to the poster (or an admin) — never the hash, never to others
    const getAsPoster = await j('GET', `/trips/${tid}`, { token });
    check('GET /trips/:id as the poster → echoes passenger_otp (matches assign)', getAsPoster.json?.data?.passenger_otp === otp && !('passenger_otp_hash' in (getAsPoster.json?.data || {})), `otp=${getAsPoster.json?.data?.passenger_otp} expected=${otp}`);
    const getAsDriver = await j('GET', `/trips/${tid}`, { token: dToken });
    check('GET /trips/:id as the assigned driver → does NOT echo passenger_otp', !('passenger_otp' in (getAsDriver.json?.data || {})), `keys=${Object.keys(getAsDriver.json?.data || {}).join(',')}`);
    const getAnon = await j('GET', `/trips/${tid}`);
    check('GET /trips/:id unauthenticated → does NOT echo passenger_otp', !('passenger_otp' in (getAnon.json?.data || {})), `keys=${Object.keys(getAnon.json?.data || {}).join(',')}`);

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

    // "trips I'm driving" — assigned_driver_id accepts a uuid (public) or `me` (the assigned driver, Bearer)
    const drivingMeNoAuth = await j('GET', '/trips?assigned_driver_id=me');
    check('GET /trips?assigned_driver_id=me without auth → 401', drivingMeNoAuth.status === 401, `status=${drivingMeNoAuth.status}`);
    const drivingMe = await j('GET', '/trips?assigned_driver_id=me', { token: dToken });
    check('GET /trips?assigned_driver_id=me (assigned driver) → contains the trip', drivingMe.status === 200 && (drivingMe.json?.data || []).some((t) => t.id === tid), `len=${drivingMe.json?.data?.length}`);
    if (drvId) {
      const drivingById = await j('GET', `/trips?assigned_driver_id=${drvId}`);
      check('GET /trips?assigned_driver_id=<uuid> (public) → contains the trip', drivingById.status === 200 && (drivingById.json?.data || []).some((t) => t.id === tid), `len=${drivingById.json?.data?.length}`);
    }

    const complete = await j('POST', `/trips/${tid}/complete`, { token: dToken, body: { driver_notes: 'smoke' } });
    check('POST /trips/:id/complete (assigned driver) → 200, status=completed', complete.status === 200 && complete.json?.data?.status === 'completed', `status=${complete.status} ${JSON.stringify(complete.json?.error || '')}`);
  }

  // ── Phase C-2: from_place_id/to_place_id on a trip · Phase D: radius search + alert matching ──
  const ppid = `trip-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const pA = await j('POST', '/places', { body: { provider: 'smoketest', providerPlaceId: `${ppid}-a`, name: 'Trip Place A', lat: 11.01, lng: 76.96 } });
  const pB = await j('POST', '/places', { body: { provider: 'smoketest', providerPlaceId: `${ppid}-b`, name: 'Trip Place B', lat: 9.92, lng: 78.12 } });
  const pAId = pA.json?.data?.id, pBId = pB.json?.data?.id;
  check('POST /places → two places created', pA.status === 200 && !!pAId && pB.status === 200 && !!pBId, `a=${pAId} b=${pBId}`);

  // a saved alert owned by a fresh user (NOT the trip poster), whose from-point sits where the new trip will start
  const aPhone = `+919900${Math.floor(100000 + Math.random() * 900000)}`;
  await j('POST', '/auth/auth/request-otp', { body: { phone: aPhone } });
  const alertToken = (await j('POST', '/auth/auth/verify-otp', { body: { phone: aPhone, otp: '123456', display_name: 'Alert Owner', role: 'trip_manager' } })).json?.data?.access_token;
  const pAlert = await j('POST', '/places', { body: { provider: 'smoketest', providerPlaceId: `${ppid}-alert`, name: 'Alert From', lat: 11.01, lng: 76.96 } });
  const mkAlert = await j('POST', '/alerts', { token: alertToken, body: { name: 'Smoke alert', from_city_id: cityIds[0], from_place_id: pAlert.json?.data?.id, from_radius_km: 50, notify_via: ['in_app'] } });
  check('POST /alerts (the alert that should match the new trip) → 200', mkAlert.status === 200 && !!mkAlert.json?.data?.id, `status=${mkAlert.status} ${JSON.stringify(mkAlert.json?.error || '')}`);

  const trip2 = await j('POST', '/trips', { token, body: { from_city_id: cityIds[0], to_city_id: cityIds[1], from_place_id: pAId, to_place_id: pBId, pickup_at: new Date(Date.now() + 86400000).toISOString(), expected_distance_km: 200, car_type_id: carTypeId, rate_per_km: 13, commission_pct: 10, gst_amount: 0, driver_bata: 300 } });
  const t2 = trip2.json?.data;
  check('POST /trips with from_place_id/to_place_id → 200 + joined from_place/to_place', trip2.status === 200 && !!t2?.id && t2.from_place?.id === pAId && t2.to_place?.id === pBId, `status=${trip2.status} ${JSON.stringify({ fp: t2?.from_place, tp: t2?.to_place, err: trip2.json?.error })}`);
  const badPlaceTrip = await j('POST', '/trips', { token, body: { from_city_id: cityIds[0], to_city_id: cityIds[1], from_place_id: '00000000-0000-0000-0000-000000000000', pickup_at: new Date().toISOString(), expected_distance_km: 50, car_type_id: carTypeId, rate_per_km: 12 } });
  check('POST /trips with a bad from_place_id → 422', badPlaceTrip.status === 422, `status=${badPlaceTrip.status}`);

  if (t2?.id) {
    const near = await j('GET', '/trips?near_lat=11.01&near_lng=76.96&radius_km=5');
    const hit = (near.json?.data || []).find((x) => x.id === t2.id);
    check('GET /trips?near_lat&near_lng&radius_km → contains the trip + numeric distance_km ≤ radius', near.status === 200 && !!hit && typeof hit.distance_km === 'number' && hit.distance_km <= 5, `hit=${JSON.stringify(hit && { id: hit.id, distance_km: hit.distance_km })}`);
    const far = await j('GET', '/trips?near_lat=28.6&near_lng=77.2&radius_km=5');
    check('GET /trips?near=<far away> → does not contain it', far.status === 200 && !(far.json?.data || []).some((x) => x.id === t2.id), `len=${far.json?.data?.length}`);
  }

  // alert matching: the alert owner should now have an alert_match notification pointing at trip2
  const notifs = await j('GET', '/notifications', { token: alertToken });
  const matched = (notifs.json?.data || []).find((n) => n && n.type === 'alert_match' && n.payload_json && n.payload_json.trip_id === t2?.id);
  check('POST /trips inside a saved alert\'s radius → alert_match notification fired for the alert owner', notifs.status === 200 && !!matched, `notifs=${JSON.stringify((notifs.json?.data || []).map((n) => ({ t: n?.type, p: n?.payload_json })))}`);

  if (failures) { console.error(`[test-trips] ${failures} check(s) failed`); process.exit(1); }
  console.log('[test-trips] all checks passed');
})().catch((e) => { console.error('[test-trips] error:', e); process.exit(1); });
