#!/usr/bin/env node
/**
 * Smoke test: auto-invite matches the vacancy's vehicle car type to the trip's required type.
 *
 * A driver posts a vacancy naming a vehicle of car type A (in an isolated city so no other
 * driver is in radius). A trip requiring a DIFFERENT car type B must NOT invite them; a trip
 * requiring car type A must invite them. Proves findMatchingDrivers' car-type filter.
 *
 *   AUTO_INVITE_API_BASE=https://<ref>.supabase.co/functions/v1 node scripts/test-auto-invite-car-type.cjs
 *
 * Skips cleanly (exit 0) if the base URL is unset.
 */
const BASE = (process.env.AUTO_INVITE_API_BASE || (process.env.VITE_API_BASE_URL ? `${process.env.VITE_API_BASE_URL}/functions/v1` : '')).replace(/\/+$/, '');
if (!BASE) {
  console.log('[test-auto-invite-car-type] base URL not set — skipping.');
  process.exit(0);
}

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log(`  ✓ ${name}`);
  else { failures++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}
async function j(method, p, { body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${p}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
}
async function tokenFor(role, name) {
  const phone = `+919903${Math.floor(100000 + Math.random() * 900000)}`;
  await j('POST', '/auth/auth/request-otp', { body: { phone } });
  return (await j('POST', '/auth/auth/verify-otp', { body: { phone, otp: '123456', display_name: name, role } })).json?.data?.access_token;
}

(async () => {
  console.log(`[test-auto-invite-car-type] base = ${BASE}`);
  const adminToken = await tokenFor('admin', 'CarType Admin');
  const agentToken = await tokenFor('trip_manager', 'CarType Agent');
  const driverToken = await tokenFor('driver', 'CarType Driver');
  if (!adminToken || !agentToken || !driverToken) { console.error('auth failed'); process.exit(1); }

  const agentId = (await j('GET', '/agents/me', { token: agentToken })).json?.data?.id
    || (await j('POST', '/agents', { token: agentToken, body: { full_name: 'CarType Agent' } })).json?.data?.id;
  if (agentId) await j('PATCH', `/agents/${agentId}/kyc`, { token: adminToken, body: { kyc_status: 'approved', note: 'smoke' } });

  const drvId = (await j('POST', '/drivers', { token: driverToken, body: { full_name: 'CarType Drv' } })).json?.data?.id;
  if (drvId) await j('PATCH', `/drivers/${drvId}/kyc`, { token: adminToken, body: { kyc_status: 'approved', note: 'smoke' } });

  const carTypes = (await j('GET', '/admin/car-types')).json?.data || [];
  const cityB = ((await j('GET', '/admin/cities')).json?.data || [])[1]?.id;
  const carA = carTypes[0]?.id, carB = carTypes[1]?.id;
  if (!carA || !carB || !cityB) { console.error('need 2 car types + a destination city'); process.exit(1); }

  // Isolated pickup city at RANDOMIZED remote coords — only our driver is in radius. Random
  // (≥1° ≈ 111km spread) so a prior run's still-live driver at a fixed point can't leak in.
  const isoCity = await j('POST', '/admin/cities', { token: adminToken, body: { name: `cartype-${Date.now()}`, state: 'QA', lat: 60 + Math.random() * 20, lng: 60 + Math.random() * 20 } });
  const cityA = isoCity.json?.data?.id;
  check('seed: isolated pickup city created', isoCity.status === 200 && !!cityA, `status=${isoCity.status} ${JSON.stringify(isoCity.json?.error || '')}`);
  if (!cityA) process.exit(1);

  // Driver owns a vehicle of car type A and posts a vacancy naming it.
  const veh = await j('POST', '/vehicles', { token: driverToken, body: { car_type_id: carA, year: 2024, registration_number: `TN-CT-${Date.now().toString().slice(-6)}`, seats: 4 } });
  const vehId = veh.json?.data?.id;
  check('seed: driver vehicle (car type A) created', veh.status === 200 && !!vehId, `status=${veh.status} ${JSON.stringify(veh.json?.error || '')}`);
  // Window comfortably covers the trip interval below (the matcher requires the vacancy to span
  // [pickup, end]; a vacancy's default 4h window would be too short for a trip starting hours out).
  const vac = await j('POST', '/vacancies', { token: driverToken, body: { current_city_id: cityA, destination_city_ids: [cityB], vehicle_id: vehId, available_from: new Date().toISOString(), available_until: new Date(Date.now() + 12 * 3600e3).toISOString() } });
  check('seed: vacancy with vehicle posted', vac.status === 200 && !!vac.json?.data?.id, `status=${vac.status} ${JSON.stringify(vac.json?.error || '')}`);

  const pickupAt = new Date(Date.now() + 1 * 3600e3).toISOString();
  const endAt = new Date(Date.now() + 5 * 3600e3).toISOString();
  const tripBody = (carTypeId) => ({ from_city_id: cityA, to_city_id: cityB, pickup_at: pickupAt, expected_end_at: endAt, expected_distance_km: 100, car_type_id: carTypeId, rate_per_km: 12, hide_passenger_phone: true, passenger_count: 1, auto_invite_matches: true });

  // match-preview reflects the car-type filter.
  const previewB = await j('GET', `/trips/match-preview?from_city_id=${cityA}&pickup_at=${pickupAt}&expected_end_at=${endAt}&car_type_id=${carB}`, { token: agentToken });
  check('match-preview for car type B (mismatch) → 0 matches', previewB.status === 200 && (previewB.json?.data?.total_matches ?? -1) === 0, `total=${previewB.json?.data?.total_matches}`);
  const previewA = await j('GET', `/trips/match-preview?from_city_id=${cityA}&pickup_at=${pickupAt}&expected_end_at=${endAt}&car_type_id=${carA}`, { token: agentToken });
  check('match-preview for car type A (match) → 1 match', previewA.status === 200 && (previewA.json?.data?.total_matches ?? -1) === 1, `total=${previewA.json?.data?.total_matches}`);

  // POST /trips: wrong car type → not invited; right car type → invited.
  const tripB = await j('POST', '/trips', { token: agentToken, body: tripBody(carB) });
  check('POST /trips (car type B) → auto_invited_count 0', tripB.status === 200 && (tripB.json?.data?.auto_invited_count ?? -1) === 0, `status=${tripB.status} count=${tripB.json?.data?.auto_invited_count}`);
  const tripA = await j('POST', '/trips', { token: agentToken, body: tripBody(carA) });
  check('POST /trips (car type A) → auto_invited_count 1', tripA.status === 200 && (tripA.json?.data?.auto_invited_count ?? -1) === 1, `status=${tripA.status} count=${tripA.json?.data?.auto_invited_count}`);
  if (tripA.json?.data?.id) {
    const inv = await j('GET', `/trips/${tripA.json.data.id}/invites`, { token: agentToken });
    check('GET /trips/:id/invites (car type A) contains the driver', inv.status === 200 && (inv.json?.data || []).some((r) => r.driver?.id === drvId), `count=${inv.json?.data?.length}`);
  }

  if (failures) { console.error(`[test-auto-invite-car-type] ${failures} check(s) failed`); process.exit(1); }
  console.log('[test-auto-invite-car-type] all checks passed');
})().catch((e) => { console.error('[test-auto-invite-car-type] error:', e); process.exit(1); });
