#!/usr/bin/env node
/**
 * Smoke test for the trip-execution feature (migration 059 + /trips edge fn):
 *   - signed-URL endpoints for the start / end odometer photos
 *   - start trip carries the start odo (photo url + integer reading)
 *   - complete trip carries the end odo + toll
 *   - the compute_trip_final_payout trigger writes:
 *       final_total_fare, extra_distance_km, extra_km_fare, toll_amount, final_driver_payout
 *   - validation: end_odo_reading must exceed start_odo_reading
 *   - validation: toll_paid_by_driver cannot be negative
 *   - by-otp passenger view: bill items present (show_fare_to_passenger=true); payout hidden
 *
 *   ADMIN_API_BASE=https://<ref>.supabase.co/functions/v1 node scripts/test-trip-execution.cjs
 */
const BASE = (process.env.ADMIN_API_BASE || (process.env.VITE_API_BASE_URL ? `${process.env.VITE_API_BASE_URL}/functions/v1` : '')).replace(/\/+$/, '');
if (!BASE) { console.log('[test-trip-execution] ADMIN_API_BASE not set — skipping.'); process.exit(0); }

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
function randomPhone() { return `+919900${Math.floor(100000 + Math.random() * 900000)}`; }
function futureIso(minsAhead = 30) { return new Date(Date.now() + minsAhead * 60_000).toISOString(); }
async function signIn(role, name) {
  const phone = randomPhone();
  await j('POST', '/auth/auth/request-otp', { body: { phone } });
  const r = await j('POST', '/auth/auth/verify-otp', { body: { phone, otp: '12345', display_name: name, role } });
  return { token: r.json?.data?.access_token, userId: r.json?.data?.user?.id };
}

(async () => {
  console.log(`[test-trip-execution] BASE=${BASE}`);

  const admin = await signIn('admin', 'Trip-Exec Admin');
  const agent = await signIn('trip_manager', 'Trip-Exec Agent');
  const driver = await signIn('driver', 'Trip-Exec Driver');
  check('signed in admin / agent / driver', !!admin.token && !!agent.token && !!driver.token);

  const cityIds = ((await j('GET', '/admin/cities')).json?.data || []).map((c) => c.id);
  const carTypeId = ((await j('GET', '/admin/car-types')).json?.data || [])[0]?.id;
  if (cityIds.length < 2 || !carTypeId) { console.error('Need >=2 cities + 1 car type'); process.exit(1); }

  const agentRow = await j('POST', '/agents', { token: agent.token, body: { full_name: 'Trip-Exec Agent', business_name: 'TX Travels' } });
  await j('PATCH', `/agents/${agentRow.json?.data?.id}/kyc`, { token: admin.token, body: { kyc_status: 'approved', note: 'trip-exec' } });
  const drvRow = await j('POST', '/drivers', { token: driver.token, body: { full_name: 'Trip-Exec Driver' } });
  await j('PATCH', `/drivers/${drvRow.json?.data?.id}/kyc`, { token: admin.token, body: { kyc_status: 'approved', note: 'trip-exec' } });

  // Trip economics — accepted 100km, ₹14/km → total_fare 1400, commission 10%, gst 50, bata 200.
  // Baseline payout = 1400 - 140 - 50 + 200 = 1410.
  const baseTrip = {
    from_city_id: cityIds[0], to_city_id: cityIds[1],
    pickup_at: futureIso(), expected_distance_km: 100,
    car_type_id: carTypeId, rate_per_km: 14, commission_pct: 10, gst_amount: 50, driver_bata: 200,
    passenger_name: 'TX Pax', passenger_phone: '+918888777766', passenger_count: 2,
    hide_passenger_phone: false, show_fare_to_passenger: true,
  };
  const post = await j('POST', '/trips', { token: agent.token, body: baseTrip });
  const tripId = post.json?.data?.id;
  check('POST /trips → 200 + id', post.status === 200 && !!tripId, `status=${post.status}`);

  const apply = await j('POST', `/trips/${tripId}/applicants`, { token: driver.token, body: { applicant_message: 'tx' } });
  await j('POST', `/trips/${tripId}/assign`, { token: agent.token, body: { acceptance_id: apply.json?.data?.id } });
  const accept = await j('POST', `/trips/${tripId}/accept`, { token: driver.token });
  const otp = accept.json?.data?.passenger_otp;
  check('accept → plaintext OTP returned', !!otp, `body=${JSON.stringify(accept.json)}`);

  // === Signed URL endpoints ===
  const startSU = await j('POST', `/trips/${tripId}/start-odo-upload-url`, { token: driver.token });
  check('POST /trips/:id/start-odo-upload-url → 200 + signed_url', startSU.status === 200 && !!startSU.json?.data?.signed_url && startSU.json?.data?.bucket === 'trip-executions-photos', `body=${JSON.stringify(startSU.json)}`);
  // end-odo URL requires status=in_progress
  const endSUEarly = await j('POST', `/trips/${tripId}/end-odo-upload-url`, { token: driver.token });
  check('POST /trips/:id/end-odo-upload-url before /start → 409 CONFLICT', endSUEarly.status === 409, `status=${endSUEarly.status}`);

  // === Validation: missing odometer on /start ===
  const startNoOdo = await j('POST', `/trips/${tripId}/start`, { token: driver.token, body: { passenger_otp: otp } });
  check('POST /trips/:id/start without odo fields → 422 MISSING_ODOMETER', startNoOdo.status === 422 && startNoOdo.json?.error?.code === 'MISSING_ODOMETER', `status=${startNoOdo.status} code=${startNoOdo.json?.error?.code}`);

  // === Start with odometer ===
  const start = await j('POST', `/trips/${tripId}/start`, { token: driver.token, body: { passenger_otp: otp, start_odo_url: 'test://odo/start', start_odo_reading: 50000 } });
  check('POST /trips/:id/start with odo → 200, in_progress', start.status === 200 && start.json?.data?.status === 'in_progress', `status=${start.status} err=${JSON.stringify(start.json?.error)}`);
  check('GET /trips/:id (after start) carries flattened started_at + start_odo_reading on the row', !!start.json?.data?.execution?.started_at && start.json?.data?.execution?.start_odo_reading === 50000, `execution=${JSON.stringify(start.json?.data?.execution)}`);

  const endSU = await j('POST', `/trips/${tripId}/end-odo-upload-url`, { token: driver.token });
  check('POST /trips/:id/end-odo-upload-url (in_progress) → 200', endSU.status === 200 && !!endSU.json?.data?.signed_url, `status=${endSU.status}`);

  // === Validation ===
  const completeNoOdo = await j('POST', `/trips/${tripId}/complete`, { token: driver.token, body: {} });
  check('complete without odo fields → 422 MISSING_ODOMETER', completeNoOdo.status === 422 && completeNoOdo.json?.error?.code === 'MISSING_ODOMETER', `status=${completeNoOdo.status} code=${completeNoOdo.json?.error?.code}`);
  const endLT = await j('POST', `/trips/${tripId}/complete`, { token: driver.token, body: { end_odo_url: 'test://odo/end', end_odo_reading: 49000 } });
  check('complete with end_odo <= start → 422', endLT.status === 422, `status=${endLT.status}`);
  const negToll = await j('POST', `/trips/${tripId}/complete`, { token: driver.token, body: { end_odo_url: 'test://odo/end', end_odo_reading: 50150, toll_paid_by_driver: -5 } });
  check('complete with negative toll → 422', negToll.status === 422, `status=${negToll.status}`);

  // === Complete with overage + toll ===
  // start=50000, end=50125 → actual=125km, expected=100 → extra=25km
  // extra_fare = 25 * 14 = 350
  // final_total_fare = 1400 + 350 + 75 (toll) = 1825
  // final_payout = (1400 + 350) - (1400+350)*0.10 - 50 + 200 + 75 = 1750 - 175 - 50 + 200 + 75 = 1800
  const complete = await j('POST', `/trips/${tripId}/complete`, {
    token: driver.token,
    body: { end_odo_url: 'test://odo/end', end_odo_reading: 50125, toll_paid_by_driver: 75, driver_review_note: 'Polite passenger; pay on time.' },
  });
  check('POST /trips/:id/complete → 200', complete.status === 200, `status=${complete.status} err=${JSON.stringify(complete.json?.error)}`);

  const tripView = (await j('GET', `/trips/${tripId}`, { token: driver.token })).json?.data;
  check('trip.extra_distance_km = 25', Number(tripView?.extra_distance_km) === 25, `got=${tripView?.extra_distance_km}`);
  check('trip.extra_km_fare = 350', Number(tripView?.extra_km_fare) === 350, `got=${tripView?.extra_km_fare}`);
  check('trip.toll_amount = 75', Number(tripView?.toll_amount) === 75, `got=${tripView?.toll_amount}`);
  check('trip.final_total_fare = 1825', Number(tripView?.final_total_fare) === 1825, `got=${tripView?.final_total_fare}`);
  check('trip.final_driver_payout = 1800', Number(tripView?.final_driver_payout) === 1800, `got=${tripView?.final_driver_payout}`);
  check('GET /trips/:id (after complete) carries flattened completed_at + end_odo_reading + actual_distance_km on the embed', !!tripView?.execution?.completed_at && tripView?.execution?.end_odo_reading === 50125 && Number(tripView?.execution?.actual_distance_km) === 125, `execution=${JSON.stringify(tripView?.execution)}`);

  // === Passenger view (by OTP) ===
  const byOtp = (await j('GET', `/trips/by-otp/${otp}`)).json?.data;
  check('by-otp: final_total_fare present (passenger sees their bill)', Number(byOtp?.final_total_fare) === 1825, `got=${byOtp?.final_total_fare}`);
  check('by-otp: extra_km_fare present', Number(byOtp?.extra_km_fare) === 350, `got=${byOtp?.extra_km_fare}`);
  check('by-otp: toll_amount present', Number(byOtp?.toll_amount) === 75, `got=${byOtp?.toll_amount}`);
  check('by-otp: final_driver_payout NOT exposed', byOtp?.final_driver_payout === undefined || byOtp?.final_driver_payout === null, `got=${byOtp?.final_driver_payout}`);
  check('by-otp: driver_payout NOT exposed', byOtp?.driver_payout === undefined || byOtp?.driver_payout === null, `got=${byOtp?.driver_payout}`);

  // === No-overage trip (sanity: extra_distance_km = 0) ===
  await j('POST', '/wallet/topup', { token: agent.token, body: { amount_paise: 50000 } }).catch(() => null);
  await j('POST', '/wallet/topup', { token: driver.token, body: { amount_paise: 50000 } }).catch(() => null);
  const post2 = await j('POST', '/trips', { token: agent.token, body: baseTrip });
  const tid2 = post2.json?.data?.id;
  const apply2 = await j('POST', `/trips/${tid2}/applicants`, { token: driver.token, body: {} });
  await j('POST', `/trips/${tid2}/assign`, { token: agent.token, body: { acceptance_id: apply2.json?.data?.id } });
  const acc2 = await j('POST', `/trips/${tid2}/accept`, { token: driver.token });
  await j('POST', `/trips/${tid2}/start`, { token: driver.token, body: { passenger_otp: acc2.json?.data?.passenger_otp, start_odo_url: 'test://odo/start', start_odo_reading: 60000 } });
  await j('POST', `/trips/${tid2}/complete`, { token: driver.token, body: { end_odo_url: 'test://odo/end', end_odo_reading: 60100, toll_paid_by_driver: 0 } });
  const t2 = (await j('GET', `/trips/${tid2}`, { token: driver.token })).json?.data;
  check('no-overage: extra_distance_km=0, extra_km_fare=0', Number(t2?.extra_distance_km) === 0 && Number(t2?.extra_km_fare) === 0, `got ${t2?.extra_distance_km}/${t2?.extra_km_fare}`);
  check('no-overage: final_total_fare = total_fare', Number(t2?.final_total_fare) === Number(t2?.total_fare), `got=${t2?.final_total_fare} total=${t2?.total_fare}`);
  // baseline payout 1410 (no toll, no overage)
  check('no-overage: final_driver_payout = baseline 1410', Number(t2?.final_driver_payout) === 1410, `got=${t2?.final_driver_payout}`);

  console.log('');
  if (failures) { console.error(`[test-trip-execution] ${failures} failure(s)`); process.exit(1); }
  console.log('[test-trip-execution] all checks passed');
})().catch((err) => { console.error('[test-trip-execution] fatal', err); process.exit(2); });
