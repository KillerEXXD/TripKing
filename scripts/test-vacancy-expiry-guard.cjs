#!/usr/bin/env node
/**
 * Smoke test for the auto-invite expiry-race guard (Qase follow-up).
 *
 * The expire cron flips a lapsed vacancy active→expired every 5 min. In the gap before
 * the sweep, the row's status is still 'active'. A vacancy whose `available_until` has
 * already passed is logically stale (migration 048/058), but its status hasn't flipped yet.
 * This test proves the auto-invite matcher (findMatchingDrivers, which backs both POST /trips
 * auto-invite and GET /trips/match-preview) refuses to invite such a vacancy at query time —
 * i.e. correctness no longer depends on the cron's timing.
 *
 * It also covers the far-future-trip regression (migration 071): vacancies are never
 * open-ended any more, so a trip with a far-future pickup (e.g. a stale 2060 row) matches
 * NOBODY even when an active, bounded vacancy exists.
 *
 *   VACANCY_EXPIRY_API_BASE=https://<ref>.supabase.co/functions/v1 node scripts/test-vacancy-expiry-guard.cjs
 *
 * Requires scripts/db.cjs (Supabase Management API) to seed the stale row directly.
 * Skips cleanly (exit 0) if the base URL is unset.
 */
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const BASE = (process.env.VACANCY_EXPIRY_API_BASE || (process.env.VITE_API_BASE_URL ? `${process.env.VITE_API_BASE_URL}/functions/v1` : '')).replace(/\/+$/, '');
if (!BASE) {
  console.log('[test-vacancy-expiry-guard] base URL not set — skipping.');
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
  const phone = `+919902${Math.floor(100000 + Math.random() * 900000)}`;
  await j('POST', '/auth/auth/request-otp', { body: { phone } });
  return (await j('POST', '/auth/auth/verify-otp', { body: { phone, otp: '123456', display_name: name, role } })).json?.data?.access_token;
}
/** Run one SQL statement through scripts/db.cjs (service-role Management API). */
function sql(statement) {
  return execFileSync('node', [path.join(__dirname, 'db.cjs'), statement], { encoding: 'utf8' });
}

(async () => {
  console.log(`[test-vacancy-expiry-guard] base = ${BASE}`);
  const adminToken = await tokenFor('admin', 'ExpGuard Admin');
  const agentToken = await tokenFor('trip_manager', 'ExpGuard Agent');
  const driverToken = await tokenFor('driver', 'ExpGuard Driver');
  if (!adminToken || !agentToken || !driverToken) { console.error('auth failed'); process.exit(1); }

  const agentId = (await j('GET', '/agents/me', { token: agentToken })).json?.data?.id
    || (await j('POST', '/agents', { token: agentToken, body: { full_name: 'ExpGuard Agent' } })).json?.data?.id;
  if (agentId) await j('PATCH', `/agents/${agentId}/kyc`, { token: adminToken, body: { kyc_status: 'approved', note: 'smoke' } });

  const drvId = (await j('POST', '/drivers', { token: driverToken, body: { full_name: 'ExpGuard Drv' } })).json?.data?.id;
  if (drvId) await j('PATCH', `/drivers/${drvId}/kyc`, { token: adminToken, body: { kyc_status: 'approved', note: 'smoke' } });

  const cities = (await j('GET', '/admin/cities')).json?.data || [];
  const cityB = cities[1]?.id || cities[0]?.id;
  const carType = (await j('GET', '/admin/car-types')).json?.data?.[0]?.id;
  // Isolated pickup city at RANDOMIZED remote coords so NO other driver in the shared QA DB is
  // within the auto-invite radius — the only candidate is our test driver. Coords must be random
  // (≥1° ≈ 111km spread) so a prior run's still-live driver at a fixed point can't leak in; a
  // fixed coord made total_matches non-deterministic across repeated runs.
  const isoCity = await j('POST', '/admin/cities', { token: adminToken, body: { name: `expguard-${Date.now()}`, state: 'QA', lat: 60 + Math.random() * 20, lng: 60 + Math.random() * 20 } });
  const cityA = isoCity.json?.data?.id;
  check('seed: isolated pickup city created', isoCity.status === 200 && !!cityA, `status=${isoCity.status} ${JSON.stringify(isoCity.json?.error || '')}`);
  if (!cityA || !cityB || !carType) { console.error('need cities + car type'); process.exit(1); }

  // Driver posts a vacancy, then we make it STALE (past window) directly in the DB:
  //   available_from = 2 days ago, available_until = 1 day ago, status left 'active' (cron NOT run).
  // (available_until can no longer be NULL — migration 071 added a NOT NULL constraint.)
  const vac = await j('POST', '/vacancies', { token: driverToken, body: { current_city_id: cityA, destination_city_ids: [cityB] } });
  const vacId = vac.json?.data?.id;
  check('seed: vacancy created', vac.status === 200 && !!vacId, JSON.stringify(vac.json?.error || vac.status));
  if (!vacId) { process.exit(1); }

  sql(`update public.vacancies set available_until = now() - interval '1 day', available_from = now() - interval '2 days', status = 'active' where id = '${vacId}'`);
  const post = sql(`select status, available_until, available_from from public.vacancies where id = '${vacId}'`);
  check('seed: vacancy window is in the past + still status=active', /"status":\s*"active"/.test(post) && !/"available_until":\s*null/.test(post), post.replace(/\s+/g, ' ').slice(0, 200));

  // match-preview must NOT count this stale driver.
  const preview = await j('GET', `/trips/match-preview?from_city_id=${cityA}&pickup_at=${new Date(Date.now() + 4 * 3600e3).toISOString()}&expected_end_at=${new Date(Date.now() + 8 * 3600e3).toISOString()}`, { token: agentToken });
  check('GET /trips/match-preview excludes the stale vacancy', preview.status === 200 && (preview.json?.data?.total_matches ?? 0) === 0,
    `total_matches=${preview.json?.data?.total_matches}`);

  // POST /trips with auto-invite ON must NOT invite the stale driver.
  const trip = await j('POST', '/trips', {
    token: agentToken,
    body: { from_city_id: cityA, to_city_id: cityB, pickup_at: new Date(Date.now() + 4 * 3600e3).toISOString(), expected_end_at: new Date(Date.now() + 8 * 3600e3).toISOString(), expected_distance_km: 100, car_type_id: carType, rate_per_km: 12, hide_passenger_phone: true, passenger_count: 1, auto_invite_matches: true },
  });
  check('POST /trips auto-invite count = 0 (stale vacancy not invited)', trip.status === 200 && (trip.json?.data?.auto_invited_count ?? -1) === 0,
    `status=${trip.status} count=${trip.json?.data?.auto_invited_count} err=${JSON.stringify(trip.json?.error || '')}`);
  const tripId = trip.json?.data?.id;
  if (tripId) {
    const inv = await j('GET', `/trips/${tripId}/invites`, { token: agentToken });
    check('GET /trips/:id/invites does NOT contain the stale driver', inv.status === 200 && !(inv.json?.data || []).some((r) => r.driver?.id === drvId),
      `count=${inv.json?.data?.length}`);
  }

  // ── far-future-trip regression (migration 071) ─────────────────────────
  // A fresh, fully-active bounded vacancy exists, but a trip whose pickup is years out
  // must still match nobody (open-ended vacancies — which used to leak through — are gone).
  const freshVac = await j('POST', '/vacancies', { token: driverToken, body: { current_city_id: cityA, destination_city_ids: [cityB] } });
  check('regression: fresh active vacancy created', freshVac.status === 200 && !!freshVac.json?.data?.id, JSON.stringify(freshVac.json?.error || freshVac.status));
  const farPickup = new Date(Date.now() + 1000 * 24 * 3600e3).toISOString(); // ~2.7 years out
  const farPreview = await j('GET', `/trips/match-preview?from_city_id=${cityA}&pickup_at=${farPickup}&expected_end_at=${new Date(Date.now() + 1000 * 24 * 3600e3 + 4 * 3600e3).toISOString()}`, { token: agentToken });
  check('GET /trips/match-preview for a far-future pickup → 0 matches', farPreview.status === 200 && (farPreview.json?.data?.total_matches ?? -1) === 0,
    `total_matches=${farPreview.json?.data?.total_matches}`);

  if (failures) { console.error(`[test-vacancy-expiry-guard] ${failures} check(s) failed`); process.exit(1); }
  console.log('[test-vacancy-expiry-guard] all checks passed');
})().catch((e) => { console.error('[test-vacancy-expiry-guard] error:', e); process.exit(1); });
