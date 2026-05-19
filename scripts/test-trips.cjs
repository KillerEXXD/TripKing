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
 *
 * Also covers KYC gating (a non-approved poster/driver → 403 KYC_REQUIRED) and the deactivation
 * kill switch (a deactivated driver can't apply → 403 ACCOUNT_SUSPENDED, and can't be assigned → 422).
 *
 * For a multi-actor / many-trips version of this lifecycle (N agents × M drivers, GPS pings, etc.)
 * see scripts/simulate-marketplace.cjs (`npm run sim:marketplace`).
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
// Same haversine the `trips` edge function uses for distance_to_destination_km — recomputed here to
// black-box-check the server's number.
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
  const adminToken = await signIn('admin', 'Trip Smoke Admin');      // to bump KYC + (de)activate
  check('auth tokens obtained', !!token && !!randoToken && !!adminToken);
  if (!token || !adminToken) process.exit(1);

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

  // posting a trip requires an approved-KYC poster — give the trip_manager an agent profile + approve it.
  const posterAgentId = (await j('POST', '/agents', { token, body: { full_name: 'Trip Smoke Agent', business_name: 'Trip Smoke Travels' } })).json?.data?.id;
  if (posterAgentId) await j('PATCH', `/agents/${posterAgentId}/kyc`, { token: adminToken, body: { kyc_status: 'approved', note: 'smoke' } });
  check('poster agent profile created + KYC approved', !!posterAgentId);

  // ── the trip + lifecycle (hide_passenger_phone: false ⇒ the assigned driver may see the phone) ──
  const post = await j('POST', '/trips', { token, body: { ...baseTrip, hide_passenger_phone: false } });
  const tid = post.json?.data?.id;
  check('POST /trips (authed) → 200 + joined cities + driver_payout (= 14·140 − 10% − 98 + 300 = 1966)', post.status === 200 && !!tid && post.json?.data?.from_city?.name && post.json?.data?.driver_payout === 1966, `status=${post.status} ${JSON.stringify(post.json?.error || post.json?.data?.driver_payout)}`);
  if (!tid) process.exit(1);
  // Regression: posting a trip with no `expected_end_at` (and no destination arrive_at)
  // must derive a realistic end from `expected_distance_km`, NOT default to pickup+24h.
  // 140 km / 40 km/h + 1h buffer ≈ 4.5h → end should be 1h..8h after pickup. The old
  // pickup+24h default broke auto-invite (vacancy-time-bounds-must-mirror).
  {
    const pickupMs = new Date(post.json?.data?.pickup_at ?? 0).getTime();
    const endMs = new Date(post.json?.data?.expected_end_at ?? 0).getTime();
    const spanH = (endMs - pickupMs) / 3600_000;
    check('POST /trips derives expected_end_at from distance (not pickup+24h)', spanH > 1 && spanH < 8, `span=${spanH.toFixed(2)}h (expected ~4.5h for 140km)`);
  }
  const toLat = Number(post.json?.data?.to_city?.lat), toLng = Number(post.json?.data?.to_city?.lng);

  // poster reads their own trip → full
  const getAsPoster0 = await j('GET', `/trips/${tid}`, { token });
  check('GET /trips/:id (poster) → 200, no passenger_otp_hash', getAsPoster0.status === 200 && getAsPoster0.json?.data?.id === tid && !has(getAsPoster0.json?.data, 'passenger_otp_hash'), `status=${getAsPoster0.status}`);
  check('GET /trips/:id → posted_by_kyc_status is a string (drives <VerifiedBadge>)', typeof getAsPoster0.json?.data?.posted_by_kyc_status === 'string', `posted_by_kyc_status=${JSON.stringify(getAsPoster0.json?.data?.posted_by_kyc_status)}`);
  // Phase 1 of the two-step handshake (migration 030): every trip carries an acceptance window int 5–30.
  check('GET /trips/:id → acceptance_window_minutes is an int 5–30 (handshake Phase 1)',
    typeof getAsPoster0.json?.data?.acceptance_window_minutes === 'number'
      && getAsPoster0.json.data.acceptance_window_minutes >= 5
      && getAsPoster0.json.data.acceptance_window_minutes <= 30,
    `acceptance_window_minutes=${JSON.stringify(getAsPoster0.json?.data?.acceptance_window_minutes)}`);
  // a non-party authed user → browse-safe (no passenger PII)
  const getAsRando0 = await j('GET', `/trips/${tid}`, { token: randoToken });
  check('GET /trips/:id (non-party) → 200, browse-safe (no passenger_name/phone, no posted_by_phone)', getAsRando0.status === 200 && getAsRando0.json?.data?.id === tid && !has(getAsRando0.json?.data, 'passenger_name') && !has(getAsRando0.json?.data, 'passenger_phone') && !has(getAsRando0.json?.data, 'posted_by_phone'), `keys=${Object.keys(getAsRando0.json?.data || {}).join(',')}`);

  // driver bootstrap → apply → my-applications → assign
  const dToken = await signIn('driver', 'Trip Smoke Driver');
  const drvId = (await j('POST', '/drivers', { token: dToken, body: { full_name: 'Trip Smoke Driver' } })).json?.data?.id;
  check('POST /trips/:id/applicants before KYC approval → 403 KYC_REQUIRED', (await j('POST', `/trips/${tid}/applicants`, { token: dToken, body: {} })).status === 403);
  if (drvId) await j('PATCH', `/drivers/${drvId}/kyc`, { token: adminToken, body: { kyc_status: 'approved', note: 'smoke' } });
  const apply = await j('POST', `/trips/${tid}/applicants`, { token: dToken, body: { applicant_message: 'smoke apply' } });
  const aid = apply.json?.data?.id;
  check('POST /trips/:id/applicants (KYC-approved driver) → 200 + acceptance id', apply.status === 200 && !!aid, `status=${apply.status} ${JSON.stringify(apply.json?.error || '')}`);
  check('GET /trips/applied without auth → 401', (await j('GET', '/trips/applied')).status === 401);
  const applied = await j('GET', '/trips/applied', { token: dToken });
  const mineApp = (applied.json?.data || []).find((a) => a.trip_id === tid);
  check('GET /trips/applied (driver) → contains my application + its browse-safe joined trip', applied.status === 200 && !!mineApp && mineApp.id === aid && !!mineApp.trip?.from_city?.name && !has(mineApp.trip, 'passenger_phone'), `${JSON.stringify(applied.json?.data || applied.json?.error || '').slice(0, 200)}`);
  // Migration 038: an applied-but-not-yet-picked driver must NOT see the agent's name/phone.
  // can_reveal_agent now requires acceptance status in ('selected','accepted').
  check("GET /trips/applied (applied-only) → posted_by_name / posted_by_phone hidden",
    !mineApp?.trip?.posted_by_name && !mineApp?.trip?.posted_by_phone,
    `name=${JSON.stringify(mineApp?.trip?.posted_by_name)} phone=${JSON.stringify(mineApp?.trip?.posted_by_phone)}`);
  const pPreSelect = (await j('GET', `/trips/${tid}`, { token: dToken })).json?.data || {};
  check("GET /trips/:id (applied-only driver) → posted_by_name / posted_by_phone hidden",
    !pPreSelect.posted_by_name && !pPreSelect.posted_by_phone,
    `name=${JSON.stringify(pPreSelect.posted_by_name)} phone=${JSON.stringify(pPreSelect.posted_by_phone)}`);

  // Phase 2 of the two-step handshake: assign now produces `selected` (NOT `assigned`) and does
  // not generate the OTP — the driver must POST /accept first.
  const assign = await j('POST', `/trips/${tid}/assign`, { token, body: { acceptance_id: aid } });
  check('POST /trips/:id/assign → 200 + status selected + deadline + no OTP yet (handshake Phase 2)',
    assign.status === 200
      && assign.json?.data?.status === 'selected'
      && typeof assign.json?.data?.acceptance_deadline_at === 'string'
      && assign.json?.data?.driver_acceptance_status === 'pending'
      && !assign.json?.data?.passenger_otp,
    `status=${assign.status} ${JSON.stringify(assign.json?.data || assign.json?.error || '')}`);
  // The driver Accepts → trip flips to `accepted` (migration 036 renamed the enum
  // value from `assigned` → `accepted`) + the passenger OTP is generated.
  const accept = await j('POST', `/trips/${tid}/accept`, { token: dToken });
  const otp = accept.json?.data?.passenger_otp;
  check('POST /trips/:id/accept (selected driver) → 200 + status accepted + passenger_otp',
    accept.status === 200 && accept.json?.data?.status === 'accepted' && !!otp,
    `status=${accept.status} ${JSON.stringify(accept.json?.data || accept.json?.error || '')}`);

  // ── PII redaction on GET /trips/:id (trip now accepted) ───────────────
  const pPoster = (await j('GET', `/trips/${tid}`, { token })).json?.data || {};
  check('GET /trips/:id as the poster → passenger name+phone, posted_by_phone, passenger_otp; no hash', pPoster.passenger_name === 'Smoke Pax' && pPoster.passenger_phone === '+918888888888' && pPoster.posted_by_phone !== undefined && pPoster.passenger_otp === otp && !has(pPoster, 'passenger_otp_hash'), `${JSON.stringify({ n: pPoster.passenger_name, ph: pPoster.passenger_phone, pp: pPoster.posted_by_phone, otp: pPoster.passenger_otp })}`);
  const pDriver = (await j('GET', `/trips/${tid}`, { token: dToken })).json?.data || {};
  check('GET /trips/:id as the assigned driver → passenger name + posted_by_phone + passenger phone (hide=false); NOT passenger_otp', pDriver.passenger_name === 'Smoke Pax' && pDriver.posted_by_phone !== undefined && pDriver.passenger_phone === '+918888888888' && !has(pDriver, 'passenger_otp'), `${JSON.stringify({ n: pDriver.passenger_name, ph: pDriver.passenger_phone, otp: pDriver.passenger_otp })}`);
  const pRando = (await j('GET', `/trips/${tid}`, { token: randoToken })).json?.data || {};
  check('GET /trips/:id as a non-party → no passenger_name/phone, no posted_by_phone, no passenger_otp', !has(pRando, 'passenger_name') && !has(pRando, 'passenger_phone') && !has(pRando, 'posted_by_phone') && !has(pRando, 'passenger_otp'), `keys=${Object.keys(pRando).join(',')}`);

  // Counterparty verification checklist (after assignment):
  //  - poster sees the assigned driver's verification block (server-computed steps; no doc URLs)
  //  - assigned driver sees posted_by_verification (the poster's checklist)
  //  - rando sees neither
  check('GET /trips/:id as the poster → assigned_driver.verification present (kyc_status + steps)', !!pPoster.assigned_driver?.verification && typeof pPoster.assigned_driver.verification.kyc_status === 'string' && pPoster.assigned_driver.verification.steps && typeof pPoster.assigned_driver.verification.steps_total === 'number', `verif=${JSON.stringify(pPoster.assigned_driver?.verification)}`);
  check('GET /trips/:id as the assigned driver → posted_by_verification present', !!pDriver.posted_by_verification && typeof pDriver.posted_by_verification.kyc_status === 'string' && pDriver.posted_by_verification.steps, `verif=${JSON.stringify(pDriver.posted_by_verification)}`);
  check('GET /trips/:id as a non-party → no assigned_driver.verification + no posted_by_verification', !pRando.assigned_driver?.verification && !has(pRando, 'posted_by_verification'), `drv=${JSON.stringify(pRando.assigned_driver?.verification)} pbv=${JSON.stringify(pRando.posted_by_verification)}`);
  check('GET /trips/:id unauthenticated → 401', (await j('GET', `/trips/${tid}`)).status === 401);

  // by-otp (passenger portal) — still public
  const byOtp = await j('GET', `/trips/by-otp/${otp}`);
  check('GET /trips/by-otp/:otp → 200 + matching trip + assigned driver; no otp/hash', byOtp.status === 200 && byOtp.json?.data?.id === tid && !!byOtp.json?.data?.assigned_driver?.full_name && !has(byOtp.json?.data, 'passenger_otp_hash') && !has(byOtp.json?.data, 'passenger_otp'), `status=${byOtp.status} ${JSON.stringify(byOtp.json?.error || '')}`);
  check('GET /trips/by-otp/<no match> → 404', (await j('GET', '/trips/by-otp/000000')).status === 404);

  // start: a non-assigned caller and a wrong OTP are rejected; the assigned driver with the right OTP starts it
  check('POST /trips/:id/start by a non-assigned caller → 403', (await j('POST', `/trips/${tid}/start`, { token, body: { passenger_otp: otp, start_odo_url: 'test://odo/start', start_odo_reading: 10000 } })).status === 403);
  check('POST /trips/:id/start (assigned driver, wrong OTP) → 401', (await j('POST', `/trips/${tid}/start`, { token: dToken, body: { passenger_otp: '000001', start_odo_url: 'test://odo/start', start_odo_reading: 10000 } })).status === 401);
  check('POST /trips/:id/start (negative odo reading) → 422', (await j('POST', `/trips/${tid}/start`, { token: dToken, body: { passenger_otp: otp, start_odo_url: 'test://odo/start', start_odo_reading: -5 } })).status === 422);
  check('POST /trips/:id/start (missing odometer) → 422 MISSING_ODOMETER', (await j('POST', `/trips/${tid}/start`, { token: dToken, body: { passenger_otp: otp } })).status === 422);
  const start = await j('POST', `/trips/${tid}/start`, { token: dToken, body: { passenger_otp: otp, start_odo_url: 'test://odo/start', start_odo_reading: 10000 } });
  check('POST /trips/:id/start (assigned driver, valid OTP) → 200, in_progress', start.status === 200 && start.json?.data?.status === 'in_progress', `status=${start.status} ${JSON.stringify(start.json?.error || '')}`);

  // driver pings location → only the poster / assigned driver see the live position
  if (drvId) await j('PATCH', `/drivers/${drvId}/location`, { token: dToken, body: { current_lat: 13.05, current_lng: 80.2 } });
  const liveAsPoster = (await j('GET', `/trips/${tid}`, { token })).json?.data || {};
  check('GET /trips/:id (in_progress) as the poster → assigned-driver position + distance_to_destination_km', liveAsPoster.assigned_driver?.current_lat != null && typeof liveAsPoster.distance_to_destination_km === 'number', `driver=${JSON.stringify(liveAsPoster.assigned_driver)} dist=${liveAsPoster.distance_to_destination_km}`);
  if (Number.isFinite(toLat) && Number.isFinite(toLng)) {
    const expect1 = Math.round(haversineKm(13.05, 80.2, toLat, toLng) * 10) / 10;
    check('distance_to_destination_km matches a JS haversine recompute (±0.2 km)', typeof liveAsPoster.distance_to_destination_km === 'number' && Math.abs(liveAsPoster.distance_to_destination_km - expect1) <= 0.2, `api=${liveAsPoster.distance_to_destination_km} js=${expect1}`);
  }
  const byOtpLive = (await j('GET', `/trips/by-otp/${otp}`)).json?.data || {};
  check('GET /trips/by-otp/:otp (in_progress) → same driver position the poster sees', Math.abs(Number(byOtpLive.assigned_driver?.current_lat) - 13.05) < 1e-4 && byOtpLive.distance_to_destination_km === liveAsPoster.distance_to_destination_km, `lat=${byOtpLive.assigned_driver?.current_lat} dist=${byOtpLive.distance_to_destination_km}`);
  const liveAsRando = (await j('GET', `/trips/${tid}`, { token: randoToken })).json?.data || {};
  check('GET /trips/:id (in_progress) as a non-party → NO driver position, NO distance_to_destination_km', liveAsRando.assigned_driver?.current_lat == null && !('distance_to_destination_km' in liveAsRando), `driver=${JSON.stringify(liveAsRando.assigned_driver)} dist=${liveAsRando.distance_to_destination_km}`);
  const liveListPoster = await j('GET', `/trips?status=in_progress&posted_by_user_id=${post.json?.data?.posted_by_user_id}`, { token });
  check('GET /trips?status=in_progress&posted_by_user_id=<me> (poster) → contains the trip with the driver position', liveListPoster.status === 200 && (liveListPoster.json?.data || []).some((t) => t.id === tid && t.assigned_driver?.current_lat != null), `len=${liveListPoster.json?.data?.length}`);
  const liveListRando = await j('GET', '/trips?status=in_progress', { token: randoToken });
  const seen = (liveListRando.json?.data || []).find((t) => t.id === tid);
  check('GET /trips?status=in_progress as a non-party → if the trip is listed, its driver position is stripped', liveListRando.status === 200 && (!seen || seen.assigned_driver?.current_lat == null), `seen=${JSON.stringify(seen && seen.assigned_driver)}`);

  // a second ping, closer to the destination → distance decreases, last-seen advances
  if (drvId && Number.isFinite(toLat) && Number.isFinite(toLng)) {
    await j('PATCH', `/drivers/${drvId}/location`, { token: dToken, body: { current_lat: (13.05 + toLat) / 2, current_lng: (80.2 + toLng) / 2 } });
    const live2 = (await j('GET', `/trips/${tid}`, { token })).json?.data || {};
    check('a closer ping → distance_to_destination_km decreased, current_location_at advanced', typeof liveAsPoster.distance_to_destination_km === 'number' && typeof live2.distance_to_destination_km === 'number' && live2.distance_to_destination_km <= liveAsPoster.distance_to_destination_km && typeof live2.assigned_driver?.current_location_at === 'string' && (!liveAsPoster.assigned_driver?.current_location_at || new Date(live2.assigned_driver.current_location_at).getTime() >= new Date(liveAsPoster.assigned_driver.current_location_at).getTime()), `before=${liveAsPoster.distance_to_destination_km} after=${live2.distance_to_destination_km}`);
  }

  // "trips I'm driving"
  check('GET /trips?assigned_driver_id=me without auth → 401', (await j('GET', '/trips?assigned_driver_id=me')).status === 401);
  const drivingMe = await j('GET', '/trips?assigned_driver_id=me', { token: dToken });
  check('GET /trips?assigned_driver_id=me (assigned driver) → contains the trip', drivingMe.status === 200 && (drivingMe.json?.data || []).some((t) => t.id === tid), `len=${drivingMe.json?.data?.length}`);
  if (drvId) {
    const drivingById = await j('GET', `/trips?assigned_driver_id=${drvId}`, { token: randoToken });
    check('GET /trips?assigned_driver_id=<uuid> (authed, non-party) → contains the trip (browse-safe)', drivingById.status === 200 && (drivingById.json?.data || []).some((t) => t.id === tid), `len=${drivingById.json?.data?.length}`);
  }

  check('POST /trips/:id/complete (missing odometer) → 422 MISSING_ODOMETER', (await j('POST', `/trips/${tid}/complete`, { token: dToken, body: {} })).status === 422);
  check('POST /trips/:id/complete (assigned driver, end <= start) → 422', (await j('POST', `/trips/${tid}/complete`, { token: dToken, body: { end_odo_url: 'test://odo/end', end_odo_reading: 9000 } })).status === 422);
  check('POST /trips/:id/complete (assigned driver, negative toll) → 422', (await j('POST', `/trips/${tid}/complete`, { token: dToken, body: { end_odo_url: 'test://odo/end', end_odo_reading: 10120, toll_paid_by_driver: -5 } })).status === 422);
  const complete = await j('POST', `/trips/${tid}/complete`, { token: dToken, body: { driver_notes: 'smoke', end_odo_url: 'test://odo/end', end_odo_reading: 10120, toll_paid_by_driver: 50, driver_review_note: 'Polite passenger' } });
  check('POST /trips/:id/complete (assigned driver) → 200, completed', complete.status === 200 && complete.json?.data?.status === 'completed', `status=${complete.status} ${JSON.stringify(complete.json?.error || '')}`);
  const afterComplete = (await j('GET', `/trips/${tid}`, { token })).json?.data || {};
  check('completed trip no longer carries distance_to_destination_km', afterComplete.distance_to_destination_km === undefined || afterComplete.distance_to_destination_km === null, `got ${afterComplete.distance_to_destination_km}`);
  const posterNotifs = await j('GET', '/notifications', { token });
  check('completing a trip fires trip_completed notification to the agent', posterNotifs.status === 200 && (posterNotifs.json?.data || []).some((n) => n && n.type === 'trip_completed' && n.payload_json && n.payload_json.trip_id === tid), `notifs=${JSON.stringify((posterNotifs.json?.data || []).slice(0, 3).map((n) => ({ t: n?.type, p: n?.payload_json })))}`);

  // ── hide_passenger_phone: true ⇒ even the assigned driver does NOT see the passenger phone ──
  if (drvId) {
    const hidden = await j('POST', '/trips', { token, body: { ...baseTrip, passenger_phone: '+919999999999', hide_passenger_phone: true, pickup_at: futureIso(2) } });
    const hTid = hidden.json?.data?.id;
    const hAid = (await j('POST', `/trips/${hTid}/applicants`, { token: dToken, body: {} })).json?.data?.id;
    await j('POST', `/trips/${hTid}/assign`, { token, body: { acceptance_id: hAid } });
    const hOtp = (await j('POST', `/trips/${hTid}/accept`, { token: dToken })).json?.data?.passenger_otp;
    await j('POST', `/trips/${hTid}/start`, { token: dToken, body: { passenger_otp: hOtp, start_odo_url: 'test://odo/start', start_odo_reading: 11000 } });
    const hDriverView = (await j('GET', `/trips/${hTid}`, { token: dToken })).json?.data || {};
    check('hide_passenger_phone=true: assigned driver sees passenger_name but NOT passenger_phone', hDriverView.passenger_name === 'Smoke Pax' && !has(hDriverView, 'passenger_phone'), `${JSON.stringify({ n: hDriverView.passenger_name, ph: hDriverView.passenger_phone })}`);
    const hPosterView = (await j('GET', `/trips/${hTid}`, { token })).json?.data || {};
    check('hide_passenger_phone=true: the poster still sees the passenger phone', hPosterView.passenger_phone === '+919999999999', `ph=${hPosterView.passenger_phone}`);
    await j('POST', `/trips/${hTid}/complete`, { token: dToken, body: { end_odo_url: 'test://odo/end', end_odo_reading: 11100 } });
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

  // PR #229 deferred `match_alerts_for_trip` to a background microtask after the POST /trips
  // response, so the alert_match notification arrives asynchronously (typically <500ms). Poll
  // for up to 3s before asserting — long enough for the deferred work, short enough that a
  // real regression still fails fast. The same pattern applies to upsert_passenger_from_trip.
  let notifs, matched;
  for (let i = 0; i < 6; i++) {
    notifs = await j('GET', '/notifications', { token: alertToken });
    matched = (notifs.json?.data || []).find((n) => n && n.type === 'alert_match' && n.payload_json && n.payload_json.trip_id === t2?.id);
    if (matched) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  check('POST /trips inside a saved alert\'s radius → alert_match notification fired for the alert owner (deferred via PR #229)', notifs.status === 200 && !!matched, `notifs=${JSON.stringify((notifs.json?.data || []).map((n) => ({ t: n?.type, p: n?.payload_json })))}`);

  // ── deactivation: a deactivated driver can't apply, and can't be assigned ──────────────────────
  const newTrip = async (extra) => (await j('POST', '/trips', { token, body: { ...baseTrip, hide_passenger_phone: false, passenger_count: 1, pickup_at: futureIso(3), ...(extra || {}) } })).json?.data?.id;
  const dToken2 = await signIn('driver', 'Deact Test Driver');
  const drv2Id = (await j('POST', '/drivers', { token: dToken2, body: { full_name: 'Deact Test Driver' } })).json?.data?.id;
  if (drv2Id) await j('PATCH', `/drivers/${drv2Id}/kyc`, { token: adminToken, body: { kyc_status: 'approved', note: 'smoke' } });
  const tA = await newTrip();
  const applyDeact = await j('POST', `/trips/${tA}/applicants`, { token: dToken2, body: {} });
  const aA = applyDeact.json?.data?.id;
  check('a KYC-approved driver applies to a fresh trip → 200', applyDeact.status === 200 && !!aA, `status=${applyDeact.status} ${JSON.stringify(applyDeact.json?.error || '')}`);
  const deact2 = await j('PATCH', `/drivers/${drv2Id}/active`, { token: adminToken, body: { is_active: false, reason: 'smoke' } });
  check('PATCH /drivers/:id/active {is_active:false} (admin) → 200 + is_active false', deact2.status === 200 && deact2.json?.data?.is_active === false, `status=${deact2.status} ${JSON.stringify(deact2.json?.error || '')}`);
  const tB = await newTrip();
  const applyWhileDeact = await j('POST', `/trips/${tB}/applicants`, { token: dToken2, body: {} });
  check('POST /trips/:id/applicants while the driver is deactivated → 403 ACCOUNT_SUSPENDED', applyWhileDeact.status === 403 && applyWhileDeact.json?.error?.code === 'ACCOUNT_SUSPENDED', `status=${applyWhileDeact.status} ${JSON.stringify(applyWhileDeact.json?.error || '')}`);
  const assignDeact = await j('POST', `/trips/${tA}/assign`, { token, body: { acceptance_id: aA } });
  check('POST /trips/:id/assign with a deactivated driver\'s acceptance → 422', assignDeact.status === 422, `status=${assignDeact.status} ${JSON.stringify(assignDeact.json?.error || '')}`);
  await j('PATCH', `/drivers/${drv2Id}/active`, { token: adminToken, body: { is_active: true } });

  // ── Phase 4: trip invites ─────────────────────────────────────────────────────
  // Need an invitable driver (active + KYC-approved). dToken / drvId from earlier already qualify.
  const inviteTripId = await newTrip({ pickup_at: futureIso(4) });
  const inviteNoAuth = await j('POST', `/trips/${inviteTripId}/invites`, { body: { driver_ids: [drvId] } });
  check('POST /trips/:id/invites without auth → 401', inviteNoAuth.status === 401, `status=${inviteNoAuth.status}`);
  const inviteByRando = await j('POST', `/trips/${inviteTripId}/invites`, { token: randoToken, body: { driver_ids: [drvId] } });
  check('POST /trips/:id/invites by a non-poster → 403', inviteByRando.status === 403, `status=${inviteByRando.status}`);
  const inviteBad = await j('POST', `/trips/${inviteTripId}/invites`, { token, body: {} });
  check('POST /trips/:id/invites without driver_ids → 422', inviteBad.status === 422, `status=${inviteBad.status}`);
  const invited = await j('POST', `/trips/${inviteTripId}/invites`, { token, body: { driver_ids: [drvId] } });
  const inviteId = invited.json?.data?.created?.[0]?.id;
  check('POST /trips/:id/invites (poster) → 200 + created row + invitee_count', invited.status === 200 && !!inviteId, `status=${invited.status} ${JSON.stringify(invited.json?.data || invited.json?.error || '')}`);
  const inviteList = await j('GET', `/trips/${inviteTripId}/invites`, { token });
  check('GET /trips/:id/invites (poster) → 200 + array with the driver attached', inviteList.status === 200 && Array.isArray(inviteList.json?.data) && inviteList.json.data.length >= 1 && !!inviteList.json.data[0]?.driver?.display_handle, `${JSON.stringify(inviteList.json?.data || '').slice(0, 200)}`);
  // Privacy rule (2026-05-19 update): driver name + photo are commercial branding — always
  // visible so the agent can recognise who they invited. Phone is still gated until the
  // driver reciprocates by applying.
  const pendingInvitee = (inviteList.json?.data || []).find((r) => r.driver?.id === drvId);
  check('GET /trips/:id/invites (poster) → name visible, phone HIDDEN while pending',
    !!pendingInvitee && pendingInvitee.status === 'pending'
      && typeof pendingInvitee.driver?.full_name === 'string' && pendingInvitee.driver.full_name.length > 0
      && pendingInvitee.driver?.phone === undefined,
    `status=${pendingInvitee?.status} full_name=${JSON.stringify(pendingInvitee?.driver?.full_name)} phone=${JSON.stringify(pendingInvitee?.driver?.phone)}`);
  // The invited driver can see the trip via ?invited=me + sees the agent's name pre-revealed.
  const invitedTab = await j('GET', '/trips?invited=me', { token: dToken });
  const invitedTrip = (invitedTab.json?.data || []).find((t) => t.id === inviteTripId);
  check('GET /trips?invited=me (invited driver) → contains the trip + posted_by_name pre-revealed (Phase 4)',
    invitedTab.status === 200 && !!invitedTrip && typeof invitedTrip.posted_by_name === 'string' && invitedTrip.posted_by_name.length > 0,
    `len=${invitedTab.json?.data?.length} posted_by_name=${JSON.stringify(invitedTrip?.posted_by_name)}`);
  // ?invited=me rows carry the caller's invitation_id + invitation_status so the UI can decline without an extra round-trip.
  check('GET /trips?invited=me → invitation_id + invitation_status stamped on the row (pending)',
    !!invitedTrip && invitedTrip.invitation_id === inviteId && invitedTrip.invitation_status === 'pending',
    `invitation_id=${JSON.stringify(invitedTrip?.invitation_id)} invitation_status=${JSON.stringify(invitedTrip?.invitation_status)}`);
  // Driver declines the invite.
  const declineByOther = await j('POST', `/trips/${inviteTripId}/invites/${inviteId}/decline`, { token: token, body: { reason: 'busy' } });
  check('POST /trips/:id/invites/:invite_id/decline by non-invitee → 403', declineByOther.status === 403, `status=${declineByOther.status}`);
  const declineInvite = await j('POST', `/trips/${inviteTripId}/invites/${inviteId}/decline`, { token: dToken, body: { reason: 'too far' } });
  check('POST /trips/:id/invites/:invite_id/decline (invitee) → 200', declineInvite.status === 200, `status=${declineInvite.status} ${JSON.stringify(declineInvite.json?.error || '')}`);
  // After decline the trip drops out of the driver's Invited tab (status='declined' is filtered out server-side).
  const invitedAfter = await j('GET', '/trips?invited=me', { token: dToken });
  const stillThere = (invitedAfter.json?.data || []).some((t) => t.id === inviteTripId);
  check('GET /trips?invited=me after decline → trip no longer in the driver\'s Invited list', invitedAfter.status === 200 && !stillThere, `still_there=${stillThere}`);
  // Re-invite + agent withdraws.
  const reInvite = await j('POST', `/trips/${inviteTripId}/invites`, { token, body: { driver_ids: [drvId] } });
  const reInviteId = reInvite.json?.data?.created?.[0]?.id;
  check('POST /trips/:id/invites again → 200 + same row id (upserts back to pending)', reInvite.status === 200 && !!reInviteId, `status=${reInvite.status} ${JSON.stringify(reInvite.json?.data || '')}`);
  const withdrawInvite = await j('DELETE', `/trips/${inviteTripId}/invites/${reInviteId}`, { token });
  check('DELETE /trips/:id/invites/:invite_id (poster) → 200', withdrawInvite.status === 200, `status=${withdrawInvite.status}`);

  if (failures) { console.error(`[test-trips] ${failures} check(s) failed`); process.exit(1); }
  console.log('[test-trips] all checks passed');
})().catch((e) => { console.error('[test-trips] error:', e); process.exit(1); });
