#!/usr/bin/env node
/**
 * Multi-actor marketplace + live-tracking simulation.
 *
 * Drives the deployed edge functions through the whole lifecycle, with assertions at every step:
 *   N agents sign up → each posts trips
 *   M drivers sign up → each gets a driver profile + a vehicle → applies to a subset of the open trips
 *   each agent reviews applicants → assigns one driver per trip (gets the passenger OTP)
 *   "passengers" view each assigned trip by OTP (no login) — fare gating + no OTP hash leaked
 *   negative paths: wrong-driver start, wrong OTP, non-poster assign/applicants, bad OTP, double-complete, double-apply
 *   the assigned driver "drives": interpolated GPS pings pickup→destination, asserting after each ping that
 *     the agent (GET /trips/:id and the live-map list) and the passenger (GET /trips/by-otp/:otp) see the new
 *     position; that distance_to_destination_km matches a JS haversine recompute (±0.2 km); and that it
 *     decreases as the car approaches
 *   each driver completes their trip → status=completed, distance field gone, total_trips_completed bumped
 *
 *   VITE_API_BASE_URL=https://<ref>.supabase.co/functions/v1 node scripts/simulate-marketplace.cjs
 *   (or SIM_API_BASE=...). Skips cleanly (exit 0) when neither is set.
 *
 * Knobs (env): SIM_AGENTS (2), SIM_DRIVERS (4), SIM_TRIPS_PER_AGENT (2), SIM_DRIVE_STEPS (6),
 *              SIM_STEP_DELAY_MS (0 — bump to ~4000 to watch it move in the UI), SIM_CONCURRENCY (1).
 *
 * Creates real Supabase auth users / trips on the target (dev) project via /auth's dev-OTP mode — same as
 * scripts/test-*.cjs. It does NOT clean up: the run doubles as demo/seed data, and prints every actor's phone
 * (dev OTP = 123456) + each passenger OTP at the end so you can sign in / open /passenger/<otp> in the UI.
 */
const BASE = (process.env.SIM_API_BASE || (process.env.VITE_API_BASE_URL ? `${process.env.VITE_API_BASE_URL}/functions/v1` : '')).replace(/\/+$/, '');
if (!BASE) {
  console.log('[simulate-marketplace] SIM_API_BASE / VITE_API_BASE_URL not set — skipping.');
  process.exit(0);
}
const N_AGENTS = Math.max(1, Number(process.env.SIM_AGENTS) || 2);
const N_DRIVERS = Math.max(1, Number(process.env.SIM_DRIVERS) || 4);
const TRIPS_PER_AGENT = Math.max(1, Number(process.env.SIM_TRIPS_PER_AGENT) || 2);
const DRIVE_STEPS = Math.max(2, Number(process.env.SIM_DRIVE_STEPS) || 6);
const STEP_DELAY_MS = Math.max(0, Number(process.env.SIM_STEP_DELAY_MS) || 0);
const CONCURRENCY = Math.max(1, Number(process.env.SIM_CONCURRENCY) || 1);

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
async function j(method, path, { body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errOf = (r) => JSON.stringify(r.json?.error || r.json?.data || r.json || '');
function randPhone() {
  return `+919900${Math.floor(100000 + Math.random() * 900000)}`;
}
function round6(n) {
  return Math.round(n * 1e6) / 1e6;
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
async function mapWithConcurrency(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx], idx);
      }
    }),
  );
  return out;
}

/** Sign up a fresh actor via the dev-OTP path; returns { token, userId, phone, role }. */
async function signUp(role, displayName) {
  const phone = randPhone();
  await j('POST', '/auth/auth/request-otp', { body: { phone } });
  const auth = await j('POST', '/auth/auth/verify-otp', { body: { phone, otp: '123456', display_name: displayName, role } });
  return { token: auth.json?.data?.access_token, userId: auth.json?.data?.user?.id, phone, role, status: auth.status, raw: auth };
}

(async () => {
  console.log(`[simulate-marketplace] base = ${BASE}`);
  console.log(`  agents=${N_AGENTS} drivers=${N_DRIVERS} trips/agent=${TRIPS_PER_AGENT} driveSteps=${DRIVE_STEPS} stepDelay=${STEP_DELAY_MS}ms concurrency=${CONCURRENCY}`);

  // ── 1. reference data ──────────────────────────────────────────────────────
  const citiesRes = await j('GET', '/admin/cities');
  const carTypesRes = await j('GET', '/admin/car-types');
  const makesRes = await j('GET', '/admin/vehicle-makes');
  const modelsRes = await j('GET', '/admin/vehicle-models');
  const cities = (citiesRes.json?.data || []).filter((c) => Number.isFinite(Number(c.lat)) && Number.isFinite(Number(c.lng)));
  const carTypeId = (carTypesRes.json?.data || [])[0]?.id;
  const makeId = (makesRes.json?.data || [])[0]?.id;
  const modelId = (modelsRes.json?.data || []).find((m) => !makeId || m.make_id === makeId)?.id || (modelsRes.json?.data || [])[0]?.id;
  check('reference data: ≥2 cities with coords + a car type', cities.length >= 2 && !!carTypeId, `cities=${cities.length} carType=${carTypeId}`);
  if (cities.length < 2 || !carTypeId) {
    console.error('[simulate-marketplace] cannot proceed without reference data');
    process.exit(1);
  }
  const cityById = Object.fromEntries(cities.map((c) => [c.id, c]));

  // ── 2. agents + their trips ────────────────────────────────────────────────
  const agents = [];
  for (let a = 0; a < N_AGENTS; a++) {
    const agent = await signUp('trip_manager', `Sim Agent ${a + 1}`);
    check(`agent ${a + 1} signed up`, !!agent.token && !!agent.userId, `status=${agent.status} ${errOf(agent.raw)}`);
    if (!agent.token) process.exit(1);
    // bootstrap the trip_manager profile (also syncs users.role) — uses the same POST /drivers contract
    const prof = await j('POST', '/drivers', { token: agent.token, body: { role: 'trip_manager', full_name: `Sim Agent ${a + 1}`, business_city_id: cities[0].id, business_name: `Sim Travels ${a + 1}` } });
    check(`agent ${a + 1} profile created`, prof.status === 200 || prof.status === 409, `status=${prof.status} ${errOf(prof)}`);
    agent.trips = [];
    for (let t = 0; t < TRIPS_PER_AGENT; t++) {
      const fromCity = cities[(a + t) % cities.length];
      const toCity = cities[(a + t + 1) % cities.length];
      const showFare = (t % 2) === 0;
      const post = await j('POST', '/trips', {
        token: agent.token,
        body: {
          from_city_id: fromCity.id,
          to_city_id: toCity.id,
          pickup_at: new Date(Date.now() + 86_400_000 + a * 3_600_000 + t * 600_000).toISOString(),
          expected_distance_km: 140,
          car_type_id: carTypeId,
          rate_per_km: 14,
          commission_pct: 10,
          gst_amount: 98,
          driver_bata: 300,
          passenger_name: `Sim Pax ${a + 1}-${t + 1}`,
          passenger_phone: randPhone(),
          passenger_count: 2,
          show_fare_to_passenger: showFare,
          hide_passenger_phone: false,
        },
      });
      const trip = post.json?.data;
      check(
        `agent ${a + 1} posted trip ${t + 1} → 200, joined cities, computed payout, status=open`,
        post.status === 200 && trip?.id && trip?.from_city?.name && typeof trip?.driver_payout === 'number' && trip?.status === 'open' && trip?.applicant_count === 0,
        `status=${post.status} ${errOf(post)}`,
      );
      if (t === 0) check('driver_payout computed by trigger (14·140 − 10% − 98 + 300 = 1966)', trip?.driver_payout === 1966, `got ${trip?.driver_payout}`);
      if (trip?.id) agent.trips.push({ id: trip.id, fromCity, toCity, showFare, agentIdx: a });
    }
    agents.push(agent);
  }
  const allTrips = agents.flatMap((ag) => ag.trips);
  check('at least one trip was posted', allTrips.length > 0, `posted ${allTrips.length}`);
  if (!allTrips.length) {
    console.error('[simulate-marketplace] cannot proceed without a posted trip');
    process.exit(1);
  }

  // ── 3. drivers + vehicles + applications ───────────────────────────────────
  const drivers = [];
  for (let d = 0; d < N_DRIVERS; d++) {
    const drv = await signUp('driver', `Sim Driver ${d + 1}`);
    check(`driver ${d + 1} signed up`, !!drv.token && !!drv.userId, `status=${drv.status} ${errOf(drv.raw)}`);
    if (!drv.token) process.exit(1);
    const prof = await j('POST', '/drivers', { token: drv.token, body: { role: 'driver', full_name: `Sim Driver ${d + 1}`, home_city_id: cities[0].id } });
    drv.driverId = prof.json?.data?.id;
    check(`driver ${d + 1} profile created`, !!drv.driverId, `status=${prof.status} ${errOf(prof)}`);
    const veh = await j('POST', '/vehicles', { token: drv.token, body: { car_type_id: carTypeId, year: 2022, seats: 4, ac: true, ...(makeId ? { make_id: makeId } : {}), ...(modelId ? { model_id: modelId } : {}), registration_number: `TN-SIM-${1000 + d}` } });
    drv.vehicleId = veh.json?.data?.id;
    check(`driver ${d + 1} added an eligible vehicle`, veh.status === 200 && !!drv.vehicleId && veh.json?.data?.eligibility_status === 'eligible', `status=${veh.status} ${errOf(veh)}`);
    // apply to every trip (roundabout subset would also work; "every" maximises applicant_count signal)
    drv.appliedTo = {};
    for (const trip of allTrips) {
      const apply = await j('POST', `/trips/${trip.id}/applicants`, { token: drv.token, body: { vehicle_id: drv.vehicleId, applicant_quoted_rate_per_km: 13 + d * 0.25, applicant_message: `Sim Driver ${d + 1} can do this` } });
      check(`driver ${d + 1} → POST /trips/${trip.id.slice(0, 8)}…/applicants → 200, status=applied`, apply.status === 200 && apply.json?.data?.status === 'applied', `status=${apply.status} ${errOf(apply)}`);
      if (apply.json?.data?.id) drv.appliedTo[trip.id] = apply.json.data.id;
    }
    drivers.push(drv);
  }
  check('have at least one driver to assign', drivers.some((d) => d.driverId), '');

  // ── 4. applicant visibility + has_applicants ───────────────────────────────
  {
    const trip0 = allTrips[0];
    const poster = agents[trip0.agentIdx];
    const apps = await j('GET', `/trips/${trip0.id}/applicants`, { token: poster.token });
    const appliedCount = drivers.filter((d) => d.appliedTo[trip0.id]).length;
    check('poster GET /trips/:id/applicants → 200 + every applicant + vehicle joins', apps.status === 200 && Array.isArray(apps.json?.data) && apps.json.data.length === appliedCount && apps.json.data.every((x) => x.driver?.full_name && x.vehicle?.id), `status=${apps.status} got=${apps.json?.data?.length} want=${appliedCount}`);
    const tripState = await j('GET', `/trips/${trip0.id}`, { token: poster.token });
    check('trip with applicants → status=has_applicants + applicant_count matches', tripState.json?.data?.status === 'has_applicants' && tripState.json?.data?.applicant_count === appliedCount, `status=${tripState.json?.data?.status} count=${tripState.json?.data?.applicant_count} want=${appliedCount}`);
    // a non-poster (a driver) may not see the applicant list
    const sneaky = await j('GET', `/trips/${trip0.id}/applicants`, { token: drivers[0].token });
    check('non-poster GET /trips/:id/applicants → 403', sneaky.status === 403, `status=${sneaky.status}`);
  }

  // ── 5. assign one driver per trip ──────────────────────────────────────────
  for (const trip of allTrips) {
    const poster = agents[trip.agentIdx];
    // round-robin which driver gets this trip
    const winnerIdx = (trip.agentIdx + trip.fromCity.id.charCodeAt(0)) % drivers.length;
    let winner = drivers[winnerIdx];
    if (!winner.appliedTo[trip.id]) winner = drivers.find((d) => d.appliedTo[trip.id]) || winner;
    const acceptanceId = winner.appliedTo[trip.id];
    // non-poster cannot assign
    const badAssign = await j('POST', `/trips/${trip.id}/assign`, { token: drivers[0].token, body: { acceptance_id: acceptanceId } });
    check(`non-poster POST /trips/${trip.id.slice(0, 8)}…/assign → 403`, badAssign.status === 403, `status=${badAssign.status}`);
    const assign = await j('POST', `/trips/${trip.id}/assign`, { token: poster.token, body: { acceptance_id: acceptanceId } });
    const td = assign.json?.data;
    check(
      `assign trip ${trip.id.slice(0, 8)}… → 200, status=assigned, otp returned, no otp hash`,
      assign.status === 200 && td?.status === 'assigned' && !!td?.assigned_driver_id && !!td?.assigned_vehicle_id && !!td?.assigned_acceptance_id && !!td?.assigned_at && /^\d{6}$/.test(String(td?.passenger_otp || '')) && !('passenger_otp_hash' in (td || {})),
      `status=${assign.status} ${errOf(assign)}`,
    );
    trip.driver = winner;
    trip.otp = td?.passenger_otp;
    trip.assignedVehicleId = td?.assigned_vehicle_id;
    // applicant statuses settled: the winner selected, the rest rejected
    const appsAfter = await j('GET', `/trips/${trip.id}/applicants`, { token: poster.token });
    const rows = appsAfter.json?.data || [];
    check(`trip ${trip.id.slice(0, 8)}… applicants: 1 selected, rest rejected`, rows.filter((r) => r.status === 'selected').length === 1 && rows.filter((r) => r.id !== acceptanceId).every((r) => r.status === 'rejected'), `statuses=${rows.map((r) => r.status).join(',')}`);
  }

  // ── 6. passenger views the assigned trip by OTP (no auth) ──────────────────
  for (const trip of allTrips) {
    if (!trip.otp) continue;
    const byOtp = await j('GET', `/trips/by-otp/${trip.otp}`);
    const td = byOtp.json?.data;
    const fareShown = typeof td?.total_fare === 'number' && td.total_fare > 0;
    check(
      `passenger GET /trips/by-otp/${String(trip.otp)} → 200, matching trip, assigned driver+vehicle, no otp hash`,
      byOtp.status === 200 && td?.id === trip.id && !!td?.assigned_driver?.full_name && !!td?.assigned_driver?.phone && !!td?.assigned_vehicle?.id && !('passenger_otp_hash' in (td || {})),
      `status=${byOtp.status} ${errOf(byOtp)}`,
    );
    check(`passenger fare visibility honours show_fare_to_passenger (${trip.showFare ? 'shown' : 'hidden'}) for trip ${trip.id.slice(0, 8)}…`, fareShown === trip.showFare, `fareShown=${fareShown} expected=${trip.showFare}`);
    check(`assigned (not-yet-started) trip has no distance_to_destination_km for trip ${trip.id.slice(0, 8)}…`, td?.distance_to_destination_km === undefined || td?.distance_to_destination_km === null, `got ${td?.distance_to_destination_km}`);
  }
  {
    const bad = await j('GET', '/trips/by-otp/000000');
    check('GET /trips/by-otp/<no match> → 404', bad.status === 404, `status=${bad.status}`);
  }

  // ── 7. start: negative paths, then the real OTP handshake ──────────────────
  for (const trip of allTrips) {
    if (!trip.otp || !trip.driver?.token) continue;
    const otherDriver = drivers.find((d) => d !== trip.driver) || trip.driver;
    const wrongDriver = await j('POST', `/trips/${trip.id}/start`, { token: otherDriver.token, body: { passenger_otp: trip.otp } });
    check(`non-assigned driver POST /trips/${trip.id.slice(0, 8)}…/start → 403`, wrongDriver.status === 403, `status=${wrongDriver.status}`);
    const wrongOtp = await j('POST', `/trips/${trip.id}/start`, { token: trip.driver.token, body: { passenger_otp: '000001' } });
    check(`assigned driver, wrong OTP → 401`, wrongOtp.status === 401, `status=${wrongOtp.status}`);
    const start = await j('POST', `/trips/${trip.id}/start`, { token: trip.driver.token, body: { passenger_otp: trip.otp, start_odo_reading: 100000 } });
    check(`assigned driver, correct OTP → 200, status=in_progress for trip ${trip.id.slice(0, 8)}…`, start.status === 200 && start.json?.data?.status === 'in_progress', `status=${start.status} ${errOf(start)}`);
  }

  // ── 8. drive: GPS pings pickup→destination, asserting live tracking ────────
  await mapWithConcurrency(
    allTrips.filter((t) => t.otp && t.driver?.driverId),
    CONCURRENCY,
    async (trip) => {
      const from = cityById[trip.fromCity.id];
      const to = cityById[trip.toCity.id];
      const fromLat = Number(from.lat);
      const fromLng = Number(from.lng);
      const toLat = Number(to.lat);
      const toLng = Number(to.lng);
      const poster = agents[trip.agentIdx];
      let prevDist = Infinity;
      let prevSeenAt = '';
      for (let step = 1; step <= DRIVE_STEPS; step++) {
        const f = Math.min(0.95, step / DRIVE_STEPS);
        const lat = round6(fromLat + f * (toLat - fromLat));
        const lng = round6(fromLng + f * (toLng - fromLng));
        const ping = await j('PATCH', `/drivers/${trip.driver.driverId}/location`, { token: trip.driver.token, body: { current_lat: lat, current_lng: lng } });
        check(`trip ${trip.id.slice(0, 8)}… step ${step}/${DRIVE_STEPS}: PATCH /drivers/:id/location → 200`, ping.status === 200, `status=${ping.status} ${errOf(ping)}`);

        const seen = await j('GET', `/trips/${trip.id}`, { token: poster.token });
        const ad = seen.json?.data?.assigned_driver;
        const apiDist = seen.json?.data?.distance_to_destination_km;
        const expectDist = Math.round(haversineKm(lat, lng, toLat, toLng) * 10) / 10;
        check(
          `trip ${trip.id.slice(0, 8)}… step ${step}: GET /trips/:id echoes the new position`,
          seen.status === 200 && Math.abs(Number(ad?.current_lat) - lat) < 1e-4 && Math.abs(Number(ad?.current_lng) - lng) < 1e-4,
          `got lat=${ad?.current_lat} lng=${ad?.current_lng} want lat=${lat} lng=${lng}`,
        );
        check(`trip ${trip.id.slice(0, 8)}… step ${step}: distance_to_destination_km matches a JS haversine (±0.2 km)`, typeof apiDist === 'number' && Math.abs(apiDist - expectDist) <= 0.2, `api=${apiDist} js=${expectDist}`);
        check(`trip ${trip.id.slice(0, 8)}… step ${step}: distance is non-increasing as the car approaches`, typeof apiDist === 'number' && apiDist <= prevDist + 1e-9, `prev=${prevDist} now=${apiDist}`);
        check(`trip ${trip.id.slice(0, 8)}… step ${step}: current_location_at advanced`, typeof ad?.current_location_at === 'string' && (prevSeenAt === '' || new Date(ad.current_location_at).getTime() >= new Date(prevSeenAt).getTime()), `prev=${prevSeenAt} now=${ad?.current_location_at}`);
        prevDist = typeof apiDist === 'number' ? apiDist : prevDist;
        prevSeenAt = typeof ad?.current_location_at === 'string' ? ad.current_location_at : prevSeenAt;

        // passenger sees the same thing
        const pax = await j('GET', `/trips/by-otp/${trip.otp}`);
        const pd = pax.json?.data?.assigned_driver;
        check(`trip ${trip.id.slice(0, 8)}… step ${step}: passenger-by-OTP view agrees on position + distance`, pax.status === 200 && Math.abs(Number(pd?.current_lat) - lat) < 1e-4 && Math.abs(Number(pd?.current_lng) - lng) < 1e-4 && pax.json?.data?.distance_to_destination_km === apiDist, `pax lat=${pd?.current_lat} lng=${pd?.current_lng} dist=${pax.json?.data?.distance_to_destination_km}`);

        // the poster's live-map list contains this trip with the position
        const liveList = await j('GET', `/trips?status=in_progress&posted_by_user_id=${poster.userId}`, { token: poster.token });
        const inOwn = (liveList.json?.data || []).find((t) => t.id === trip.id);
        check(`trip ${trip.id.slice(0, 8)}… step ${step}: appears on the poster's live-map list with a position`, liveList.status === 200 && !!inOwn && Math.abs(Number(inOwn?.assigned_driver?.current_lat) - lat) < 1e-4, `found=${!!inOwn} lat=${inOwn?.assigned_driver?.current_lat}`);

        if (STEP_DELAY_MS > 0 && step < DRIVE_STEPS) await sleep(STEP_DELAY_MS);
      }
      // and it does NOT show up on a *different* agent's live-map list
      const otherAgent = agents.find((ag) => ag !== poster);
      if (otherAgent) {
        const otherList = await j('GET', `/trips?status=in_progress&posted_by_user_id=${otherAgent.userId}`, { token: otherAgent.token });
        check(`trip ${trip.id.slice(0, 8)}…: not on a different agent's live-map list`, otherList.status === 200 && (otherList.json?.data || []).every((t) => t.id !== trip.id), `status=${otherList.status} len=${otherList.json?.data?.length}`);
      }
    },
  );

  // ── 9. complete ────────────────────────────────────────────────────────────
  for (const trip of allTrips) {
    if (!trip.otp || !trip.driver?.token) continue;
    const before = await j('GET', `/drivers/${trip.driver.driverId}`, { token: trip.driver.token });
    const beforeCompleted = Number(before.json?.data?.total_trips_completed) || 0;
    const complete = await j('POST', `/trips/${trip.id}/complete`, { token: trip.driver.token, body: { end_odo_reading: 100140, driver_notes: `Sim trip ${trip.id.slice(0, 8)} done` } });
    check(`complete trip ${trip.id.slice(0, 8)}… → 200, status=completed`, complete.status === 200 && complete.json?.data?.status === 'completed', `status=${complete.status} ${errOf(complete)}`);
    const after = await j('GET', `/trips/${trip.id}`, { token: trip.driver.token });
    check(`completed trip ${trip.id.slice(0, 8)}… no longer carries distance_to_destination_km`, after.json?.data?.distance_to_destination_km === undefined || after.json?.data?.distance_to_destination_km === null, `got ${after.json?.data?.distance_to_destination_km}`);
    const afterDrv = await j('GET', `/drivers/${trip.driver.driverId}`, { token: trip.driver.token });
    check(`driver ${trip.driver.phone} total_trips_completed bumped (${beforeCompleted} → ${Number(afterDrv.json?.data?.total_trips_completed)})`, Number(afterDrv.json?.data?.total_trips_completed) === beforeCompleted + 1, `before=${beforeCompleted} after=${afterDrv.json?.data?.total_trips_completed}`);
    const dbl = await j('POST', `/trips/${trip.id}/complete`, { token: trip.driver.token, body: {} });
    check(`second complete on trip ${trip.id.slice(0, 8)}… → 409`, dbl.status === 409, `status=${dbl.status}`);
    const stillByOtp = await j('GET', `/trips/by-otp/${trip.otp}`);
    check(`passenger can still see the completed trip by OTP`, stillByOtp.status === 200 && stillByOtp.json?.data?.status === 'completed', `status=${stillByOtp.status} ${stillByOtp.json?.data?.status}`);
    trip.finalStatus = complete.json?.data?.status || after.json?.data?.status;
  }
  {
    const dupApply = await j('POST', `/trips/${allTrips[0].id}/applicants`, { token: allTrips[0].driver.token, body: { vehicle_id: allTrips[0].driver.vehicleId } });
    check('applying again to the same trip → 409', dupApply.status === 409, `status=${dupApply.status}`);
  }

  // ── summary ────────────────────────────────────────────────────────────────
  console.log('\n── actors (dev OTP for all of them = 123456) ──');
  for (let i = 0; i < agents.length; i++) console.log(`  agent ${i + 1}   phone=${agents[i].phone}  userId=${agents[i].userId}`);
  for (let i = 0; i < drivers.length; i++) console.log(`  driver ${i + 1}  phone=${drivers[i].phone}  userId=${drivers[i].userId}  driverId=${drivers[i].driverId}`);
  console.log('\n── trips ──');
  for (const t of allTrips) console.log(`  ${t.id}  ${t.fromCity.name} → ${t.toCity.name}  agent=${t.agentIdx + 1}  driver=${t.driver ? t.driver.phone : '—'}  otp=${t.otp || '—'}  status=${t.finalStatus || '?'}`);
  if (allTrips[0]?.otp) console.log(`\n  Try the passenger portal:  /passenger/${allTrips[0].otp}`);

  if (failures) {
    console.error(`\n[simulate-marketplace] ${failures} check(s) failed`);
    process.exit(1);
  }
  console.log('\n[simulate-marketplace] all checks passed');
})().catch((e) => {
  console.error('[simulate-marketplace] error:', e);
  process.exit(1);
});
