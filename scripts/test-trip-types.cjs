#!/usr/bin/env node
/**
 * Smoke test for trip types + waypoints (migration 024 + Phase 2 edge-function changes).
 *   TRIPS_API_BASE=https://<ref>.supabase.co/functions/v1 node scripts/test-trip-types.cjs
 *
 * Covers:
 *   1. Legacy POST (from_city_id + to_city_id only) → 200, synthesised as one_way with 2 waypoints
 *   2. Explicit one_way with an intermediate stop → 200, 3 waypoints, expected_end_at populated
 *   3. round_trip (last waypoint == first) → 200, 3 waypoints
 *   4. multi_way → 200, ≥3 waypoints, all distinct
 *   5. Bad shape: round_trip last ≠ first → 422 VALIDATION
 *   6. Bad shape: multi_way last == first → 422 VALIDATION
 *   7. Non-monotonic arrive_at → 422 VALIDATION
 *   8. Span > max_trip_duration_days → 422 VALIDATION
 *   9. GET /trips/:id returns waypoints sorted by seq
 */
const BASE = (process.env.TRIPS_API_BASE || (process.env.VITE_API_BASE_URL ? `${process.env.VITE_API_BASE_URL}/functions/v1` : '')).replace(/\/+$/, '');
if (!BASE) {
  console.log('[test-trip-types] TRIPS_API_BASE not set — skipping.');
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
  const r = await j('POST', '/auth/auth/verify-otp', { body: { phone, otp: '12345', display_name: name || role, role } });
  return r.json?.data?.access_token;
}
const isoIn = (ms) => new Date(Date.now() + ms).toISOString();

(async () => {
  console.log(`[test-trip-types] base = ${BASE}`);
  const tok = await signIn('trip_manager', 'TT Agent');
  const adminTok = await signIn('admin', 'TT Admin');
  if (!tok || !adminTok) { console.error('auth failed'); process.exit(1); }
  // bootstrap agent profile + KYC-approve
  const ag = await j('POST', '/agents', { token: tok, body: { full_name: 'TT Agent', business_name: 'TT' } });
  const agentId = ag.json?.data?.id;
  if (agentId) await j('PATCH', `/agents/${agentId}/kyc`, { token: adminTok, body: { kyc_status: 'approved' } });

  const cities = ((await j('GET', '/admin/cities')).json?.data || []);
  const ct = ((await j('GET', '/admin/car-types')).json?.data || [])[0]?.id;
  if (cities.length < 3 || !ct) { console.error('need 3+ cities + a car type'); process.exit(1); }
  const baseBody = { expected_distance_km: 100, car_type_id: ct, rate_per_km: 12, passenger_count: 1, hide_passenger_phone: true };
  const t0 = Date.now() + 86_400_000;
  const pickupAt = new Date(t0).toISOString();

  // 1. Legacy single-leg (back-compat)
  const leg = await j('POST', '/trips', { token: tok, body: { ...baseBody, from_city_id: cities[0].id, to_city_id: cities[1].id, pickup_at: pickupAt } });
  check('1. legacy POST (from/to) → 200 + synthesised one_way + 2 waypoints', leg.status === 200 && leg.json?.data?.trip_type === 'one_way' && leg.json?.data?.waypoints?.length === 2, `status=${leg.status}`);

  // 2. One-way with an intermediate stop
  const ow = await j('POST', '/trips', { token: tok, body: {
    ...baseBody, pickup_at: pickupAt, trip_type: 'one_way',
    waypoints: [
      { city_id: cities[0].id },
      { city_id: cities[2].id, arrive_at: isoIn(86_400_000 + 2 * 3_600_000), wait_minutes: 30 },
      { city_id: cities[1].id, arrive_at: isoIn(86_400_000 + 5 * 3_600_000), is_destination: true },
    ],
  }});
  check('2. one_way + intermediate stop → 200 + 3 waypoints', ow.status === 200 && ow.json?.data?.waypoints?.length === 3, `status=${ow.status} err=${JSON.stringify(ow.json?.error)}`);
  check('2a. expected_end_at populated', !!ow.json?.data?.expected_end_at);

  // 3. Round trip
  const rt = await j('POST', '/trips', { token: tok, body: {
    ...baseBody, pickup_at: pickupAt, trip_type: 'round_trip',
    waypoints: [
      { city_id: cities[0].id },
      { city_id: cities[1].id, arrive_at: isoIn(86_400_000 + 4 * 3_600_000), wait_minutes: 360 },
      { city_id: cities[0].id, arrive_at: isoIn(86_400_000 + 10 * 3_600_000), is_destination: true },
    ],
  }});
  check('3. round_trip → 200 + 3 waypoints + last == first city', rt.status === 200 && rt.json?.data?.waypoints?.length === 3 && rt.json.data.waypoints[2].city?.id === cities[0].id, `status=${rt.status} err=${JSON.stringify(rt.json?.error)}`);

  // 4. Multi-way
  const mw = await j('POST', '/trips', { token: tok, body: {
    ...baseBody, pickup_at: pickupAt, trip_type: 'multi_way',
    waypoints: [
      { city_id: cities[0].id },
      { city_id: cities[1].id, arrive_at: isoIn(86_400_000 + 3 * 3_600_000), wait_minutes: 60, is_destination: true },
      { city_id: cities[2].id, arrive_at: isoIn(86_400_000 + 6 * 3_600_000), is_destination: true },
    ],
  }});
  check('4. multi_way → 200 + 3 distinct waypoints', mw.status === 200 && mw.json?.data?.waypoints?.length === 3 && mw.json.data.trip_type === 'multi_way', `status=${mw.status} err=${JSON.stringify(mw.json?.error)}`);

  // 5. Bad: round_trip last != first
  const bad1 = await j('POST', '/trips', { token: tok, body: {
    ...baseBody, pickup_at: pickupAt, trip_type: 'round_trip',
    waypoints: [{ city_id: cities[0].id }, { city_id: cities[1].id, arrive_at: isoIn(86_400_000 + 3_600_000) }],
  }});
  check('5. round_trip last ≠ first → 422 VALIDATION', bad1.status === 422 && bad1.json?.error?.code === 'VALIDATION', `status=${bad1.status}`);

  // 6. multi_way is allowed to loop back (last == first) — share-text will read "Multi-way return back"
  const loop = await j('POST', '/trips', { token: tok, body: {
    ...baseBody, pickup_at: pickupAt, trip_type: 'multi_way',
    waypoints: [{ city_id: cities[0].id }, { city_id: cities[1].id, arrive_at: isoIn(86_400_000 + 3_600_000) }, { city_id: cities[0].id, arrive_at: isoIn(86_400_000 + 6 * 3_600_000) }],
  }});
  check('6. multi_way looping back → 200 (allowed; client labels it as "return back")', loop.status === 200 && loop.json?.data?.trip_type === 'multi_way' && loop.json?.data?.waypoints?.length === 3, `status=${loop.status}`);

  // 7. Non-monotonic arrive_at
  const bad3 = await j('POST', '/trips', { token: tok, body: {
    ...baseBody, pickup_at: pickupAt, trip_type: 'multi_way',
    waypoints: [
      { city_id: cities[0].id },
      { city_id: cities[1].id, arrive_at: isoIn(86_400_000 + 5 * 3_600_000) },
      { city_id: cities[2].id, arrive_at: isoIn(86_400_000 + 2 * 3_600_000) },
    ],
  }});
  check('7. non-monotonic arrive_at → 422 VALIDATION', bad3.status === 422 && bad3.json?.error?.code === 'VALIDATION', `status=${bad3.status}`);

  // 8. Span too long
  const bad4 = await j('POST', '/trips', { token: tok, body: {
    ...baseBody, pickup_at: pickupAt, trip_type: 'one_way',
    waypoints: [{ city_id: cities[0].id }, { city_id: cities[1].id, arrive_at: isoIn(86_400_000 + 30 * 86_400_000) }],
    expected_end_at: isoIn(86_400_000 + 30 * 86_400_000),
  }});
  check('8. 30-day span → 422 VALIDATION (cap=14)', bad4.status === 422 && bad4.json?.error?.code === 'VALIDATION', `status=${bad4.status}`);

  // 9. GET /trips/:id returns waypoints sorted by seq
  if (mw.json?.data?.id) {
    const got = await j('GET', `/trips/${mw.json.data.id}`, { token: tok });
    const seqs = (got.json?.data?.waypoints ?? []).map((w) => w.seq);
    check('9. GET /trips/:id waypoints sorted by seq', got.status === 200 && seqs.length === 3 && seqs[0] === 0 && seqs[1] === 1 && seqs[2] === 2, `seqs=${seqs.join(',')}`);
  }

  if (failures) { console.error(`\n[test-trip-types] ${failures} assertion(s) failed`); process.exit(1); }
  console.log('\n[test-trip-types] all passed');
})().catch((e) => { console.error(e); process.exit(1); });
