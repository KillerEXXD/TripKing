#!/usr/bin/env node
/**
 * Smoke test: a driver who withdraws an *accepted* trip-acceptance leaves the trip
 * properly unassigned (status → has_applicants / open, no dangling
 * assigned_acceptance_id). Re-applying afterwards then succeeds and the new row is
 * 'applied' on a trip the agent can see in their pool.
 *
 *   WAA_API_BASE=https://<ref>.supabase.co/functions/v1 node scripts/test-withdraw-after-accept.cjs
 */
const BASE = (process.env.WAA_API_BASE || process.env.TRIPS_API_BASE || (process.env.VITE_API_BASE_URL ? `${process.env.VITE_API_BASE_URL}/functions/v1` : '')).replace(/\/+$/, '');
if (!BASE) { console.log('[test-withdraw-after-accept] base URL not set — skipping.'); process.exit(0); }

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
  return r.json?.data?.access_token;
}

(async () => {
  console.log(`[test-withdraw-after-accept] base = ${BASE}`);
  const admin = await signIn('admin', 'WAA Admin');
  const agent = await signIn('trip_manager', 'WAA Agent');
  const driver = await signIn('driver', 'WAA Driver');
  check('tokens obtained', !!admin && !!agent && !!driver);
  if (!admin || !agent || !driver) process.exit(1);

  const drv = (await j('POST', '/drivers', { token: driver, body: { full_name: 'WAA Driver' } })).json?.data;
  if (drv?.id) await j('PATCH', `/drivers/${drv.id}/kyc`, { token: admin, body: { kyc_status: 'approved' } });
  const ag = (await j('POST', '/agents', { token: agent, body: { full_name: 'WAA Agent', business_name: 'WAA Travels' } })).json?.data;
  if (ag?.id) await j('PATCH', `/agents/${ag.id}/kyc`, { token: admin, body: { kyc_status: 'approved' } });
  check('driver + agent created + KYC approved', !!drv?.id && !!ag?.id);

  const cities = ((await j('GET', '/admin/cities')).json?.data || []).map((c) => c.id);
  const carTypeId = ((await j('GET', '/admin/car-types')).json?.data || [])[0]?.id;
  if (cities.length < 2 || !carTypeId) { console.error('seed data missing'); process.exit(1); }

  const trip = (await j('POST', '/trips', {
    token: agent,
    body: {
      from_city_id: cities[0], to_city_id: cities[1], pickup_at: futureIso(8),
      expected_distance_km: 140, car_type_id: carTypeId, rate_per_km: 14,
      commission_pct: 10, gst_amount: 98, driver_bata: 300, hide_passenger_phone: false,
      passenger_count: 2, passenger_name: 'WAA Pax', passenger_phone: '+918888888888',
    },
  })).json?.data;
  check('trip posted', !!trip?.id);
  if (!trip?.id) process.exit(failures > 0 ? 1 : 0);

  // Apply → assign → accept
  const aid = (await j('POST', `/trips/${trip.id}/applicants`, { token: driver, body: { applicant_message: 'first' } })).json?.data?.id;
  await j('POST', `/trips/${trip.id}/assign`, { token: agent, body: { acceptance_id: aid } });
  const accept = await j('POST', `/trips/${trip.id}/accept`, { token: driver });
  check('driver accepts → trip "accepted"', accept.status === 200 && accept.json?.data?.status === 'accepted');

  // Driver withdraws the accepted acceptance.
  const withdraw = await j('DELETE', `/trips/${trip.id}/applicants/${aid}`, { token: driver });
  check('DELETE /applicants/:aid → 200 withdrawn', withdraw.status === 200 && withdraw.json?.data?.withdrawn === aid, `status=${withdraw.status} ${JSON.stringify(withdraw.json)}`);

  // The trip must be unassigned, NOT still in 'accepted' pointing at the withdrawn row.
  const tripAfter = (await j('GET', `/trips/${trip.id}`, { token: agent })).json?.data;
  check('trip is no longer "accepted" — back to open/has_applicants', tripAfter?.status === 'open' || tripAfter?.status === 'has_applicants', `status=${tripAfter?.status}`);
  check('trip.assigned_driver_id cleared', !tripAfter?.assigned_driver_id, `assigned_driver_id=${tripAfter?.assigned_driver_id}`);
  check('trip.assigned_acceptance_id cleared', !tripAfter?.assigned_acceptance_id, `assigned_acceptance_id=${tripAfter?.assigned_acceptance_id}`);

  // Re-apply succeeds (resurrects the row to status='applied').
  const reApply = await j('POST', `/trips/${trip.id}/applicants`, { token: driver, body: { applicant_message: 'reapply' } });
  check('driver re-applies → 200', reApply.status === 200 && reApply.json?.data?.status === 'applied', `status=${reApply.status} ${JSON.stringify(reApply.json)}`);

  // Agent can see them in the applicants list.
  const apps = await j('GET', `/trips/${trip.id}/applicants`, { token: agent });
  const found = (apps.json?.data || []).some((a) => a.driver_id === drv.id && a.status === 'applied');
  check('GET /applicants includes re-applied driver as "applied"', found, `apps=${JSON.stringify(apps.json?.data)}`);

  console.log(`\n[test-withdraw-after-accept] ${failures === 0 ? 'OK' : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('[test-withdraw-after-accept] crashed:', e); process.exit(2); });
