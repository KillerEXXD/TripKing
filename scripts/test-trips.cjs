#!/usr/bin/env node
/**
 * Smoke test for the /trips edge function.
 *   TRIPS_API_BASE=https://<ref>.supabase.co/functions/v1 node scripts/test-trips.cjs
 * Skips cleanly (exit 0) if TRIPS_API_BASE is unset. Creates real Supabase auth users (dev project).
 *
 * Covers: auth-required reads (GET /trips, GET /trips/:id → 401 without a Bearer); POST /trips with
 * the new REQUIRED hide_passenger_phone + passenger_count (missing → 422); the full lifecycle
 * (driver bootstrap → apply → "my applications" → assign → by-otp → start → live location → "trips
 * I'm driving" → complete); PII redaction per viewer (the poster/admin see passenger name+phone +
 * poster phone + passenger_otp + the assigned driver's live position; the assigned driver sees
 * passenger name + poster phone + their own position, and the passenger phone ONLY when
 * hide_passenger_phone is false; a non-party authed user sees none of that, no positions); Phase C-2
 * from_place_id/to_place_id + Phase D radius search + the alert_match notification fired on POST /trips.
 */
const BASE = (process.env.TRIPS_API_BASE || (process.env.VITE_API_BASE_URL ? `${process.env.VITE_API_BASE_URL}/functions/v1` : '')).replace(/\/+$/, '');
if (!BASE) {
  console.log('[test-trips] TRIPS_API_BASE not set — skipping (deploy the `trips` edge function first).');
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
async function signIn(role, name) {
  const phone = `+919900${Math.floor(100000 + Math.random() * 900000)}`;
  await j('POST', '/auth/auth/request-otp', { body: { phone } });
  const r = await j('POST', '/auth/auth/verify-otp', { body: { phone, otp: '123456', display_name: name || `Smoke ${role}`, role } });
  return r.json?.data?.access_token;
}
const has = (o, k) => o && typeof o === 'object' && k in o;
const futureIso = (d = 1) => new Date(Date.now() + d * 86400000).toISOString();

(async () => {
  console.log(`[test-trips] base = ${BASE}`);
  const token = await signIn('trip_manager', 'Trip Smoke');         // the poster
  const randoToken = await signIn('trip_manager', 'Rando');          // a never-a-party authed user
  check('auth tokens obtained', !!token && !!randoToken);
  if (!token) process.exit(1);

  const cityIds = ((await j('GET', '/admin/cities')).json?.data || []).map((c) => c.id);
  const carTypeId = ((await j('GET', '/admin/car-types')).json?.data || [])[0]?.id;
  check('have ≥2 cities + a car type', cityIds.length >= 2 && !!carTypeId, `cities=${cityIds.length} carType=${carTypeId}`);
  if (cityIds.length < 2 || !carTypeId) process.exit(1);

  // ── reads now require a Bearer ─────────────────────────────────────────
  check('GET /trips without auth → 401', (await j('GET', '/trips')).status === 401);
  const listAuthed = await j('GET', '/trips', { token });
  check('GET /trips (Bearer) → 200 + array', listAuthed.status === 200 && Array.isArray(listAuthed.json?.data), `status=${listAuthed.status}`);
  check('GET /trips/<nonexistent> without auth → 401', (await j('GET', `/trips/${NONE}`)).status === 401);

  // ── POST /trips: hide_passenger_phone + passenger_count are required ────
  check('POST /trips without auth → 401', (await j('POST', '/trips', { body: { from_city_id: cityIds[0] } })).status === 401);
  const baseTrip = { from_city_id: cityIds[0], to_city_id: cityIds[1], pickup_at: futureIso(), expected_distance_km: 140, car_type_id: carTypeId, rate_per_km: 14, commission_pct: 10, gst_amount: 98, driver_bata: 300, passenger_name: 'Smoke Pax', passenger_phone: '+918888888888', passenger_count: 2 };
  check('POST /trips without hide_passenger_phone → 422', (await j('POST', '/trips', { token, body: baseTrip })).status === 422);
  check('POST /trips without passenger_count → 422', (await j('POST', '/trips', { token, body: { ...baseTrip, hide_passenger_phone: false, passenger_count: undefined } })).status === 422);

  // ── the trip + lifecycle (hide_passenger_phone: false ⇒ the assigned driver may see the phone) ──
  const post = await j('POST', '/trips', { token, body: { ...baseTrip, hide_passenger_phone: false } });
  const tid = post.json?.data?.id;
  check('POST /trips (authed) → 200 + joined cities + driver_payout (= 14·140 − 10% − 98 + 300 = 1966)', post.status === 200 && !!tid && post.json?.data?.from_city?.name && post.json?.data?.driver_payout === 1966, `status=${post.status} ${JSON.stringify(post.json?.error || post.json?.data?.driver_payout)}`);
  if (!tid) process.exit(1);

  // poster reads their own trip → full
  const getAsPoster0 = await j('GET', `/trips/${tid}`, { token });
  check('GET /trips/:id (poster) → 200, no passenger_otp_hash', getAsPoster0.status === 200 && getAsPoster0.json?.data?.id === tid && !has(getAsPoster0.json?.data, 'passenger_otp_hash'), `status=${getAsPoster0.status}`);
  // a non-party authed user → browse-safe (no passenger PII)
  const getAsRando0 = await j('GET', `/trips/${tid}`, { token: randoToken });
  check('GET /trips/:id (non-party) → 200, browse-safe (no passenger_name/phone, no posted_by_phone)', getAsRando0.status === 200 && getAsRando0.json?.data?.id === tid && !has(getAsRando0.json?.data, 'passenger_name') && !has(getAsRando0.json?.data, 'passenger_phone') && !has(getAsRando0.json?.data, 'posted_by_phone'), `keys=${Object.keys(getAsRando0.json?.data || {}).join(',')}`);

  // driver bootstrap → apply → my-applications → assign
  const dToken = await signIn('driver', 'Trip Smoke Driver');
  const drvId = (await j('POST', '/drivers', { token: dToken, body: { full_name: 'Trip Smoke Driver' } })).json?.data?.id;
  const apply = await j('POST', `/trips/${tid}/applicants`, { token: dToken, body: { applicant_message: 'smoke apply' } });
  const aid = apply.json?.data?.id;
  check('GET /trips/applied without auth → 401', (await j('GET', '/trips/applied')).status === 401);
  const applied = await j('GET', '/trips/applied', { token: dToken });
  const mineApp = (applied.json?.data || []).find((a) => a.trip_id === tid);
  check('GET /trips/applied (driver) → contains my application + its browse-safe joined trip', applied.status === 200 && !!mineApp && mineApp.id === aid && !!mineApp.trip?.from_city?.name && !has(mineApp.trip, 'passenger_phone'), `${JSON.stringify(applied.json?.data || applied.json?.error || '').slice(0, 200)}`);

  const assign = await j('POST', `/trips/${tid}/assign`, { token, body: { acceptance_id: aid } });
  const otp = assign.json?.data?.passenger_otp;
  check('POST /trips/:id/assign → 200 + status assigned + passenger_otp', assign.status === 200 && assign.json?.data?.status === 'assigned' && !!otp, `status=${assign.status} ${JSON.stringify(assign.json?.error || '')}`);

  // ── PII redaction on GET /trips/:id (trip now assigned) ────────────────
  const pPoster = (await j('GET', `/trips/${tid}`, { token })).json?.data || {};
  check('GET /trips/:id as the poster → passenger name+phone, posted_by_phone, passenger_otp; no hash', pPoster.passenger_name === 'Smoke Pax' && pPoster.passenger_phone === '+918888888888' && pPoster.posted_by_phone !== undefined && pPoster.passenger_otp === otp && !has(pPoster, 'passenger_otp_hash'), `${JSON.stringify({ n: pPoster.passenger_name, ph: pPoster.passenger_phone, pp: pPoster.posted_by_phone, otp: pPoster.passenger_otp })}`);
  const pDriver = (await j('GET', `/trips/${tid}`, { token: dToken })).json?.data || {};
  check('GET /trips/:id as the assigned driver → passenger name + posted_by_phone + passenger phone (hide=false); NOT passenger_otp', pDriver.passenger_name === 'Smoke Pax' && pDriver.posted_by_phone !== undefined && pDriver.passenger_phone === '+918888888888' && !has(pDriver, 'passenger_otp'), `${JSON.stringify({ n: pDriver.passenger_name, ph: pDriver.passenger_phone, otp: pDriver.passenger_otp })}`);
  const pRando = (await j('GET', `/trips/${tid}`, { token: randoToken })).json?.data || {};
  check('GET /trips/:id as a non-party → no passenger_name/phone, no posted_by_phone, no passenger_otp', !has(pRando, 'passenger_name') && !has(pRando, 'passenger_phone') && !has(pRando, 'posted_by_phone') && !has(pRando, 'passenger_otp'), `keys=${Object.keys(pRando).join(',')}`);
  check('GET /trips/:id unauthenticated → 401', (await j('GET', `/trips/${tid}`)).status === 401);

  // by-otp (passenger portal) — still public
  const byOtp = await j('GET', `/trips/by-otp/${otp}`);
  check('GET /trips/by-otp/:otp → 200 + matching trip + assigned driver; no otp/hash', byOtp.status === 200 && byOtp.json?.data?.id === tid && !!byOtp.json?.data?.assigned_driver?.full_name && !has(byOtp.json?.data, 'passenger_otp_hash') && !has(byOtp.json?.data, 'passenger_otp'), `status=${byOtp.status} ${JSON.stringify(byOtp.json?.error || '')}`);
  check('GET /trips/by-otp/<no match> → 404', (await j('GET', '/trips/by-otp/000000')).status === 404);

  // start → driver pings location → only the poster / assigned driver see the live position
  const start = await j('POST', `/trips/${tid}/start`, { token: dToken, body: { passenger_otp: otp } });
  check('POST /trips/:id/start (assigned driver, valid OTP) → 200, in_progress', start.status === 200 && start.json?.data?.status === 'in_progress', `status=${start.status} ${JSON.stringify(start.json?.error || '')}`);
  if (drvId) await j('PATCH', `/drivers/${drvId}/location`, { token: dToken, body: { current_lat: 13.05, current_lng: 80.2 } });
  const liveAsPoster = (await j('GET', `/trips/${tid}`, { token })).json?.data || {};
  check('GET /trips/:id (in_progress) as the poster → assigned-driver position + distance_to_destination_km', liveAsPoster.assigned_driver?.current_lat != null && typeof liveAsPoster.distance_to_destination_km === 'number', `driver=${JSON.stringify(liveAsPoster.assigned_driver)} dist=${liveAsPoster.distance_to_destination_km}`);
  const liveAsRando = (await j('GET', `/trips/${tid}`, { token: randoToken })).json?.data || {};
  check('GET /trips/:id (in_progress) as a non-party → NO driver position, NO distance_to_destination_km', liveAsRando.assigned_driver?.current_lat == null && !('distance_to_destination_km' in liveAsRando), `driver=${JSON.stringify(liveAsRando.assigned_driver)} dist=${liveAsRando.distance_to_destination_km}`);
  const liveListPoster = await j('GET', `/trips?status=in_progress&posted_by_user_id=${post.json?.data?.posted_by_user_id}`, { token });
  check('GET /trips?status=in_progress&posted_by_user_id=<me> (poster) → contains the trip with the driver position', liveListPoster.status === 200 && (liveListPoster.json?.data || []).some((t) => t.id === tid && t.assigned_driver?.current_lat != null), `len=${liveListPoster.json?.data?.length}`);
  const liveListRando = await j('GET', '/trips?status=in_progress', { token: randoToken });
  const seen = (liveListRando.json?.data || []).find((t) => t.id === tid);
  check('GET /trips?status=in_progress as a non-party → if the trip is listed, its driver position is stripped', liveListRando.status === 200 && (!seen || seen.assigned_driver?.current_lat == null), `seen=${JSON.stringify(seen && seen.assigned_driver)}`);

  // "trips I'm driving"
  check('GET /trips?assigned_driver_id=me without auth → 401', (await j('GET', '/trips?assigned_driver_id=me')).status === 401);
  const drivingMe = await j('GET', '/trips?assigned_driver_id=me', { token: dToken });
  check('GET /trips?assigned_driver_id=me (assigned driver) → contains the trip', drivingMe.status === 200 && (drivingMe.json?.data || []).some((t) => t.id === tid), `len=${drivingMe.json?.data?.length}`);
  if (drvId) {
    const drivingById = await j('GET', `/trips?assigned_driver_id=${drvId}`, { token: randoToken });
    check('GET /trips?assigned_driver_id=<uuid> (authed, non-party) → contains the trip (browse-safe)', drivingById.status === 200 && (drivingById.json?.data || []).some((t) => t.id === tid), `len=${drivingById.json?.data?.length}`);
  }

  const complete = await j('POST', `/trips/${tid}/complete`, { token: dToken, body: { driver_notes: 'smoke' } });
  check('POST /trips/:id/complete (assigned driver) → 200, completed', complete.status === 200 && complete.json?.data?.status === 'completed', `status=${complete.status} ${JSON.stringify(complete.json?.error || '')}`);

  // ── hide_passenger_phone: true ⇒ even the assigned driver does NOT see the passenger phone ──
  if (drvId) {
    const hidden = await j('POST', '/trips', { token, body: { ...baseTrip, passenger_phone: '+919999999999', hide_passenger_phone: true, pickup_at: futureIso(2) } });
    const hTid = hidden.json?.data?.id;
    const hAid = (await j('POST', `/trips/${hTid}/applicants`, { token: dToken, body: {} })).json?.data?.id;
    const hOtp = (await j('POST', `/trips/${hTid}/assign`, { token, body: { acceptance_id: hAid } })).json?.data?.passenger_otp;
    await j('POST', `/trips/${hTid}/start`, { token: dToken, body: { passenger_otp: hOtp } });
    const hDriverView = (await j('GET', `/trips/${hTid}`, { token: dToken })).json?.data || {};
    check('hide_passenger_phone=true: assigned driver sees passenger_name but NOT passenger_phone', hDriverView.passenger_name === 'Smoke Pax' && !has(hDriverView, 'passenger_phone'), `${JSON.stringify({ n: hDriverView.passenger_name, ph: hDriverView.passenger_phone })}`);
    const hPosterView = (await j('GET', `/trips/${hTid}`, { token })).json?.data || {};
    check('hide_passenger_phone=true: the poster still sees the passenger phone', hPosterView.passenger_phone === '+919999999999', `ph=${hPosterView.passenger_phone}`);
    await j('POST', `/trips/${hTid}/complete`, { token: dToken, body: {} });
  }

  // ── Phase C-2: from_place_id/to_place_id · Phase D: radius search + alert matching ──
  const ppid = `trip-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const pA = await j('POST', '/places', { body: { provider: 'smoketest', providerPlaceId: `${ppid}-a`, name: 'Trip Place A', lat: 11.01, lng: 76.96 } });
  const pB = await j('POST', '/places', { body: { provider: 'smoketest', providerPlaceId: `${ppid}-b`, name: 'Trip Place B', lat: 9.92, lng: 78.12 } });
  const pAId = pA.json?.data?.id, pBId = pB.json?.data?.id;
  check('POST /places → two places created', pA.status === 200 && !!pAId && pB.status === 200 && !!pBId, `a=${pAId} b=${pBId}`);

  // a saved alert owned by a fresh user (NOT the trip poster), from-point where the new trip will start
  const alertToken = await signIn('trip_manager', 'Alert Owner');
  const pAlert = await j('POST', '/places', { body: { provider: 'smoketest', providerPlaceId: `${ppid}-alert`, name: 'Alert From', lat: 11.01, lng: 76.96 } });
  const mkAlert = await j('POST', '/alerts', { token: alertToken, body: { name: 'Smoke alert', from_city_id: cityIds[0], from_place_id: pAlert.json?.data?.id, from_radius_km: 50, notify_via: ['in_app'] } });
  check('POST /alerts (should match the new trip) → 200', mkAlert.status === 200 && !!mkAlert.json?.data?.id, `status=${mkAlert.status} ${JSON.stringify(mkAlert.json?.error || '')}`);

  const trip2 = await j('POST', '/trips', { token, body: { ...baseTrip, hide_passenger_phone: false, passenger_count: 1, from_place_id: pAId, to_place_id: pBId, pickup_at: futureIso(), expected_distance_km: 200, rate_per_km: 13, gst_amount: 0 } });
  const t2 = trip2.json?.data;
  check('POST /trips with from_place_id/to_place_id → 200 + joined from_place/to_place', trip2.status === 200 && !!t2?.id && t2.from_place?.id === pAId && t2.to_place?.id === pBId, `status=${trip2.status} ${JSON.stringify({ fp: t2?.from_place, tp: t2?.to_place, err: trip2.json?.error })}`);
  const badPlaceTrip = await j('POST', '/trips', { token, body: { ...baseTrip, hide_passenger_phone: false, passenger_count: 1, from_place_id: NONE, pickup_at: futureIso(), expected_distance_km: 50, rate_per_km: 12 } });
  check('POST /trips with a bad from_place_id → 422', badPlaceTrip.status === 422, `status=${badPlaceTrip.status}`);

  if (t2?.id) {
    const near = await j('GET', '/trips?near_lat=11.01&near_lng=76.96&radius_km=5', { token });
    const hit = (near.json?.data || []).find((x) => x.id === t2.id);
    check('GET /trips?near_lat&near_lng&radius_km → contains the trip + numeric distance_km ≤ radius', near.status === 200 && !!hit && typeof hit.distance_km === 'number' && hit.distance_km <= 5, `hit=${JSON.stringify(hit && { id: hit.id, distance_km: hit.distance_km })}`);
    const far = await j('GET', '/trips?near_lat=28.6&near_lng=77.2&radius_km=5', { token });
    check('GET /trips?near=<far away> → does not contain it', far.status === 200 && !(far.json?.data || []).some((x) => x.id === t2.id), `len=${far.json?.data?.length}`);
  }

  const notifs = await j('GET', '/notifications', { token: alertToken });
  const matched = (notifs.json?.data || []).find((n) => n && n.type === 'alert_match' && n.payload_json && n.payload_json.trip_id === t2?.id);
  check('POST /trips inside a saved alert\'s radius → alert_match notification fired for the alert owner', notifs.status === 200 && !!matched, `notifs=${JSON.stringify((notifs.json?.data || []).map((n) => ({ t: n?.type, p: n?.payload_json })))}`);

  if (failures) { console.error(`[test-trips] ${failures} check(s) failed`); process.exit(1); }
  console.log('[test-trips] all checks passed');
})().catch((e) => { console.error('[test-trips] error:', e); process.exit(1); });
