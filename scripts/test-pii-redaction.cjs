#!/usr/bin/env node
/**
 * Smoke test for the step-2 PII redaction (drivers / agents / vacancies / trips / reviews).
 *   TRIPS_API_BASE=https://<ref>.supabase.co/functions/v1 node scripts/test-pii-redaction.cjs
 * Skips cleanly (exit 0) if TRIPS_API_BASE is unset. Creates real Supabase auth users (dev project).
 *
 * Covers the 8 assertions from docs/PII_GATING_HANDOVER.md §"Deploy + smoke test for step 2":
 *   1. agent A signs in (role:trip_manager).
 *   2. GET /vacancies — each row's driver.full_name is undefined, driver.display_handle matches A[0-9A-F]{6}.
 *   3. driver D signs in; GET /trips — for trips D hasn't applied to, posted_by_name / posted_by_phone undefined.
 *   4. D applies to one of A's trips.
 *   5. D re-fetches that trip — posted_by_name / posted_by_phone now present.
 *   6. A fetches /trips/:id/applicants — the applicant row carries driver.full_name (poster's reveal gate).
 *   7. POST /trips with a phone in driver_instructions returns 400 + error.code === 'VALIDATION'.
 *   8. A vacancy whose `notes` contain a phone (force-inserted via the PostgREST service-role REST API
 *      to bypass the write-side `assertNoPhones` guard) is read back with the phone replaced by
 *      `[contact hidden]` on GET. Skipped (PASS with a SKIP note) if SUPABASE_URL +
 *      SUPABASE_SERVICE_ROLE_KEY are not available in env.
 */
const BASE = (process.env.TRIPS_API_BASE || (process.env.VITE_API_BASE_URL ? `${process.env.VITE_API_BASE_URL}/functions/v1` : '')).replace(/\/+$/, '');
if (!BASE) {
  console.log('[test-pii-redaction] TRIPS_API_BASE not set — skipping.');
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
  const r = await j('POST', '/auth/auth/verify-otp', { body: { phone, otp: '12345', display_name: name || `Smoke ${role}`, role } });
  return { token: r.json?.data?.access_token, phone };
}
const HANDLE_RE = /^A[0-9A-Fa-f]{6}$/;
const futureIso = (d = 1) => new Date(Date.now() + d * 86400000).toISOString();

(async () => {
  console.log(`[test-pii-redaction] base = ${BASE}`);

  // ── 1. Agent A + driver D + admin sign in (admin needed to KYC-approve both) ──
  const A = await signIn('trip_manager', 'PII Agent A');
  const D = await signIn('driver', 'PII Driver D');
  const admin = await signIn('admin', 'PII Admin');
  check('1. agent A + driver D + admin signed in', !!A.token && !!D.token && !!admin.token);
  if (!A.token || !D.token || !admin.token) process.exit(1);

  // Bootstrap profiles + KYC-approve so A can post trips and D can apply.
  const cityIds = ((await j('GET', '/admin/cities')).json?.data || []).map((c) => c.id);
  const carTypeId = ((await j('GET', '/admin/car-types')).json?.data || [])[0]?.id;
  if (cityIds.length < 2 || !carTypeId) { console.error('need ≥2 cities + a car type'); process.exit(1); }

  const agent = await j('POST', '/agents', { token: A.token, body: { full_name: 'PII Agent A', business_name: 'PII Travels' } });
  const agentId = agent.json?.data?.id;
  if (agentId) await j('PATCH', `/agents/${agentId}/kyc`, { token: admin.token, body: { kyc_status: 'approved', note: 'pii-smoke' } });

  const driver = await j('POST', '/drivers', { token: D.token, body: { full_name: 'PII Driver D', home_city_id: cityIds[0], current_city_id: cityIds[0] } });
  const driverId = driver.json?.data?.id;
  if (driverId) await j('PATCH', `/drivers/${driverId}/kyc`, { token: admin.token, body: { kyc_status: 'approved', note: 'pii-smoke' } });
  check('  profiles created + KYC approved', !!agentId && !!driverId);

  // D posts a vacancy so GET /vacancies has at least one row joined to a driver
  await j('POST', '/vacancies', { token: D.token, body: { current_city_id: cityIds[0], destinations: [{ cityId: cityIds[1] }], notes: 'route flexible' } });

  // ── 2. GET /vacancies — driver.full_name undefined, driver.display_handle present ──
  const vac = await j('GET', '/vacancies');
  const rows = vac.json?.data || [];
  const ours = rows.find((r) => r.driver && r.driver.id === driverId);
  check('2a. GET /vacancies returned ≥1 row joined to our driver', !!ours, `rows=${rows.length}`);
  if (ours) {
    check('2b. driver.full_name is absent', !('full_name' in ours.driver));
    check('2c. driver.phone is absent', !('phone' in ours.driver));
    check('2d. driver.email is absent', !('email' in ours.driver));
    check('2e. driver.profile_photo_url is absent', !('profile_photo_url' in ours.driver));
    check('2f. driver.display_handle matches A[0-9A-F]{6}', typeof ours.driver.display_handle === 'string' && HANDLE_RE.test(ours.driver.display_handle), `got=${ours.driver.display_handle}`);
  }

  // A posts a trip
  const trip = await j('POST', '/trips', { token: A.token, body: { from_city_id: cityIds[0], to_city_id: cityIds[1], pickup_at: futureIso(), expected_distance_km: 140, car_type_id: carTypeId, rate_per_km: 14, commission_pct: 10, gst_amount: 98, driver_bata: 300, passenger_name: 'Smoke Pax', passenger_phone: '+918888888888', passenger_count: 2, hide_passenger_phone: true, posted_by_phone: '+917777777777', driver_instructions: 'Please pick up from gate B.' } });
  const tid = trip.json?.data?.id;
  check('  agent A posted a trip', !!tid, `status=${trip.status} err=${JSON.stringify(trip.json?.error)}`);
  if (!tid) process.exit(1);

  // ── 3. driver D fetches /trips/:id pre-apply — poster name/phone hidden ──
  const preApply = await j('GET', `/trips/${tid}`, { token: D.token });
  check('3a. pre-apply GET /trips/:id status 200', preApply.status === 200);
  check('3b. pre-apply: posted_by_name is undefined', preApply.json?.data && !('posted_by_name' in preApply.json.data));
  check('3c. pre-apply: posted_by_phone is undefined', preApply.json?.data && !('posted_by_phone' in preApply.json.data));
  check('3d. pre-apply: posted_by_handle is present + matches A[0-9A-F]{6}', preApply.json?.data && typeof preApply.json.data.posted_by_handle === 'string' && HANDLE_RE.test(preApply.json.data.posted_by_handle), `got=${preApply.json?.data?.posted_by_handle}`);

  // ── 4. D applies ──────────────────────────────────────────────────────────
  const apply = await j('POST', `/trips/${tid}/applicants`, { token: D.token, body: { applicant_message: 'Available right away' } });
  check('4. driver D applied to the trip', apply.status === 200 && !!apply.json?.data?.id, `status=${apply.status} err=${JSON.stringify(apply.json?.error)}`);

  // ── 5. D re-fetches → reveal ─────────────────────────────────────────────
  const postApply = await j('GET', `/trips/${tid}`, { token: D.token });
  check('5a. post-apply: posted_by_name present', !!postApply.json?.data?.posted_by_name);
  check('5b. post-apply: posted_by_phone present', !!postApply.json?.data?.posted_by_phone);

  // ── 6. A fetches applicants → driver full_name present ────────────────────
  const applicants = await j('GET', `/trips/${tid}/applicants`, { token: A.token });
  const ap = (applicants.json?.data || [])[0];
  check('6a. poster sees ≥1 applicant', !!ap, `count=${(applicants.json?.data || []).length}`);
  check('6b. applicant.driver.full_name present', !!ap?.driver?.full_name);
  check('6c. applicant.driver.display_handle present', !!ap?.driver?.display_handle && HANDLE_RE.test(ap.driver.display_handle));

  // ── 7. POST /trips with phone in driver_instructions → 400 VALIDATION ────
  const bad = await j('POST', '/trips', { token: A.token, body: { from_city_id: cityIds[0], to_city_id: cityIds[1], pickup_at: futureIso(), expected_distance_km: 50, car_type_id: carTypeId, rate_per_km: 14, passenger_count: 1, hide_passenger_phone: true, driver_instructions: 'Call me on 9876543210 before arrival' } });
  check('7. phone in driver_instructions → 400 VALIDATION', bad.status === 400 && bad.json?.error?.code === 'VALIDATION', `status=${bad.status} code=${bad.json?.error?.code}`);

  // ── 8. Read-side phone strip on legacy bad data ──────────────────────────
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const SR = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (SUPABASE_URL && SR) {
    // post a vacancy via the API first (cannot include a phone via the API — guarded), then update its notes via PostgREST service-role to inject one
    const vp = await j('POST', '/vacancies', { token: D.token, body: { current_city_id: cityIds[0], destinations: [{ cityId: cityIds[1] }], notes: 'clean notes' } });
    const vid = vp.json?.data?.id;
    if (!vid) { check('8. seeded vacancy', false, `post status=${vp.status}`); }
    else {
      const r = await fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/vacancies?id=eq.${vid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', apikey: SR, Authorization: `Bearer ${SR}`, Prefer: 'return=minimal' },
        body: JSON.stringify({ notes: 'call 9876543210 to confirm' }),
      });
      check('8a. legacy bad-data injected via service role', r.ok, `status=${r.status}`);
      // Bypass the 30s edge cache by fetching the per-vacancy detail (item cache also bumped to v2)
      const get = await j('GET', `/vacancies/${vid}`);
      const notes = get.json?.data?.notes;
      check('8b. GET /vacancies/:id scrubs phone from notes', typeof notes === 'string' && /\[contact hidden\]/.test(notes) && !/9876543210/.test(notes), `notes=${notes}`);
    }
  } else {
    console.log('  ⚠ 8. skipped — set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to run the legacy-strip check');
  }

  if (failures) {
    console.error(`\n[test-pii-redaction] ${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log('\n[test-pii-redaction] all passed');
})().catch((e) => { console.error(e); process.exit(1); });
