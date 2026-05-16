#!/usr/bin/env node
/**
 * Smoke test for the "driver-poster can't self-act" guards:
 *   - POST /trips/:id/applicants by the poster → 403 SELF_APPLY_FORBIDDEN
 *   - POST /trips/:id/invites with the poster's own driver_id → 403 SELF_INVITE_FORBIDDEN
 *   - GET /drivers?current_city_id=…&exclude_user_id=<poster> excludes their row
 *   - GET /vacancies?current_city_id=…&exclude_user_id=<poster> excludes their vacancy
 *
 *   SELF_GUARDS_API_BASE=https://<ref>.supabase.co/functions/v1 node scripts/test-self-action-guards.cjs
 */
const BASE = (process.env.SELF_GUARDS_API_BASE || process.env.TRIPS_API_BASE || (process.env.VITE_API_BASE_URL ? `${process.env.VITE_API_BASE_URL}/functions/v1` : '')).replace(/\/+$/, '');
if (!BASE) { console.log('[test-self-action-guards] base URL not set — skipping.'); process.exit(0); }

let failures = 0;
const check = (n, c, d) => { if (c) console.log(`  ✓ ${n}`); else { failures++; console.error(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } };
async function j(method, path, { body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let json; try { json = JSON.parse(t); } catch { json = { raw: t }; }
  return { status: r.status, json };
}
const futureIso = (h) => new Date(Date.now() + h * 3600_000).toISOString();
async function signIn(role, name) {
  const phone = `+919900${Math.floor(100000 + Math.random() * 900000)}`;
  await j('POST', '/auth/auth/request-otp', { body: { phone } });
  const r = await j('POST', '/auth/auth/verify-otp', { body: { phone, otp: '123456', display_name: name || `Smoke ${role}`, role } });
  return { token: r.json?.data?.access_token, userId: r.json?.data?.user?.id };
}

(async () => {
  console.log(`[test-self-action-guards] base = ${BASE}`);
  const admin = await signIn('admin', 'SG Admin');
  // Driver-user who will also post a trip
  const dp = await signIn('driver', 'SG Driver-Poster');
  check('admin + driver-poster signed in', !!admin.token && !!dp.token && !!dp.userId);
  if (!dp.token) process.exit(1);

  // Driver profile + KYC approve
  const driver = (await j('POST', '/drivers', { token: dp.token, body: { full_name: 'SG Driver-Poster' } })).json?.data;
  if (driver?.id) await j('PATCH', `/drivers/${driver.id}/kyc`, { token: admin.token, body: { kyc_status: 'approved', note: 'smoke' } });
  check('driver profile created + KYC approved', !!driver?.id && driver?.user_id === dp.userId, `driver=${JSON.stringify(driver)}`);

  // Also give them an agent profile so /trips POST works (driver-users post trips via that profile)
  const agent = (await j('POST', '/agents', { token: dp.token, body: { full_name: 'SG Driver-Poster', business_name: 'SG Travels' } })).json?.data;
  if (agent?.id) await j('PATCH', `/agents/${agent.id}/kyc`, { token: admin.token, body: { kyc_status: 'approved', note: 'smoke' } });
  check('agent profile (same user) created + KYC approved', !!agent?.id, `agent=${JSON.stringify(agent)}`);

  const cityIds = ((await j('GET', '/admin/cities')).json?.data || []).map((c) => c.id);
  const carTypeId = ((await j('GET', '/admin/car-types')).json?.data || [])[0]?.id;
  if (cityIds.length < 2 || !carTypeId) { console.error('need ≥2 cities + a car type'); process.exit(1); }
  const cityFrom = cityIds[0], cityTo = cityIds[1];

  // Post a trip as the same user
  const trip = (await j('POST', '/trips', {
    token: dp.token,
    body: {
      from_city_id: cityFrom, to_city_id: cityTo, pickup_at: futureIso(4),
      expected_distance_km: 140, car_type_id: carTypeId, rate_per_km: 14,
      commission_pct: 10, gst_amount: 98, driver_bata: 300, hide_passenger_phone: false,
      passenger_count: 2, passenger_name: 'SG Pax', passenger_phone: '+918888888888',
    },
  })).json?.data;
  check('trip posted', !!trip?.id);
  if (!trip?.id) process.exit(failures > 0 ? 1 : 0);

  // 1. self-apply must 403
  const apply = await j('POST', `/trips/${trip.id}/applicants`, { token: dp.token, body: { applicant_message: 'self apply attempt' } });
  check('POST /applicants by poster → 403 SELF_APPLY_FORBIDDEN', apply.status === 403 && apply.json?.error?.code === 'SELF_APPLY_FORBIDDEN', `status=${apply.status} body=${JSON.stringify(apply.json)}`);

  // 2. self-invite must 403
  const invite = await j('POST', `/trips/${trip.id}/invites`, { token: dp.token, body: { driver_ids: [driver.id] } });
  check('POST /invites with own driver_id → 403 SELF_INVITE_FORBIDDEN', invite.status === 403 && invite.json?.error?.code === 'SELF_INVITE_FORBIDDEN', `status=${invite.status} body=${JSON.stringify(invite.json)}`);

  // 3. GET /drivers?exclude_user_id=<self> hides the poster's row
  const drvList = await j('GET', `/drivers?current_city_id=${cityFrom}&exclude_user_id=${dp.userId}`);
  const leakedDrv = (drvList.json?.data || []).some((d) => d.id === driver.id);
  check('GET /drivers?exclude_user_id=<self> excludes self', !leakedDrv, `leaked=${leakedDrv}`);

  // 4. Post a vacancy as that driver, then GET /vacancies?exclude_user_id=<self> must hide it
  const vac = (await j('POST', '/vacancies', { token: dp.token, body: { current_city_id: cityFrom, available_from: futureIso(-1), available_until: futureIso(48), destination_city_ids: [cityTo] } })).json?.data;
  check('vacancy posted', !!vac?.id);
  if (vac?.id) {
    const vacList = await j('GET', `/vacancies?current_city_id=${cityFrom}&exclude_user_id=${dp.userId}`);
    const leakedVac = (vacList.json?.data || []).some((v) => v.id === vac.id);
    check('GET /vacancies?exclude_user_id=<self> excludes own vacancy', !leakedVac, `leaked=${leakedVac}`);

    // 5. Without exclude_user_id the vacancy is still visible (backward compat)
    const vacListAll = await j('GET', `/vacancies?current_city_id=${cityFrom}`);
    const presentNoFilter = (vacListAll.json?.data || []).some((v) => v.id === vac.id);
    check('GET /vacancies without exclude_user_id still includes the vacancy', presentNoFilter, `present=${presentNoFilter}`);
  }

  console.log(`\n[test-self-action-guards] ${failures === 0 ? 'OK' : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('[test-self-action-guards] crashed:', e); process.exit(2); });
