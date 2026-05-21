#!/usr/bin/env node
/**
 * Smoke test for migration 039 — when a driver accepts a trip whose pickup_at falls
 * inside one of their active vacancies' windows, that vacancy auto-flips to 'on_trip'
 * (hidden from agent search, banner on the driver's IAmAvailableCard via linked_trip).
 *
 *   VACANCY_ON_TRIP_API_BASE=https://<ref>.supabase.co/functions/v1 node scripts/test-vacancy-on-trip.cjs
 *
 * Skips cleanly (exit 0) if the API base isn't configured. Covers three flows:
 *   1. accept → vacancy on_trip; agent search excludes it; driver's own list includes it w/ linkedTrip.
 *   2. start → vacancy DELETED (slot consumed; no stale "expired" card left behind).
 *   3. cancel before start → vacancy reverts to 'active' (window still in the future).
 */
const BASE = (process.env.VACANCY_ON_TRIP_API_BASE || process.env.TRIPS_API_BASE || (process.env.VITE_API_BASE_URL ? `${process.env.VITE_API_BASE_URL}/functions/v1` : '')).replace(/\/+$/, '');
if (!BASE) {
  console.log('[test-vacancy-on-trip] base URL not set — skipping.');
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
async function signIn(role, name) {
  const phone = `+919900${Math.floor(100000 + Math.random() * 900000)}`;
  await j('POST', '/auth/auth/request-otp', { body: { phone } });
  const r = await j('POST', '/auth/auth/verify-otp', { body: { phone, otp: '123456', display_name: name || `Smoke ${role}`, role } });
  return r.json?.data?.access_token;
}
const futureIso = (hours) => new Date(Date.now() + hours * 3600_000).toISOString();

async function bootstrap() {
  const adminToken = await signIn('admin', 'V-on-T Admin');
  const agentToken = await signIn('trip_manager', 'V-on-T Agent');
  const driverToken = await signIn('driver', 'V-on-T Driver');
  check('auth tokens obtained', !!adminToken && !!agentToken && !!driverToken);
  if (!adminToken || !agentToken || !driverToken) process.exit(1);

  // Driver profile + KYC approve
  const driverId = (await j('POST', '/drivers', { token: driverToken, body: { full_name: 'V-on-T Driver' } })).json?.data?.id;
  if (driverId) await j('PATCH', `/drivers/${driverId}/kyc`, { token: adminToken, body: { kyc_status: 'approved', note: 'smoke' } });
  check('driver profile created + KYC approved', !!driverId);

  // Agent profile + KYC approve (POST /trips needs an approved poster)
  const agentId = (await j('POST', '/agents', { token: agentToken, body: { full_name: 'V-on-T Agent', business_name: 'V-on-T Travels' } })).json?.data?.id;
  if (agentId) await j('PATCH', `/agents/${agentId}/kyc`, { token: adminToken, body: { kyc_status: 'approved', note: 'smoke' } });
  check('agent profile created + KYC approved', !!agentId);

  const cityIds = ((await j('GET', '/admin/cities')).json?.data || []).map((c) => c.id);
  const carTypeId = ((await j('GET', '/admin/car-types')).json?.data || [])[0]?.id;
  check('have ≥2 cities + a car type', cityIds.length >= 2 && !!carTypeId);
  if (cityIds.length < 2 || !carTypeId) process.exit(1);

  return { adminToken, agentToken, driverToken, driverId, cityIds, carTypeId };
}

async function postVacancy(driverToken, currentCityId, destCityIds) {
  // Window starts now, ends in 48h — comfortably contains any pickup_at we'll pick.
  const r = await j('POST', '/vacancies', {
    token: driverToken,
    body: {
      current_city_id: currentCityId,
      available_from: futureIso(-1),
      available_until: futureIso(48),
      destination_city_ids: destCityIds,
    },
  });
  return r.json?.data;
}

// Explicit-window variant for the overlap regression (vacancy that does NOT contain the trip).
async function postVacancyWindow(driverToken, currentCityId, destCityIds, fromIso, untilIso) {
  const r = await j('POST', '/vacancies', {
    token: driverToken,
    body: { current_city_id: currentCityId, available_from: fromIso, available_until: untilIso, destination_city_ids: destCityIds },
  });
  return r.json?.data;
}

async function postTrip(agentToken, fromCityId, toCityId, carTypeId, pickupAtIso) {
  const r = await j('POST', '/trips', {
    token: agentToken,
    body: {
      from_city_id: fromCityId,
      to_city_id: toCityId,
      pickup_at: pickupAtIso,
      expected_distance_km: 140,
      car_type_id: carTypeId,
      rate_per_km: 14,
      commission_pct: 10,
      gst_amount: 98,
      driver_bata: 300,
      hide_passenger_phone: false,
      passenger_count: 2,
      passenger_name: 'V-on-T Pax',
      passenger_phone: '+918888888888',
    },
  });
  return r.json?.data;
}

async function applyAssignAccept(agentToken, driverToken, tripId) {
  const aid = (await j('POST', `/trips/${tripId}/applicants`, { token: driverToken, body: { applicant_message: 'on_trip smoke' } })).json?.data?.id;
  await j('POST', `/trips/${tripId}/assign`, { token: agentToken, body: { acceptance_id: aid } });
  const accept = await j('POST', `/trips/${tripId}/accept`, { token: driverToken });
  return { aid, accept };
}

(async () => {
  console.log(`[test-vacancy-on-trip] base = ${BASE}`);
  const ctx = await bootstrap();
  const { adminToken, agentToken, driverToken, driverId, cityIds, carTypeId } = ctx;
  const cityFrom = cityIds[0];
  const cityTo = cityIds[1];

  // ── Flow 1: accept → vacancy on_trip ───────────────────────────────────
  const vac1 = await postVacancy(driverToken, cityFrom, [cityTo]);
  check('vacancy #1 posted (active)', vac1?.status === 'active', `status=${vac1?.status}`);

  const trip1 = await postTrip(agentToken, cityFrom, cityTo, carTypeId, futureIso(4));
  check('trip #1 posted', !!trip1?.id, `trip=${JSON.stringify(trip1)}`);
  if (!trip1?.id || !vac1?.id) process.exit(1);

  // Pre-warm the agent-search cache (Qase D5 regression): the public /vacancies list has
  // a 90s shared-cache TTL. Without invalidation in syncVacanciesForTrip, the post-accept
  // re-fetch would serve the stale 'active' row for up to a minute. Hit it once *before*
  // the accept so the cache is populated with vac1 visible.
  const prewarm = await j('GET', `/vacancies?current_city_id=${cityFrom}`);
  const prewarmHit = (prewarm.json?.data || []).some((v) => v.id === vac1.id);
  check('pre-warm: vacancy #1 visible in agent search before accept', prewarmHit, `prewarmHit=${prewarmHit}`);

  const { accept: accept1 } = await applyAssignAccept(agentToken, driverToken, trip1.id);
  check('driver accepts trip #1 → 200', accept1.status === 200 && accept1.json?.data?.status === 'accepted', `status=${accept1.status} ${JSON.stringify(accept1.json?.error || '')}`);

  // Driver's own list still shows the vacancy with the new status + linked_trip summary.
  const myList = await j('GET', `/vacancies?driver_id=${driverId}&status=active,on_trip`);
  const myVac = (myList.json?.data || []).find((v) => v.id === vac1.id);
  check('GET /vacancies?driver_id=…&status=active,on_trip → vacancy is on_trip', myVac?.status === 'on_trip', `status=${myVac?.status}`);
  check('on_trip vacancy carries linked_trip_id pointing at the accepted trip', myVac?.linked_trip_id === trip1.id, `linked_trip_id=${myVac?.linked_trip_id}`);
  check('on_trip vacancy embeds linked_trip with pickup_at + from/to city names', !!myVac?.linked_trip?.pickup_at && !!myVac?.linked_trip?.from_city?.name && !!myVac?.linked_trip?.to_city?.name, `linked_trip=${JSON.stringify(myVac?.linked_trip)}`);

  // Public agent search (no status param) defaults to active+matched — must hide the on_trip row.
  const publicList = await j('GET', `/vacancies?current_city_id=${cityFrom}`);
  const leakedInPublic = (publicList.json?.data || []).some((v) => v.id === vac1.id);
  check('GET /vacancies (no status) excludes on_trip vacancies from agent search', !leakedInPublic, `leaked=${leakedInPublic}`);

  // ── Flow 1b: start → vacancy expires ───────────────────────────────────
  const otp = accept1.json?.data?.passenger_otp;
  const start = await j('POST', `/trips/${trip1.id}/start`, { token: driverToken, body: { passenger_otp: otp, start_odo_url: 'test://odo/start', start_odo_reading: 10000 } });
  check('trip #1 starts → in_progress', start.status === 200 && start.json?.data?.status === 'in_progress', `status=${start.status} ${JSON.stringify(start.json?.error || '')}`);
  const myListAfterStart = await j('GET', `/vacancies?driver_id=${driverId}&status=active,on_trip,expired,cancelled`);
  const vacAfterStart = (myListAfterStart.json?.data || []).find((v) => v.id === vac1.id);
  check('after /start the linked vacancy is DELETED (gone, not left as an expired card)', !vacAfterStart, `found status=${vacAfterStart?.status}`);

  // ── Flow 2: cancel before start → vacancy reverts to active ────────────
  const vac2 = await postVacancy(driverToken, cityFrom, [cityTo]);
  check('vacancy #2 posted (active)', vac2?.status === 'active', `status=${vac2?.status}`);

  const trip2 = await postTrip(agentToken, cityFrom, cityTo, carTypeId, futureIso(6));
  check('trip #2 posted', !!trip2?.id);
  if (!trip2?.id || !vac2?.id) process.exit(failures > 0 ? 1 : 0);

  const { accept: accept2 } = await applyAssignAccept(agentToken, driverToken, trip2.id);
  check('driver accepts trip #2', accept2.status === 200, `status=${accept2.status}`);

  // Sanity: vacancy #2 is now on_trip.
  let chk = await j('GET', `/vacancies?driver_id=${driverId}&status=on_trip`);
  let v2 = (chk.json?.data || []).find((v) => v.id === vac2.id);
  check('vacancy #2 flipped to on_trip after accept', v2?.status === 'on_trip', `status=${v2?.status}`);

  // Agent cancels the trip before it starts.
  const cancel = await j('POST', `/trips/${trip2.id}/cancel`, { token: agentToken, body: {} });
  check('agent cancels trip #2 → 200', cancel.status === 200 && cancel.json?.data?.status === 'cancelled', `status=${cancel.status} ${JSON.stringify(cancel.json?.error || '')}`);
  chk = await j('GET', `/vacancies?driver_id=${driverId}&status=active,on_trip,expired,cancelled`);
  v2 = (chk.json?.data || []).find((v) => v.id === vac2.id);
  check('after trip cancel the vacancy is reverted to active (window still in the future)', v2?.status === 'active' && !v2?.linked_trip_id, `status=${v2?.status} linked=${v2?.linked_trip_id}`);

  // ── Flow 3: OVERLAP regression (vacancy does NOT contain the trip) ─────
  // Reproduces the DrSentha bug: a driver posts availability that ends BEFORE the trip's
  // expected_end_at but still overlaps the pickup. The old containment gate
  // (available_until >= expected_end_at) left these 'active' → driver leaked into agent search
  // while on the trip. Post TWO such windows to assert the sync flips *all* overlapping rows.
  const pickup3 = futureIso(10);
  const shortUntil = new Date(Date.now() + 10 * 3600_000 + 5 * 60_000).toISOString(); // pickup + 5min, well before trip end
  const vac3 = await postVacancyWindow(driverToken, cityFrom, [cityTo], futureIso(-1), shortUntil);
  check('overlap-regression: short-window vacancy posted (active)', vac3?.status === 'active', `status=${vac3?.status}`);

  const trip3 = await postTrip(agentToken, cityFrom, cityTo, carTypeId, pickup3);
  check('overlap-regression: trip #3 posted', !!trip3?.id);
  if (vac3?.id && trip3?.id) {
    const { accept: accept3 } = await applyAssignAccept(agentToken, driverToken, trip3.id);
    check('overlap-regression: driver accepts trip #3', accept3.status === 200, `status=${accept3.status} ${JSON.stringify(accept3.json?.error || '')}`);

    // The vacancy window ends ~5 min after pickup — it overlaps the trip but does NOT contain it.
    // Under the old containment gate this stayed 'active' (the DrSentha leak); the overlap gate flips it.
    const after = await j('GET', `/vacancies?driver_id=${driverId}&status=active,on_trip`);
    const a = (after.json?.data || []).find((v) => v.id === vac3.id);
    check('overlap-regression: overlapping-but-not-containing vacancy flipped to on_trip', a?.status === 'on_trip', `status=${a?.status}`);

    const pub = await j('GET', `/vacancies?current_city_id=${cityFrom}`);
    const leaked = (pub.json?.data || []).some((v) => v.id === vac3.id);
    check('overlap-regression: driver on trip is absent from agent vacant-driver search', !leaked, `leaked=${leaked}`);
  }

  // Suppress lint
  void adminToken;

  console.log(`\n[test-vacancy-on-trip] ${failures === 0 ? 'OK' : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error('[test-vacancy-on-trip] crashed:', e);
  process.exit(2);
});
