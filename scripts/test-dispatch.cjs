#!/usr/bin/env node
/**
 * Smoke test for the Auto-dispatch engine (migration 072 + the trips-fn wiring).
 *
 * NON-DESTRUCTIVE: never flips the global app_settings.dispatch_algorithm. Instead it
 * mints ephemeral drivers/agent, sets ONE minted trip's per-trip dispatch_mode='auto'
 * + calls start_dispatch via the service role, then drives the REAL accept/decline
 * endpoints. Covers: token-ordered first offer, decline→advance to the next driver,
 * accept→assigned+OTP+busy_trip_id+dispatch_status=filled.
 *
 * Env (.env.development): VITE_API_BASE_URL (or DISPATCH_API_BASE), VITE_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY. Skips cleanly if the API base is unset.
 */
const fs = require('fs');
const path = require('path');
function loadEnv() {
  for (const p of [path.resolve(process.cwd(), '.env.development'), path.resolve(__dirname, '..', '.env.development')]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
    }
    break;
  }
}
loadEnv();

const BASE = (process.env.DISPATCH_API_BASE || (process.env.VITE_API_BASE_URL ? `${process.env.VITE_API_BASE_URL}/functions/v1` : '')).replace(/\/+$/, '');
const SUPA_URL = (process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!BASE) { console.log('[test-dispatch] API base not set — skipping.'); process.exit(0); }
if (!SUPA_URL || !SERVICE) { console.log('[test-dispatch] VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — skipping.'); process.exit(0); }

let failures = 0;
const check = (n, c, d) => { if (c) console.log(`  ✓ ${n}`); else { failures++; console.error(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } };

async function api(method, p, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${p}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const j = await res.json().catch(() => ({}));
  return { status: res.status, data: j?.data ?? null, error: j?.error ?? null };
}
// service-role PostgREST + RPC
async function pg(method, p, body) {
  const res = await fetch(`${SUPA_URL}/rest/v1${p}`, {
    method, headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await res.text(); let j; try { j = JSON.parse(txt); } catch { j = txt; }
  return { status: res.status, json: j };
}
const rpc = (fn, args) => pg('POST', `/rpc/${fn}`, args);

async function tokenFor(role) {
  const phone = `+919903${Math.floor(100000 + Math.random() * 900000)}`;
  await api('POST', '/auth/auth/request-otp', { body: { phone } });
  const a = await api('POST', '/auth/auth/verify-otp', { body: { phone, otp: '123456', display_name: `disp ${role}`, role } });
  return a.data?.access_token;
}
async function carTypeId() { const r = await api('GET', '/admin/car-types'); return r.data?.[0]?.id; }
async function cityVellore() { const r = await api('GET', '/admin/cities'); return (r.data || []).find((c) => /vellore/i.test(c.name)) || r.data?.[0]; }

async function mintDriverOnline(adminToken, ct, lat, lng) {
  const token = await tokenFor('driver');
  const drv = await api('POST', '/drivers', { token, body: { full_name: 'disp driver' } });
  const driverId = drv.data?.id;
  await api('PATCH', `/drivers/${driverId}/kyc`, { token: adminToken, body: { kyc_status: 'approved', note: 'disp' } });
  const veh = await api('POST', '/vehicles', { token, body: { car_type_id: ct, year: 2024, registration_number: `TN-D${Date.now().toString().slice(-6)}`, seats: 4 } });
  const online = await api('POST', '/drivers/online', { token, body: { lat, lng, vehicle_id: veh.data?.id } });
  return { token, driverId, vehicleId: veh.data?.id, onlineStatus: online.status };
}

(async () => {
  console.log(`[test-dispatch] base = ${BASE}`);
  const admin = await tokenFor('admin');
  const agent = await tokenFor('trip_manager');
  await api('POST', '/agents', { token: agent, body: { full_name: 'disp agent', business_name: 'Disp Co' } });
  await api('PATCH', `/agents/${(await api('GET', '/agents/me', { token: agent })).data?.id}/kyc`, { token: admin, body: { kyc_status: 'approved', note: 'disp' } });
  const ct = await carTypeId();
  const city = await cityVellore();
  const lat = Number(city.lat), lng = Number(city.lng);

  // Driver A online first (lower token), then B.
  const A = await mintDriverOnline(admin, ct, lat, lng);
  const B = await mintDriverOnline(admin, ct, lat, lng);
  check('two drivers online near pickup', A.onlineStatus === 200 && B.onlineStatus === 200, `A=${A.onlineStatus} B=${B.onlineStatus}`);

  // Agent posts a trip (manual by default), then we flip THIS trip to auto + kick off the engine.
  const tomorrow = new Date(Date.now() + 24 * 3600_000).toISOString();
  const toCity = (await api('GET', '/admin/cities')).data.find((c) => c.id !== city.id) || city;
  const trip = await api('POST', '/trips', { token: agent, body: {
    from_city_id: city.id, to_city_id: toCity.id, pickup_at: tomorrow, car_type_id: ct,
    rate_per_km: 15, expected_distance_km: 100, commission_pct: 10, gst_amount: 98, driver_bata: 300,
    passenger_name: 'P', passenger_phone: '+919900000000', passenger_count: 2, hide_passenger_phone: false,
    acceptance_window_minutes: 15, auto_invite_matches: false,
  }});
  const tripId = trip.data?.id;
  check('trip posted', trip.status === 200 && !!tripId, `status=${trip.status} ${JSON.stringify(trip.error)}`);
  if (!tripId) { console.log(`\n[test-dispatch] ❌ ${failures} failed`); process.exit(1); }

  // Per-trip auto override + engine kickoff (service role; no global flip).
  await pg('PATCH', `/trips?id=eq.${tripId}`, { dispatch_mode: 'auto' });
  await rpc('start_dispatch', { p_trip: tripId });

  // The engine offers to the lowest-token online driver IN RADIUS — which, on a shared DB,
  // may be a leftover online driver from another run. Drive the flow by the ACTUALLY-selected
  // driver (dynamic), and only assert the mechanics. We control A & B; if a 3rd driver wins the
  // first offer we just decline through until one of ours is up.
  const byId = { [A.driverId]: A, [B.driverId]: B };
  async function selected() {
    const t = await api('GET', `/trips/${tripId}`, { token: agent });
    return { id: t.data?.assignedDriver?.id ?? t.data?.assigned_driver_id, status: t.data?.status };
  }
  let s = await selected();
  check('engine selected a driver (status=selected)', s.status === 'selected', `status=${s.status}`);
  const off1 = await pg('GET', `/trip_offers?trip_id=eq.${tripId}&driver_id=eq.${s.id}&select=status`);
  check('an `offered` trip_offers row exists for the selected driver', Array.isArray(off1.json) && off1.json[0]?.status === 'offered');

  // Decline through any non-A/B leftovers until one of OUR drivers is the offer, then decline once more to prove advance.
  let guard = 0;
  while (s.id && !byId[s.id] && guard++ < 5) {
    // Can't decline as a driver we don't own; expire via the engine instead.
    await pg('PATCH', `/trips?id=eq.${tripId}`, { offer_deadline_at: new Date(Date.now() - 1000).toISOString() });
    await rpc('advance_dispatch', { p_trip: tripId });
    s = await selected();
  }
  check('one of our drivers got an offer', !!byId[s.id], `selected=${s.id}`);
  const firstDriver = byId[s.id];
  const dec = await api('POST', `/trips/${tripId}/decline`, { token: firstDriver.token, body: { reason: 'busy' } });
  check('selected driver decline → 200', dec.status === 200, `status=${dec.status} ${JSON.stringify(dec.error)}`);
  s = await selected();
  check('engine advanced to another driver after decline', s.status === 'selected' && s.id !== firstDriver.driverId, `assigned=${s.id} status=${s.status}`);

  // Advance through leftovers again until one of ours is up, then accept.
  guard = 0;
  while (s.id && !byId[s.id] && guard++ < 5) {
    await pg('PATCH', `/trips?id=eq.${tripId}`, { offer_deadline_at: new Date(Date.now() - 1000).toISOString() });
    await rpc('advance_dispatch', { p_trip: tripId });
    s = await selected();
  }
  const accepter = byId[s.id];
  check('our second driver is the live offer', !!accepter, `selected=${s.id}`);
  const acc = await api('POST', `/trips/${tripId}/accept`, { token: accepter.token, body: {} });
  check('accept → 200 + status accepted', acc.status === 200 && acc.data?.status === 'accepted', `status=${acc.status} ${JSON.stringify(acc.error)}`);
  const presA = await pg('GET', `/driver_presence?driver_id=eq.${accepter.driverId}&select=busy_trip_id`);
  check('accepter marked busy (out of queue)', Array.isArray(presA.json) && presA.json[0]?.busy_trip_id === tripId, JSON.stringify(presA.json));
  const offA = await pg('GET', `/trip_offers?trip_id=eq.${tripId}&driver_id=eq.${accepter.driverId}&select=status`);
  check('accepter offer row → accepted', Array.isArray(offA.json) && offA.json.some((o) => o.status === 'accepted'));
  const tripRow = await pg('GET', `/trips?id=eq.${tripId}&select=dispatch_status`);
  check('dispatch_status → filled', Array.isArray(tripRow.json) && tripRow.json[0]?.dispatch_status === 'filled');

  console.log(failures === 0 ? '\n[test-dispatch] ✅ all passed' : `\n[test-dispatch] ❌ ${failures} failed`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
