#!/usr/bin/env node
/**
 * Smoke test for the /reviews edge function. Bootstraps a full trip (post → apply → assign →
 * accept → OTP-start → complete) so a review can actually be posted.
 *   REVIEWS_API_BASE=https://<ref>.supabase.co/functions/v1 node scripts/test-reviews.cjs
 * Skips cleanly (exit 0) if REVIEWS_API_BASE is unset.
 *
 * Covers: public list (200 + array), 404, unauth post (401), bad direction/score (422),
 * not-completed trip (422), happy path (both directions; ratee derived; rater role from caller),
 * unique (trip,direction) (409), filters (trip_id / ratee_user_id / direction), report (401/404/200),
 * a deactivated driver can't post a review (403 ACCOUNT_SUSPENDED), admin moderation.
 */
const BASE = (process.env.REVIEWS_API_BASE || (process.env.VITE_API_BASE_URL ? `${process.env.VITE_API_BASE_URL}/functions/v1` : '')).replace(/\/+$/, '');
if (!BASE) {
  console.log('[test-reviews] REVIEWS_API_BASE not set — skipping.');
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
async function signIn(role) {
  const phone = `+919900${Math.floor(100000 + Math.random() * 900000)}`;
  await j('POST', '/auth/auth/request-otp', { body: { phone } });
  const auth = await j('POST', '/auth/auth/verify-otp', { body: { phone, otp: '123456', display_name: `Smoke ${role}`, role } });
  return { token: auth.json?.data?.access_token, userId: auth.json?.data?.user?.id };
}
async function postTrip(agentToken, cityA, cityB, carTypeId) {
  return j('POST', '/trips', { token: agentToken, body: { from_city_id: cityA, to_city_id: cityB, pickup_at: new Date(Date.now() + 86400000).toISOString(), car_type_id: carTypeId, expected_distance_km: 120, rate_per_km: 14, passenger_name: 'Smoke Pax', passenger_phone: '+910000000000', passenger_count: 1, hide_passenger_phone: false } });
}

(async () => {
  console.log(`[test-reviews] base = ${BASE}`);

  const agent = await signIn('trip_manager');
  const driver = await signIn('driver');
  const stranger = await signIn('driver');
  const admin = await signIn('admin');
  check('auth tokens + user ids obtained', !!agent.token && !!agent.userId && !!driver.token && !!driver.userId && !!stranger.token && !!admin.token);
  if (!agent.token || !driver.token || !stranger.token || !admin.token) process.exit(1);

  const drv = await j('POST', '/drivers', { token: driver.token, body: { full_name: 'Review Smoke Driver' } });
  const driverId = drv.json?.data?.id;
  check('driver profile created', drv.status === 200 && !!driverId && drv.json?.data?.user_id === driver.userId, `status=${drv.status}`);
  const ag = await j('POST', '/agents', { token: agent.token, body: { full_name: 'Review Smoke Agent', business_name: 'Smoke Travels' } });
  const agentProfileId = ag.json?.data?.id;
  check('agent profile created', ag.status === 200 && !!agentProfileId, `status=${ag.status}`);
  // posting trips / applying both require an approved KYC — bump the driver and agent
  if (driverId) await j('PATCH', `/drivers/${driverId}/kyc`, { token: admin.token, body: { kyc_status: 'approved', note: 'smoke' } });
  if (agentProfileId) await j('PATCH', `/agents/${agentProfileId}/kyc`, { token: admin.token, body: { kyc_status: 'approved', note: 'smoke' } });

  const cities = (await j('GET', '/admin/cities')).json?.data || [];
  const carTypes = (await j('GET', '/admin/car-types')).json?.data || [];
  const cityA = cities[0]?.id, cityB = cities[1]?.id || cityA, carTypeId = carTypes[0]?.id;
  check('have cities + a car type', !!cityA && !!carTypeId);
  if (!cityA || !carTypeId || !driverId) process.exit(1);

  // ── bootstrap a completed trip ─────────────────────────────────────────
  const trip = await postTrip(agent.token, cityA, cityB, carTypeId);
  const tripId = trip.json?.data?.id;
  check('trip posted', trip.status === 200 && !!tripId, `status=${trip.status} ${JSON.stringify(trip.json?.error || '')}`);
  const apply = await j('POST', `/trips/${tripId}/applicants`, { token: driver.token, body: {} });
  const acceptanceId = apply.json?.data?.id;
  check('driver applied', apply.status === 200 && !!acceptanceId, `status=${apply.status} ${JSON.stringify(apply.json?.error || '')}`);
  // Two-step handshake (migration 030): /assign flips status to `selected` (no OTP),
  // then the driver's /accept flips to `accepted` (migration 036 renamed from `assigned`)
  // and generates the OTP.
  const assign = await j('POST', `/trips/${tripId}/assign`, { token: agent.token, body: { acceptance_id: acceptanceId } });
  check('trip selected (handshake Phase 2)', assign.status === 200 && assign.json?.data?.status === 'selected', `status=${assign.status} ${JSON.stringify(assign.json?.error || assign.json?.data?.status || '')}`);
  const accept = await j('POST', `/trips/${tripId}/accept`, { token: driver.token });
  const otp = accept.json?.data?.passenger_otp;
  check('trip accepted + OTP returned', accept.status === 200 && accept.json?.data?.status === 'accepted' && !!otp, `status=${accept.status} ${JSON.stringify(accept.json?.error || '')}`);
  const start = await j('POST', `/trips/${tripId}/start`, { token: driver.token, body: { passenger_otp: otp, start_odo_url: 'test://odo/start', start_odo_reading: 10000 } });
  check('trip started', start.status === 200, `status=${start.status} ${JSON.stringify(start.json?.error || '')}`);
  const complete = await j('POST', `/trips/${tripId}/complete`, { token: driver.token, body: { end_odo_url: 'test://odo/end', end_odo_reading: 10100 } });
  check('trip completed', complete.status === 200 && complete.json?.data?.status === 'completed', `status=${complete.status} ${JSON.stringify(complete.json?.error || '')}`);
  if (!tripId) process.exit(1);

  // a second trip left in 'open' state — for the "not completed" 422 case
  const openTrip = await postTrip(agent.token, cityA, cityB, carTypeId);
  const openTripId = openTrip.json?.data?.id;

  // ── reviews ────────────────────────────────────────────────────────────
  const list = await j('GET', '/reviews');
  check('GET /reviews → 200 + array', list.status === 200 && Array.isArray(list.json?.data), `status=${list.status}`);
  const g404 = await j('GET', `/reviews/${NONE}`);
  check('GET /reviews/<nonexistent> → 404', g404.status === 404, `status=${g404.status}`);

  const noAuth = await j('POST', '/reviews', { body: { trip_id: tripId, direction: 'manager_to_driver', score: 5 } });
  check('POST /reviews without auth → 401', noAuth.status === 401, `status=${noAuth.status}`);
  const badDir = await j('POST', '/reviews', { token: agent.token, body: { trip_id: tripId, direction: 'nonsense', score: 5 } });
  check('POST /reviews with a bad direction → 422', badDir.status === 422, `status=${badDir.status}`);
  const badScore = await j('POST', '/reviews', { token: agent.token, body: { trip_id: tripId, direction: 'manager_to_driver', score: 7 } });
  check('POST /reviews with score out of range → 422', badScore.status === 422, `status=${badScore.status}`);
  if (openTripId) {
    const notDone = await j('POST', '/reviews', { token: agent.token, body: { trip_id: openTripId, direction: 'manager_to_driver', score: 5 } });
    check('POST /reviews on a non-completed trip → 422', notDone.status === 422, `status=${notDone.status}`);
  }

  // agent → driver
  const r1 = await j('POST', '/reviews', { token: agent.token, body: { trip_id: tripId, direction: 'manager_to_driver', score: 5, comment: 'Smooth ride', tag_ids: [] } });
  const reviewId = r1.json?.data?.id;
  check('POST /reviews (manager_to_driver) → 200 + id + rater_user_id + rater_role', r1.status === 200 && !!reviewId && r1.json?.data?.rater_user_id === agent.userId && r1.json?.data?.rater_role === 'trip_manager', `status=${r1.status} ${JSON.stringify(r1.json?.error || r1.json?.data || '')}`);
  check('POST /reviews derives ratee_user_id (the driver)', r1.json?.data?.ratee_user_id === driver.userId, `got=${r1.json?.data?.ratee_user_id} want=${driver.userId}`);
  check('POST /reviews persists score', r1.json?.data?.score === 5, `got=${r1.json?.data?.score}`);
  const dup = await j('POST', '/reviews', { token: agent.token, body: { trip_id: tripId, direction: 'manager_to_driver', score: 3 } });
  check('POST /reviews duplicate (trip_id, direction) → 409', dup.status === 409, `status=${dup.status}`);

  // a deactivated driver can't leave reviews
  const deactDrv = await j('PATCH', `/drivers/${driverId}/active`, { token: admin.token, body: { is_active: false, reason: 'smoke' } });
  check('PATCH /drivers/:id/active {is_active:false} (admin) → 200', deactDrv.status === 200 && deactDrv.json?.data?.is_active === false, `status=${deactDrv.status} ${JSON.stringify(deactDrv.json?.error || '')}`);
  const reviewWhileDeact = await j('POST', '/reviews', { token: driver.token, body: { trip_id: tripId, direction: 'driver_to_manager', score: 4 } });
  check('POST /reviews while the driver is deactivated → 403 ACCOUNT_SUSPENDED', reviewWhileDeact.status === 403 && reviewWhileDeact.json?.error?.code === 'ACCOUNT_SUSPENDED', `status=${reviewWhileDeact.status} ${JSON.stringify(reviewWhileDeact.json?.error || '')}`);
  const reactDrv = await j('PATCH', `/drivers/${driverId}/active`, { token: admin.token, body: { is_active: true } });
  check('PATCH /drivers/:id/active {is_active:true} (admin) → 200', reactDrv.status === 200 && reactDrv.json?.data?.is_active === true, `status=${reactDrv.status}`);

  // driver → agent
  const r2 = await j('POST', '/reviews', { token: driver.token, body: { trip_id: tripId, direction: 'driver_to_manager', score: 4, comment: 'Clear instructions' } });
  check('POST /reviews (driver_to_manager) → 200 + ratee = the trip poster', r2.status === 200 && r2.json?.data?.rater_user_id === driver.userId && r2.json?.data?.ratee_user_id === agent.userId, `status=${r2.status} ${JSON.stringify(r2.json?.error || r2.json?.data || '')}`);
  if (!reviewId) process.exit(1);

  // ── filters ────────────────────────────────────────────────────────────
  const byTrip = await j('GET', `/reviews?trip_id=${tripId}`);
  check('GET /reviews?trip_id= → 2 reviews', byTrip.status === 200 && (byTrip.json?.data || []).filter((r) => r.trip_id === tripId).length === 2, `len=${(byTrip.json?.data || []).length}`);
  const byRatee = await j('GET', `/reviews?ratee_user_id=${driver.userId}`);
  check('GET /reviews?ratee_user_id= → contains the manager_to_driver review', byRatee.status === 200 && (byRatee.json?.data || []).some((r) => r.id === reviewId), `len=${byRatee.json?.data?.length}`);
  const byDir = await j('GET', `/reviews?trip_id=${tripId}&direction=driver_to_manager`);
  check('GET /reviews?direction= → only that direction', byDir.status === 200 && (byDir.json?.data || []).every((r) => r.direction === 'driver_to_manager') && (byDir.json?.data || []).length >= 1, `data=${JSON.stringify((byDir.json?.data || []).map((r) => r.direction))}`);

  // ── report ─────────────────────────────────────────────────────────────
  const reportNoAuth = await j('POST', `/reviews/${reviewId}/report`, { body: { flag_reason: 'spam' } });
  check('POST /reviews/:id/report without auth → 401', reportNoAuth.status === 401, `status=${reportNoAuth.status}`);
  const report404 = await j('POST', `/reviews/${NONE}/report`, { token: stranger.token, body: { flag_reason: 'spam' } });
  check('POST /reviews/<nonexistent>/report → 404', report404.status === 404, `status=${report404.status}`);
  const reported = await j('POST', `/reviews/${reviewId}/report`, { token: stranger.token, body: { flag_reason: 'inappropriate' } });
  check('POST /reviews/:id/report (any authed user) → 200 + is_flagged', reported.status === 200 && reported.json?.data?.is_flagged === true, `status=${reported.status} ${JSON.stringify(reported.json?.error || '')}`);

  // ── admin moderation ───────────────────────────────────────────────────
  const modNoAuth = await j('POST', `/reviews/${reviewId}/moderate`, { body: { clear_flag: true } });
  check('POST /reviews/:id/moderate without auth → 401', modNoAuth.status === 401, `status=${modNoAuth.status}`);
  const modNotAdmin = await j('POST', `/reviews/${reviewId}/moderate`, { token: stranger.token, body: { clear_flag: true } });
  check('POST /reviews/:id/moderate by a non-admin → 403', modNotAdmin.status === 403, `status=${modNotAdmin.status}`);
  if (admin.token) {
    const flaggedQueue = await j('GET', '/reviews?flagged=true', { token: admin.token });
    check('GET /reviews?flagged=true (admin) → contains the flagged review', flaggedQueue.status === 200 && (flaggedQueue.json?.data || []).some((r) => r.id === reviewId), `len=${flaggedQueue.json?.data?.length}`);
    const moderated = await j('POST', `/reviews/${reviewId}/moderate`, { token: admin.token, body: { clear_flag: true, is_published: true } });
    check('POST /reviews/:id/moderate (admin) → 200 + flag cleared', moderated.status === 200 && moderated.json?.data?.is_flagged === false && moderated.json?.data?.is_published === true, `status=${moderated.status} ${JSON.stringify(moderated.json?.error || moderated.json?.data || '')}`);
    const mod404 = await j('POST', `/reviews/${NONE}/moderate`, { token: admin.token, body: { clear_flag: true } });
    check('POST /reviews/<nonexistent>/moderate → 404', mod404.status === 404, `status=${mod404.status}`);
  }

  if (failures) { console.error(`[test-reviews] ${failures} check(s) failed`); process.exit(1); }
  console.log('[test-reviews] all checks passed');
})().catch((e) => { console.error('[test-reviews] error:', e); process.exit(1); });
