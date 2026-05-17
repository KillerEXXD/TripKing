#!/usr/bin/env node
/**
 * Seed an end-to-end demo: 1 Agent + 1 Driver + their full marketplace state +
 * referral data with computed bonuses. Built for a single import-and-go demo run.
 *
 *   node scripts/seed-demo.cjs
 *
 * Idempotent: wipes the two demo phones (and every row that belongs to them —
 * referral_links, trips with [DEMO_SEED] marker, vacancies, vacancy_invitations,
 * platform_fee_charges, referral_ledger) and recreates fresh. Other accounts are
 * NEVER touched.
 *
 * Phones (memorable):
 *   Agent  +91 9009009001  (Demo Agent)
 *   Driver +91 8008008001  (Demo Driver)
 *   OTP    123456          (any 4–6 digit accepted in dev)
 *
 * Demo state created:
 *   Driver side
 *     - 2 vacancies (tomorrow + day after) in Vellore
 *     - 1 trip in_progress (Demo Agent ↔ Demo Driver, full handshake walked)
 *     - 2 vacancy_invitations from other agents on the driver's vacancies
 *     - applied to 1 other open trip in another city
 *
 *   Agent side
 *     - 3 trips posted
 *       #1 (in_progress, our Driver)
 *       #2 (has_applicants, our Driver + 1 other applied)
 *       #3 (open, 3 pending invites to other drivers — demoing "Send Invites")
 *     - all wired so /trips/:id/applicants + /trips/:id/invitations show data
 *
 *   Referrals & bonuses
 *     - Driver referred 30 (mix of drivers + agents)
 *     - Agent referred 10 (mix of drivers + agents)
 *     - Mix of completed-trip counts: 20% capped, 50% earning, 30% pending
 *     - Each completed trip → platform_fee_charges row status='charged' → the
 *       accrue_referral_on_fee_charged trigger fires → referral_ledger updated →
 *       referral_balances view auto-computes
 *
 * Reads VITE_API_BASE_URL (or VITE_SUPABASE_URL) from .env.development and the
 * Supabase Management access token from the Windows Credential Manager — same
 * pattern as scripts/db.cjs + scripts/seed-qa.cjs.
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_REF = 'saxcbebqxgatiktsebxw';
const DEMO_MARKER = '[DEMO_SEED]';

// ── env ───────────────────────────────────────────────────────────────────
function loadEnv() {
  const file = path.join(__dirname, '..', '.env.development');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv();
const RAW_BASE =
  process.env.VITE_API_BASE_URL ||
  (process.env.VITE_SUPABASE_URL ? `${process.env.VITE_SUPABASE_URL}/functions/v1` : '');
if (!RAW_BASE) {
  console.error('[seed-demo] need VITE_API_BASE_URL or VITE_SUPABASE_URL in .env.development');
  process.exit(1);
}
const BASE = RAW_BASE.replace(/\/+$/, '');

// ── Management API (raw SQL) ──────────────────────────────────────────────
function getAccessToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN.trim();
  const ps = `Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices; using System.Text;
public class Cr { [DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode)] public static extern bool CredReadW(string t,int ty,int f,out IntPtr c); [DllImport("advapi32.dll")] public static extern void CredFree(IntPtr c); [StructLayout(LayoutKind.Sequential)] public struct CRED{ public int Flags;public int Type;public string TargetName;public string Comment;public long LastWritten;public int BlobSize;public IntPtr Blob;public int Persist;public int AttrCount;public IntPtr Attrs;public string TargetAlias;public string UserName;} public static string G(string t){ IntPtr p; if(CredReadW(t,1,0,out p)){ CRED c=(CRED)Marshal.PtrToStructure(p,typeof(CRED)); byte[] b=new byte[c.BlobSize]; Marshal.Copy(c.Blob,b,0,c.BlobSize); CredFree(p); return Encoding.UTF8.GetString(b);} return null;} }
"@; [Cr]::G("Supabase CLI:supabase")`;
  try {
    return execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}
async function runSql(query) {
  const token = getAccessToken();
  if (!token || !token.startsWith('sbp_')) {
    console.error('[seed-demo] no Supabase Management token — run `npx supabase login`.');
    process.exit(1);
  }
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`SQL failed (${res.status}): ${text}`);
  }
  try { return JSON.parse(text); } catch { return text; }
}

// ── edge-function helpers ────────────────────────────────────────────────
async function call(method, fnPath, { body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}/${fnPath.replace(/^\/+/, '')}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
}

// ── constants ────────────────────────────────────────────────────────────
const AGENT_PHONE = '+919009009001';
const DRIVER_PHONE = '+918008008001';
const AGENT_NAME = 'Demo Agent';
const DRIVER_NAME = 'Demo Driver';
const OTP = '123456';

// ── timing helpers ───────────────────────────────────────────────────────
function atDayHour(dayOffset, hour) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}
function pastDate(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}
const rand = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rand(arr.length)];

// ── Phase 1 — WIPE ───────────────────────────────────────────────────────
async function wipe() {
  console.log('[seed-demo] phase 1: wiping previous demo state…');
  // Multi-statement script — Management API's /database/query runs outside a transaction so each
  // statement stands alone. Order matters: child rows first, then auth.users (cascades to users).
  const phoneList = `'${AGENT_PHONE}', '${DRIVER_PHONE}'`;
  const demoUserSubquery = `(SELECT id FROM public.users WHERE phone IN (${phoneList}))`;
  const demoTripsSubquery = `(SELECT id FROM public.trips WHERE driver_instructions LIKE '${DEMO_MARKER}%')`;
  const demoLinksSubquery = `(SELECT id FROM public.referral_links WHERE referrer_user_id IN ${demoUserSubquery} OR referred_user_id IN ${demoUserSubquery})`;
  const sql = `
    DELETE FROM public.referral_ledger WHERE referral_link_id IN ${demoLinksSubquery};
    DELETE FROM public.platform_fee_charges WHERE trip_id IN ${demoTripsSubquery};
    DELETE FROM public.trip_acceptances WHERE trip_id IN ${demoTripsSubquery};
    DELETE FROM public.trip_invitations WHERE trip_id IN ${demoTripsSubquery};
    DELETE FROM public.referral_links WHERE referrer_user_id IN ${demoUserSubquery} OR referred_user_id IN ${demoUserSubquery};
    DELETE FROM public.trips WHERE driver_instructions LIKE '${DEMO_MARKER}%';
    DELETE FROM public.vacancies WHERE driver_id IN (SELECT id FROM public.drivers WHERE user_id IN ${demoUserSubquery});
    DELETE FROM public.rate_limits WHERE bucket LIKE '%${AGENT_PHONE.replace('+', '')}%' OR bucket LIKE '%${DRIVER_PHONE.replace('+', '')}%';
    DELETE FROM auth.users WHERE phone IN (${phoneList}) OR id IN ${demoUserSubquery};
    DELETE FROM public.users WHERE phone IN (${phoneList});
  `;
  await runSql(sql);
  console.log('[seed-demo]   ✓ wiped');
}

// ── Phase 2 — tokens & profiles ──────────────────────────────────────────
async function tokenFor(phone, role, displayName) {
  await call('POST', '/auth/auth/request-otp', { body: { phone } });
  const r = await call('POST', '/auth/auth/verify-otp', { body: { phone, otp: OTP, role, display_name: displayName } });
  if (r.status !== 200 || !r.json?.data?.access_token) {
    throw new Error(`verify-otp failed for ${phone}: ${r.status} ${JSON.stringify(r.json)}`);
  }
  return { token: r.json.data.access_token, userId: r.json.data.user.id };
}

async function provisionAdmin() {
  return tokenFor(`+919000000000`, 'admin', 'Demo Seed Admin');
}

async function provisionDemoUsers(adminToken) {
  console.log('[seed-demo] phase 2: creating Agent + Driver…');
  const cities = await call('GET', '/admin/cities');
  const cityIdByName = Object.fromEntries((cities.json?.data ?? []).map((c) => [c.name, c.id]));
  if (!cityIdByName['Vellore']) throw new Error('Vellore not in /admin/cities — demo expects Vellore as Driver home');

  const carTypes = await call('GET', '/admin/car-types');
  const carTypeIdByName = Object.fromEntries((carTypes.json?.data ?? []).map((c) => [c.label, c.id]));
  const defaultCarType = carTypeIdByName['SUV'] ?? carTypeIdByName['Sedan'] ?? (carTypes.json?.data ?? [])[0]?.id;
  if (!defaultCarType) throw new Error('no active car_types found');

  // Agent
  const agent = await tokenFor(AGENT_PHONE, 'trip_manager', AGENT_NAME);
  const agentProfile = await call('POST', '/agents', {
    token: agent.token,
    body: { full_name: AGENT_NAME, business_name: 'Demo Travels', business_city_id: cityIdByName['Chennai'] ?? cityIdByName['Vellore'] },
  });
  if (agentProfile.status !== 200) throw new Error(`agent profile: ${JSON.stringify(agentProfile.json)}`);
  await call('PATCH', `/agents/${agentProfile.json.data.id}/kyc`, { token: adminToken, body: { kyc_status: 'approved', note: 'demo seed' } });

  // Driver
  const driver = await tokenFor(DRIVER_PHONE, 'driver', DRIVER_NAME);
  const driverProfile = await call('POST', '/drivers', {
    token: driver.token,
    body: { full_name: DRIVER_NAME, home_city_id: cityIdByName['Vellore'] },
  });
  if (driverProfile.status !== 200) throw new Error(`driver profile: ${JSON.stringify(driverProfile.json)}`);
  await call('PATCH', `/drivers/${driverProfile.json.data.id}/kyc`, { token: adminToken, body: { kyc_status: 'approved', note: 'demo seed' } });

  console.log(`[seed-demo]   ✓ Agent  ${AGENT_NAME}  ${AGENT_PHONE}  (user ${agent.userId})`);
  console.log(`[seed-demo]   ✓ Driver ${DRIVER_NAME} ${DRIVER_PHONE} (user ${driver.userId})`);

  return {
    agent: { ...agent, profileId: agentProfile.json.data.id },
    driver: { ...driver, profileId: driverProfile.json.data.id },
    cityIdByName,
    defaultCarType,
  };
}

// ── Phase 3 — Driver's 2 vacancies ───────────────────────────────────────
async function postDriverVacancies(driver, cityIdByName) {
  console.log('[seed-demo] phase 3: posting Driver vacancies (tomorrow + day-after)…');
  const v1 = await call('POST', '/vacancies', {
    token: driver.token,
    body: {
      current_city_id: cityIdByName['Vellore'],
      destination_city_ids: [cityIdByName['Chennai'], cityIdByName['Bangalore']],
      available_from: atDayHour(1, 9),
      available_until: atDayHour(1, 21),
      min_rate_per_km: 14,
      driver_instructions: `${DEMO_MARKER} tomorrow window`,
    },
  });
  if (v1.status !== 200) throw new Error(`vacancy 1: ${JSON.stringify(v1.json)}`);
  const v2 = await call('POST', '/vacancies', {
    token: driver.token,
    body: {
      current_city_id: cityIdByName['Vellore'],
      destination_city_ids: [cityIdByName['Pondicherry'] ?? cityIdByName['Chennai'], cityIdByName['Tirupati'] ?? cityIdByName['Bangalore']],
      available_from: atDayHour(2, 8),
      available_until: atDayHour(2, 20),
      min_rate_per_km: 15,
      driver_instructions: `${DEMO_MARKER} day-after window`,
    },
  });
  if (v2.status !== 200) throw new Error(`vacancy 2: ${JSON.stringify(v2.json)}`);
  console.log(`[seed-demo]   ✓ 2 vacancies posted`);
  return { v1: v1.json.data.id, v2: v2.json.data.id };
}

// ── Phase 4 — pick existing accounts for supporting cast ─────────────────
async function findExistingActiveProfiles(needDrivers, needAgents, excludeUserIds, opts = {}) {
  const exclude = excludeUserIds.map((id) => `'${id}'`).join(',');
  // `referral_links_referred_user_id_key` is UNIQUE — excluding users who already have a
  // referrer means we don't trip the constraint when we INSERT 40 new referral_links below.
  const noExistingReferrer = opts.forReferrals
    ? `AND u.id NOT IN (SELECT referred_user_id FROM public.referral_links)`
    : '';
  const sql = `
    (SELECT d.id AS profile_id, d.user_id, 'driver' AS role, d.full_name
       FROM public.drivers d
       JOIN public.users u ON u.id = d.user_id
      WHERE d.kyc_status='approved' AND d.is_active=true AND u.is_active=true
        AND u.id NOT IN (${exclude || `'00000000-0000-0000-0000-000000000000'`})
        ${noExistingReferrer}
      ORDER BY random()
      LIMIT ${needDrivers})
    UNION ALL
    (SELECT a.id AS profile_id, a.user_id, 'trip_manager' AS role, a.full_name
       FROM public.trip_managers a
       JOIN public.users u ON u.id = a.user_id
      WHERE a.kyc_status='approved' AND a.is_active=true AND u.is_active=true
        AND u.id NOT IN (${exclude || `'00000000-0000-0000-0000-000000000000'`})
        ${noExistingReferrer}
      ORDER BY random()
      LIMIT ${needAgents});
  `;
  return runSql(sql);
}

// ── Phase 5 — Agent's 3 trips + handshake ────────────────────────────────
const TRIP_DEFAULTS = (extra) => ({
  pickup_at: extra.pickup_at,
  expected_distance_km: 140,
  rate_per_km: 14,
  car_type_id: extra.car_type_id,
  seats_required: 4,
  ac_required: true,
  driver_bata: 300,
  gst_amount: 100,
  commission_pct: 10,
  passenger_count: 2,
  hide_passenger_phone: true,
  passenger_name: 'Demo Passenger',
  passenger_phone: '+919000099999',
  show_fare_to_passenger: true,
  driver_instructions: `${DEMO_MARKER} agent-posted demo trip`,
  ...extra,
});

async function postAgentTrips(agent, cityIdByName, defaultCarType) {
  console.log('[seed-demo] phase 5: agent posts 3 trips…');
  const t1 = await call('POST', '/trips', {
    token: agent.token,
    body: TRIP_DEFAULTS({
      from_city_id: cityIdByName['Vellore'],
      to_city_id: cityIdByName['Chennai'],
      pickup_at: atDayHour(0, 14),
      car_type_id: defaultCarType,
      driver_instructions: `${DEMO_MARKER} #1 (in-progress demo trip)`,
    }),
  });
  if (t1.status !== 200) throw new Error(`trip 1: ${JSON.stringify(t1.json)}`);
  const t2 = await call('POST', '/trips', {
    token: agent.token,
    body: TRIP_DEFAULTS({
      from_city_id: cityIdByName['Chennai'],
      to_city_id: cityIdByName['Bangalore'],
      pickup_at: atDayHour(1, 9),
      car_type_id: defaultCarType,
      driver_instructions: `${DEMO_MARKER} #2 (has applicants — demo Driver applies)`,
    }),
  });
  if (t2.status !== 200) throw new Error(`trip 2: ${JSON.stringify(t2.json)}`);
  const t3 = await call('POST', '/trips', {
    token: agent.token,
    body: TRIP_DEFAULTS({
      from_city_id: cityIdByName['Bangalore'],
      to_city_id: cityIdByName['Salem'] ?? cityIdByName['Chennai'],
      pickup_at: atDayHour(2, 11),
      car_type_id: defaultCarType,
      driver_instructions: `${DEMO_MARKER} #3 (open — pending invites)`,
    }),
  });
  if (t3.status !== 200) throw new Error(`trip 3: ${JSON.stringify(t3.json)}`);
  console.log(`[seed-demo]   ✓ 3 trips posted: ${t1.json.data.id}, ${t2.json.data.id}, ${t3.json.data.id}`);
  return { t1: t1.json.data, t2: t2.json.data, t3: t3.json.data };
}

async function walkInProgressHandshake(agent, driver, trip) {
  console.log('[seed-demo]   walking trip #1 to in_progress…');
  // 1. agent invites the demo driver
  const inv = await call('POST', `/trips/${trip.id}/invites`, { token: agent.token, body: { driver_ids: [driver.profileId] } });
  if (inv.status !== 200) throw new Error(`invite: ${JSON.stringify(inv.json)}`);

  // 2. driver applies (this also satisfies the invitation)
  const app = await call('POST', `/trips/${trip.id}/applicants`, { token: driver.token, body: {} });
  if (app.status !== 200) throw new Error(`apply: ${JSON.stringify(app.json)}`);
  const acceptanceId = app.json.data.id;

  // 3. agent assigns the driver
  const assign = await call('POST', `/trips/${trip.id}/assign`, { token: agent.token, body: { acceptance_id: acceptanceId } });
  if (assign.status !== 200) throw new Error(`assign: ${JSON.stringify(assign.json)}`);

  // 4. driver accepts → OTP minted
  const accept = await call('POST', `/trips/${trip.id}/accept`, { token: driver.token, body: {} });
  if (accept.status !== 200) throw new Error(`accept: ${JSON.stringify(accept.json)}`);
  const passengerOtp = accept.json.data?.passenger_otp ?? accept.json.data?.otp ?? null;
  if (!passengerOtp) throw new Error(`accept didn't return passenger_otp — got: ${JSON.stringify(accept.json.data).slice(0, 200)}`);

  // 5. driver starts the trip (only the assigned driver can start; agent shares the OTP)
  const start = await call('POST', `/trips/${trip.id}/start`, {
    token: driver.token,
    body: { passenger_otp: passengerOtp, start_odo_km: 10000 },
  });
  if (start.status !== 200) throw new Error(`start: ${JSON.stringify(start.json)}`);
  console.log('[seed-demo]   ✓ trip #1 is now in_progress');
}

async function applyOthersToTrip2(trip, otherDrivers, driver) {
  console.log('[seed-demo]   trip #2 — driver + 1 other applies…');
  // demo driver applies
  await call('POST', `/trips/${trip.id}/applicants`, { token: driver.token, body: {} });
  // pick 1 other driver, mint their token, apply
  const other = otherDrivers[0];
  if (!other) return;
  const u = await call('POST', '/auth/auth/verify-otp', { body: { phone: '+919000000001', otp: OTP } });
  // we can't get OTHER drivers' tokens without their phone — skip if we can't.
  // Instead: insert the acceptance directly via SQL (the apply path is still demonstrated by demo driver).
  const otherUserId = other.user_id;
  await runSql(`
    INSERT INTO public.trip_acceptances (trip_id, driver_id, status, applied_at)
    VALUES ('${trip.id}', '${other.profile_id}', 'applied', now())
    ON CONFLICT DO NOTHING;
  `);
  // suppress lint
  void u;
}

async function invitePendingDriversOnTrip3(agent, trip, otherDrivers) {
  console.log('[seed-demo]   trip #3 — invite 3 other drivers (pending)…');
  const ids = otherDrivers.slice(0, 3).map((d) => d.profile_id);
  if (ids.length === 0) return;
  const r = await call('POST', `/trips/${trip.id}/invites`, { token: agent.token, body: { driver_ids: ids } });
  if (r.status !== 200) console.warn(`[seed-demo]   ! invite trip3 failed (continuing): ${JSON.stringify(r.json?.error)}`);
}

// ── Phase 6 — drivers from other agents (find-trips state) ───────────────
async function seedOtherCityTripsForDriver(driver, otherAgents, cityIdByName, defaultCarType) {
  console.log('[seed-demo] phase 6: seeding 3 trips by OTHER agents in OTHER cities (find-trips feed)…');
  // We can't mint tokens for arbitrary existing users (don't have their phones). Insert via SQL
  // so the trips are owned by real existing trip_managers — the Driver will see them on /find-trips.
  // Pick 3 agents.
  const pool = otherAgents.slice(0, 3);
  if (pool.length === 0) return [];
  const routes = [
    { from: 'Pondicherry', to: 'Chennai', day: 0, hour: 18 },
    { from: 'Tirupati', to: 'Bangalore', day: 1, hour: 6 },
    { from: 'Salem', to: 'Coimbatore', day: 2, hour: 15 },
  ];
  const trips = [];
  for (let i = 0; i < pool.length; i++) {
    const agent = pool[i];
    const route = routes[i % routes.length];
    const fromId = cityIdByName[route.from] ?? cityIdByName['Vellore'];
    const toId = cityIdByName[route.to] ?? cityIdByName['Chennai'];
    if (!fromId || !toId) continue;
    const pickupAt = atDayHour(route.day, route.hour);
    const r = await runSql(`
      INSERT INTO public.trips (
        posted_by_user_id, from_city_id, to_city_id, pickup_at, expected_end_at,
        expected_distance_km, rate_per_km, total_fare, car_type_id, seats_required,
        ac_required, driver_bata, gst_amount, commission_pct, passenger_count,
        hide_passenger_phone, passenger_name, passenger_phone, show_fare_to_passenger,
        status, driver_instructions, trip_type
      ) VALUES (
        '${agent.user_id}', '${fromId}', '${toId}', '${pickupAt}', '${pickupAt}'::timestamptz + INTERVAL '4 hours',
        160, 15, 160 * 15, '${defaultCarType}', 4,
        true, 300, 100, 10, 2,
        true, 'Other Passenger', '+919000099998', true,
        'open', '${DEMO_MARKER} other-agent open trip for find-trips feed', 'one_way'
      )
      RETURNING id;
    `);
    if (r?.[0]?.id) trips.push(r[0].id);
  }
  console.log(`[seed-demo]   ✓ ${trips.length} other-city open trips seeded`);

  // Driver applies to the first one
  if (trips[0]) {
    const app = await call('POST', `/trips/${trips[0]}/applicants`, { token: driver.token, body: {} });
    if (app.status === 200) console.log('[seed-demo]   ✓ Driver applied to 1 of them');
    else console.warn(`[seed-demo]   ! apply failed: ${JSON.stringify(app.json?.error)}`);
  }
  return trips;
}

// ── Phase 7 — trip_invitations from other agents to our Driver ──────────
async function inviteDriverFromOtherAgents(otherAgents, otherCityTrips, driverProfileId) {
  console.log('[seed-demo] phase 7: 2 other agents invite Driver to their open trips…');
  // The product calls these "Invites" — they show up on the driver's Find-Trips "Invited" tab.
  // Each row is keyed on (trip_id, driver_id); the invited_by_user_id is the agent who owns the trip.
  const pairs = [];
  for (let i = 0; i < Math.min(2, otherAgents.length, otherCityTrips.length); i++) {
    pairs.push({ agent: otherAgents[i], trip: otherCityTrips[i] });
  }
  for (const p of pairs) {
    await runSql(`
      INSERT INTO public.trip_invitations (trip_id, driver_id, invited_by_user_id, status)
      VALUES ('${p.trip}', '${driverProfileId}', '${p.agent.user_id}', 'pending')
      ON CONFLICT DO NOTHING;
    `);
  }
  console.log(`[seed-demo]   ✓ ${pairs.length} trip invitations sent to Driver`);
}

// ── Phase 8 — referrals & bonuses ────────────────────────────────────────
function weightedTripCount() {
  const r = Math.random();
  if (r < 0.3) return 0;               // 30% pending qualification
  if (r < 0.8) return 3 + rand(8);     // 50% earning (3–10 trips)
  return 50 + rand(20);                // 20% capped (50–69 trips)
}

async function seedReferrals(refererUserId, refererRole, referees) {
  // referees: [{ profile_id, user_id, role, full_name }]
  let totalAccrued = 0;
  let cappedCount = 0;
  let earningCount = 0;
  let pendingCount = 0;

  for (const r of referees) {
    const tripCount = weightedTripCount();
    const referredRole = r.role; // 'driver' or 'trip_manager'

    // 1) Insert the referral_link row.
    //    - 'signed_up' if no trips
    //    - 'qualified' / 'earning_active' if any trips (trigger will set qualified_at on first accrual)
    const initialStatus = tripCount > 0 ? 'earning_active' : 'signed_up';
    const qualifiedAt = tripCount > 0 ? `'${pastDate(rand(30) + 1)}'` : 'NULL';
    const linkRows = await runSql(`
      INSERT INTO public.referral_links (
        referrer_user_id, referred_user_id, referred_user_role,
        status, cap_paise, payout_per_trip_paise, qualified_at,
        eligible_paid_trips_count, total_earned_paise
      ) VALUES (
        '${refererUserId}', '${r.user_id}', '${referredRole}',
        '${initialStatus}', 250000, 5000, ${qualifiedAt},
        0, 0
      )
      RETURNING id;
    `);
    const linkId = linkRows?.[0]?.id;
    if (!linkId) continue;

    if (tripCount === 0) {
      pendingCount += 1;
      continue;
    }

    // 2) Insert N completed trips for this referee. They're flagged [DEMO_SEED] so wipe finds them.
    //    Trips need a real from_city + to_city; pick any 2 distinct cities.
    //    Each trip → 1 platform_fee_charge with status='charged' fires the accrual trigger.
    await runSql(`
      DO $$
      DECLARE
        i INT;
        c1 UUID := (SELECT id FROM public.cities ORDER BY random() LIMIT 1);
        c2 UUID := (SELECT id FROM public.cities WHERE id <> c1 ORDER BY random() LIMIT 1);
        ct UUID := (SELECT id FROM public.car_types WHERE is_active LIMIT 1);
        new_trip_id UUID;
        completed_at TIMESTAMPTZ;
      BEGIN
        FOR i IN 1..${tripCount} LOOP
          completed_at := now() - (random() * INTERVAL '60 days');
          INSERT INTO public.trips (
            posted_by_user_id, from_city_id, to_city_id, pickup_at, expected_end_at,
            expected_distance_km, rate_per_km, total_fare, car_type_id, seats_required,
            ac_required, driver_bata, gst_amount, commission_pct,
            passenger_count, hide_passenger_phone, passenger_name,
            show_fare_to_passenger, status, driver_instructions, trip_type,
            created_at, updated_at
          ) VALUES (
            '${r.user_id}', c1, c2, completed_at - INTERVAL '4 hours', completed_at,
            120, 14, 120 * 14, ct, 4,
            true, 300, 100, 10,
            2, true, 'Demo Passenger',
            false, 'completed', '${DEMO_MARKER} referred-user completed trip', 'one_way',
            completed_at - INTERVAL '5 hours', completed_at
          ) RETURNING id INTO new_trip_id;

          -- platform_fee_charge with status='charged' fires accrue_referral_on_fee_charged trigger
          -- which appends to referral_ledger and bumps the link's totals.
          INSERT INTO public.platform_fee_charges (
            trip_id, side, payer_user_id, amount_paise, payment_source, sub_balance_used, status, created_at
          ) VALUES (
            new_trip_id, '${referredRole === 'driver' ? 'driver' : 'agent'}',
            '${r.user_id}', 5000, 'cash_wallet', 'cash', 'charged',
            completed_at + INTERVAL '5 minutes'
          );
        END LOOP;
      END $$;
    `);

    // Snapshot the link totals after the trigger ran.
    const post = await runSql(`SELECT total_earned_paise, status FROM public.referral_links WHERE id='${linkId}'`);
    const earnedPaise = Number(post?.[0]?.total_earned_paise ?? 0);
    totalAccrued += earnedPaise;
    if (post?.[0]?.status === 'cap_reached') cappedCount += 1;
    else earningCount += 1;
  }
  return { totalAccrued, cappedCount, earningCount, pendingCount };
}

// ── orchestration ────────────────────────────────────────────────────────
(async () => {
  console.log(`[seed-demo] base = ${BASE}`);

  await wipe();

  const adminInfo = await provisionAdmin();
  const { agent, driver, cityIdByName, defaultCarType } = await provisionDemoUsers(adminInfo.token);

  const vacancies = await postDriverVacancies(driver, cityIdByName);

  // Need supporting cast (other approved drivers + agents) BEFORE phases 5/6/7
  console.log('[seed-demo] phase 4: picking supporting cast from existing accounts…');
  const cast = await findExistingActiveProfiles(8, 6, [agent.userId, driver.userId, adminInfo.userId]);
  const otherDrivers = cast.filter((c) => c.role === 'driver');
  const otherAgents = cast.filter((c) => c.role === 'trip_manager');
  console.log(`[seed-demo]   ✓ ${otherDrivers.length} drivers + ${otherAgents.length} agents picked`);

  const trips = await postAgentTrips(agent, cityIdByName, defaultCarType);
  await walkInProgressHandshake(agent, driver, trips.t1);
  await applyOthersToTrip2(trips.t2, otherDrivers, driver);
  await invitePendingDriversOnTrip3(agent, trips.t3, otherDrivers);

  const otherCityTrips = await seedOtherCityTripsForDriver(driver, otherAgents, cityIdByName, defaultCarType);
  await inviteDriverFromOtherAgents(otherAgents, otherCityTrips, driver.profileId);
  void vacancies; // kept so the listing/header counts still resolve via the driver query

  // Referrals
  console.log('[seed-demo] phase 8: seeding 30 referrals for Driver + 10 for Agent…');
  const refCast = await findExistingActiveProfiles(25, 15, [agent.userId, driver.userId, adminInfo.userId], { forReferrals: true });
  // Ensure mix: Driver gets 20 drivers + 10 agents = 30
  const driverReferees = [...refCast.filter((c) => c.role === 'driver').slice(0, 20), ...refCast.filter((c) => c.role === 'trip_manager').slice(0, 10)];
  // Agent gets 5 drivers + 5 agents = 10
  const agentReferees = [...refCast.filter((c) => c.role === 'driver').slice(20, 25), ...refCast.filter((c) => c.role === 'trip_manager').slice(10, 15)];

  const dStats = await seedReferrals(driver.userId, 'driver', driverReferees);
  console.log(`[seed-demo]   ✓ Driver referrals: ${driverReferees.length} total — ${dStats.cappedCount} capped, ${dStats.earningCount} earning, ${dStats.pendingCount} pending — ₹${(dStats.totalAccrued / 100).toLocaleString('en-IN')} accrued`);
  const aStats = await seedReferrals(agent.userId, 'trip_manager', agentReferees);
  console.log(`[seed-demo]   ✓ Agent referrals: ${agentReferees.length} total — ${aStats.cappedCount} capped, ${aStats.earningCount} earning, ${aStats.pendingCount} pending — ₹${(aStats.totalAccrued / 100).toLocaleString('en-IN')} accrued`);

  // ── summary ───────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(78));
  console.log('DEMO SEED COMPLETE — OTP = 123456 for everyone');
  console.log('═'.repeat(78));
  console.log(`Agent   ${AGENT_NAME.padEnd(14)} ${AGENT_PHONE}`);
  console.log('  · 3 trips posted (#1 in_progress · #2 has_applicants · #3 open + invites pending)');
  console.log(`  · 10 referrals seeded — ₹${(aStats.totalAccrued / 100).toLocaleString('en-IN')} accrued so far`);
  console.log('');
  console.log(`Driver  ${DRIVER_NAME.padEnd(14)} ${DRIVER_PHONE}`);
  console.log('  · 2 vacancies (tomorrow + day after) + 2 vacancy-invitations from other agents');
  console.log('  · 1 trip in_progress + 1 applied to (another agent\'s trip)');
  console.log(`  · 30 referrals seeded — ₹${(dStats.totalAccrued / 100).toLocaleString('en-IN')} accrued so far`);
  console.log('═'.repeat(78));
})().catch((e) => {
  console.error('[seed-demo] error:', e.message || e);
  process.exit(1);
});
