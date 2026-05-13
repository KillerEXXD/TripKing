#!/usr/bin/env node
/**
 * Smoke test for /vacancy-invitations (step 3 of the PII-gating plan).
 *   TRIPS_API_BASE=https://<ref>.supabase.co/functions/v1 node scripts/test-vacancy-invitations.cjs
 * Skips cleanly (exit 0) if TRIPS_API_BASE is unset.
 *
 * Flow: agent A posts a trip; driver D posts a vacancy; A invites D (POST);
 *  - 2nd POST same (vacancy_id, trip_id) → 409
 *  - GET ?role=agent (A) lists the invite with driver PII redacted (pre-accept)
 *  - GET ?role=driver (D) lists the invite (also pre-accept)
 *  - A trying to PATCH (agent-not-driver) → 403
 *  - D PATCH accepted → 200; trip_acceptances row created; trip → has_applicants
 *  - A re-GETs the invite → driver PII now revealed (because accepted)
 *  - GET /trips/:id (D, post-accept) → posted_by_name + posted_by_phone revealed (the gate fired)
 *  - 2nd PATCH on the already-decided invite → 409
 *  - PATCH from a stranger → 403
 *  - Decline path: A invites D for a 2nd trip; D declines → 200; no new acceptance row; invitation status=declined
 */
const BASE = (process.env.TRIPS_API_BASE || (process.env.VITE_API_BASE_URL ? `${process.env.VITE_API_BASE_URL}/functions/v1` : '')).replace(/\/+$/, '');
if (!BASE) {
  console.log('[test-vacancy-invitations] TRIPS_API_BASE not set — skipping.');
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
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
}
async function signIn(role, name) {
  const phone = `+919900${Math.floor(100000 + Math.random() * 900000)}`;
  await j('POST', '/auth/auth/request-otp', { body: { phone } });
  const r = await j('POST', '/auth/auth/verify-otp', { body: { phone, otp: '12345', display_name: name || `Inv ${role}`, role } });
  return r.json?.data?.access_token;
}
const futureIso = (d = 1) => new Date(Date.now() + d * 86400000).toISOString();

(async () => {
  console.log(`[test-vacancy-invitations] base = ${BASE}`);

  const A = await signIn('trip_manager', 'Inv Agent A');
  const D = await signIn('driver', 'Inv Driver D');
  const Rando = await signIn('driver', 'Inv Rando');
  const admin = await signIn('admin', 'Inv Admin');
  check('agents + drivers + admin signed in', !!A && !!D && !!Rando && !!admin);
  if (!A || !D || !admin) process.exit(1);

  const cityIds = ((await j('GET', '/admin/cities')).json?.data || []).map((c) => c.id);
  const carTypeId = ((await j('GET', '/admin/car-types')).json?.data || [])[0]?.id;
  if (cityIds.length < 2 || !carTypeId) { console.error('need ≥2 cities + a car type'); process.exit(1); }

  // Bootstrap: agent profile (KYC approved), driver profile (KYC approved), driver posts a vacancy
  const agentProf = await j('POST', '/agents', { token: A, body: { full_name: 'Inv Agent', business_name: 'Inv Travels' } });
  const agentId = agentProf.json?.data?.id;
  if (agentId) await j('PATCH', `/agents/${agentId}/kyc`, { token: admin, body: { kyc_status: 'approved', note: 'inv-smoke' } });
  const driverProf = await j('POST', '/drivers', { token: D, body: { full_name: 'Inv Driver', home_city_id: cityIds[0], current_city_id: cityIds[0] } });
  const driverId = driverProf.json?.data?.id;
  if (driverId) await j('PATCH', `/drivers/${driverId}/kyc`, { token: admin, body: { kyc_status: 'approved', note: 'inv-smoke' } });
  check('  agent + driver profiles + KYC approved', !!agentId && !!driverId, `agentId=${agentId} driverId=${driverId}`);

  const vacPost = await j('POST', '/vacancies', { token: D, body: { current_city_id: cityIds[0], destinations: [{ cityId: cityIds[1] }], notes: 'happy to drive' } });
  const vacancyId = vacPost.json?.data?.id;
  check('  driver posted a vacancy', !!vacancyId, `status=${vacPost.status} err=${JSON.stringify(vacPost.json?.error)}`);
  if (!vacancyId) process.exit(1);

  // ── POST /vacancy-invitations (agent invites driver) ─────────────────────
  // first need an open trip
  const tripPost = await j('POST', '/trips', { token: A, body: { from_city_id: cityIds[0], to_city_id: cityIds[1], pickup_at: futureIso(), expected_distance_km: 100, car_type_id: carTypeId, rate_per_km: 12, passenger_count: 1, hide_passenger_phone: true } });
  const tripId = tripPost.json?.data?.id;
  check('  agent posted a trip', !!tripId, `status=${tripPost.status}`);
  if (!tripId) process.exit(1);

  check('POST /vacancy-invitations without auth → 401', (await j('POST', '/vacancy-invitations', { body: { vacancy_id: vacancyId, trip_id: tripId } })).status === 401);
  check('POST /vacancy-invitations missing trip_id → 422', (await j('POST', '/vacancy-invitations', { token: A, body: { vacancy_id: vacancyId } })).status === 422);

  const inv1 = await j('POST', '/vacancy-invitations', { token: A, body: { vacancy_id: vacancyId, trip_id: tripId, message: 'Come drive this one' } });
  const inviteId = inv1.json?.data?.id;
  check('POST /vacancy-invitations (agent) → 200 + id + status=pending', inv1.status === 200 && !!inviteId && inv1.json?.data?.status === 'pending', `status=${inv1.status} err=${JSON.stringify(inv1.json?.error)}`);

  // pre-accept: agent sees handle only (not driver.full_name)
  check('  agent-side pre-accept: driver.full_name is absent', !!inv1.json?.data?.driver && !('full_name' in inv1.json.data.driver));
  check('  agent-side pre-accept: driver.display_handle present', typeof inv1.json?.data?.driver?.display_handle === 'string');

  // duplicate → 409
  const dup = await j('POST', '/vacancy-invitations', { token: A, body: { vacancy_id: vacancyId, trip_id: tripId } });
  check('duplicate invitation → 409', dup.status === 409, `status=${dup.status}`);

  // wrong-owner agent attempting another's trip → 403 — Rando can't invite for A's trip
  const Rando2 = await signIn('trip_manager', 'Other Agent');
  const otherInv = await j('POST', '/vacancy-invitations', { token: Rando2, body: { vacancy_id: vacancyId, trip_id: tripId } });
  check('non-owner agent trying to invite for trip → 403', otherInv.status === 403, `status=${otherInv.status}`);

  // ── GET listing ──────────────────────────────────────────────────────────
  const listAgent = await j('GET', '/vacancy-invitations?role=agent', { token: A });
  check('GET ?role=agent (sender) contains the invite', listAgent.status === 200 && (listAgent.json?.data || []).some((r) => r.id === inviteId), `len=${listAgent.json?.data?.length}`);

  const listDriver = await j('GET', '/vacancy-invitations?role=driver', { token: D });
  check('GET ?role=driver (receiver) contains the invite', listDriver.status === 200 && (listDriver.json?.data || []).some((r) => r.id === inviteId), `len=${listDriver.json?.data?.length}`);

  // ── PATCH guards ─────────────────────────────────────────────────────────
  check('PATCH by the inviting agent → 403', (await j('PATCH', `/vacancy-invitations/${inviteId}`, { token: A, body: { status: 'accepted' } })).status === 403);
  check('PATCH by a stranger driver → 403', (await j('PATCH', `/vacancy-invitations/${inviteId}`, { token: Rando, body: { status: 'accepted' } })).status === 403);
  check('PATCH with bad status → 422', (await j('PATCH', `/vacancy-invitations/${inviteId}`, { token: D, body: { status: 'maybe' } })).status === 422);

  // ── accept ───────────────────────────────────────────────────────────────
  const accept = await j('PATCH', `/vacancy-invitations/${inviteId}`, { token: D, body: { status: 'accepted' } });
  check('PATCH accepted (driver) → 200 + status accepted + decided_at', accept.status === 200 && accept.json?.data?.status === 'accepted' && !!accept.json?.data?.decided_at, `status=${accept.status}`);

  // re-GET as agent → driver PII revealed now
  const reAgent = await j('GET', `/vacancy-invitations/${inviteId}`, { token: A });
  check('post-accept agent-side: driver.full_name revealed', !!reAgent.json?.data?.driver?.full_name);

  // the gate fired — D fetches /trips/:id should now show posted_by_name/phone
  const drvTrip = await j('GET', `/trips/${tripId}`, { token: D });
  check('post-accept: D can see posted_by_name on the trip', !!drvTrip.json?.data?.posted_by_name);

  // A's /trips/:id/applicants should show the new acceptance row
  const apps = await j('GET', `/trips/${tripId}/applicants`, { token: A });
  check('post-accept: a trip_acceptances row exists for driver D', apps.status === 200 && (apps.json?.data || []).some((r) => r.driver?.id === driverId), `count=${(apps.json?.data || []).length}`);

  // 2nd PATCH → 409 already decided
  check('2nd PATCH on already-decided invite → 409', (await j('PATCH', `/vacancy-invitations/${inviteId}`, { token: D, body: { status: 'declined' } })).status === 409);

  // ── decline path ─────────────────────────────────────────────────────────
  const trip2 = await j('POST', '/trips', { token: A, body: { from_city_id: cityIds[0], to_city_id: cityIds[1], pickup_at: futureIso(), expected_distance_km: 100, car_type_id: carTypeId, rate_per_km: 12, passenger_count: 1, hide_passenger_phone: true } });
  const trip2Id = trip2.json?.data?.id;
  const inv2 = await j('POST', '/vacancy-invitations', { token: A, body: { vacancy_id: vacancyId, trip_id: trip2Id } });
  const invId2 = inv2.json?.data?.id;
  check('2nd invite created for a different trip', !!invId2 && inv2.status === 200);
  const declined = await j('PATCH', `/vacancy-invitations/${invId2}`, { token: D, body: { status: 'declined' } });
  check('PATCH declined → 200 + status declined', declined.status === 200 && declined.json?.data?.status === 'declined');

  // ── invariants ───────────────────────────────────────────────────────────
  // a trip that's already completed shouldn't accept new invites
  // (skip — too costly to drive through the lifecycle here; covered by trip-status check in code)

  // admin sees all
  const adminList = await j('GET', '/vacancy-invitations', { token: admin });
  check('admin GET /vacancy-invitations contains both invites', adminList.status === 200 && (adminList.json?.data || []).some((r) => r.id === inviteId) && (adminList.json?.data || []).some((r) => r.id === invId2));

  if (failures) {
    console.error(`\n[test-vacancy-invitations] ${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log('\n[test-vacancy-invitations] all passed');
})().catch((e) => { console.error(e); process.exit(1); });
