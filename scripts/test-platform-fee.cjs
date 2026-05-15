#!/usr/bin/env node
/**
 * Smoke test for Stage 3: dual-side platform fee charging + App Wallet.
 *   ADMIN_API_BASE=https://<ref>.supabase.co/functions/v1 node scripts/test-platform-fee.cjs
 * Skips cleanly if ADMIN_API_BASE is unset.
 *
 * Covers:
 *  - completing a trip charges Driver ₹50 AND Agent ₹50 (both from launch credit
 *    by default — newly signed-up users have ₹1,000 promo each)
 *  - both wallets show -₹50 from sub_balance='promo' after completion
 *  - GET /trips/:id returns platform_fee_breakdown with both sides
 *  - the ledger entries reference the platform_fee_charge rows
 *  - re-completing the same trip is rejected (CONFLICT) and does NOT double-charge
 */
const BASE = (process.env.ADMIN_API_BASE || (process.env.VITE_API_BASE_URL ? `${process.env.VITE_API_BASE_URL}/functions/v1` : '')).replace(/\/+$/, '');
if (!BASE) {
  console.log('[test-platform-fee] ADMIN_API_BASE not set — skipping.');
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
function randomPhone() { return `+919900${Math.floor(100000 + Math.random() * 900000)}`; }
function futureIso(minsAhead = 30) { return new Date(Date.now() + minsAhead * 60_000).toISOString(); }

async function signIn(role, name) {
  const phone = randomPhone();
  await j('POST', '/auth/auth/request-otp', { body: { phone } });
  const r = await j('POST', '/auth/auth/verify-otp', { body: { phone, otp: '12345', display_name: name, role } });
  return { token: r.json?.data?.access_token, userId: r.json?.data?.user?.id };
}

(async () => {
  console.log(`[test-platform-fee] BASE=${BASE}`);

  const adminToken = (await signIn('admin', 'Fee Smoke Admin')).token;
  const agent = await signIn('trip_manager', 'Fee Smoke Agent');
  const driver = await signIn('driver',  'Fee Smoke Driver');
  check('signed in admin / agent / driver', !!adminToken && !!agent.token && !!driver.token);

  // City + car-type pickers from existing public reference data
  const cityIds = ((await j('GET', '/admin/cities')).json?.data || []).map((c) => c.id);
  const carTypeId = ((await j('GET', '/admin/car-types')).json?.data || [])[0]?.id;
  if (cityIds.length < 2 || !carTypeId) { console.error('Need ≥2 cities + a car type'); process.exit(1); }

  // Agent profile + KYC approval
  const agentRow = await j('POST', '/agents', { token: agent.token, body: { full_name: 'Fee Smoke Agent', business_name: 'Fee Smoke Travels' } });
  const agentId = agentRow.json?.data?.id;
  await j('PATCH', `/agents/${agentId}/kyc`, { token: adminToken, body: { kyc_status: 'approved', note: 'fee-smoke' } });

  // Driver profile + KYC approval
  const drvRow = await j('POST', '/drivers', { token: driver.token, body: { full_name: 'Fee Smoke Driver' } });
  const drvId = drvRow.json?.data?.id;
  await j('PATCH', `/drivers/${drvId}/kyc`, { token: adminToken, body: { kyc_status: 'approved', note: 'fee-smoke' } });

  // BOTH should have ₹1,000 promo from Stage 2 — sanity check
  const agentWalletPre = (await j('GET', '/wallet', { token: agent.token })).json?.data?.balance;
  const driverWalletPre = (await j('GET', '/wallet', { token: driver.token })).json?.data?.balance;
  check('agent has ₹1,000 promo at start', agentWalletPre?.promo_paise === 100000, `promo=${agentWalletPre?.promo_paise}`);
  check('driver has ₹1,000 promo at start', driverWalletPre?.promo_paise === 100000, `promo=${driverWalletPre?.promo_paise}`);

  // Post a trip
  const baseTrip = {
    from_city_id: cityIds[0], to_city_id: cityIds[1],
    pickup_at: futureIso(), expected_distance_km: 100,
    car_type_id: carTypeId, rate_per_km: 14, commission_pct: 10, gst_amount: 50, driver_bata: 200,
    passenger_name: 'Fee Pax', passenger_phone: '+918888999900', passenger_count: 2,
    hide_passenger_phone: false,
  };
  const post = await j('POST', '/trips', { token: agent.token, body: baseTrip });
  const tripId = post.json?.data?.id;
  check('POST /trips → 200 + id', post.status === 200 && !!tripId, `status=${post.status}`);

  // Apply → assign → accept → start → complete
  const apply = await j('POST', `/trips/${tripId}/applicants`, { token: driver.token, body: { applicant_message: 'fee-smoke' } });
  const aid = apply.json?.data?.id;
  check('POST /trips/:id/applicants → 200', apply.status === 200 && !!aid, `status=${apply.status} body=${JSON.stringify(apply.json)}`);

  const assign = await j('POST', `/trips/${tripId}/assign`, { token: agent.token, body: { acceptance_id: aid } });
  check('POST /trips/:id/assign → 200', assign.status === 200, `status=${assign.status}`);

  const accept = await j('POST', `/trips/${tripId}/accept`, { token: driver.token });
  const otp = accept.json?.data?.passenger_otp;
  check('POST /trips/:id/accept → 200 + OTP', accept.status === 200 && !!otp, `status=${accept.status}`);

  const start = await j('POST', `/trips/${tripId}/start`, { token: driver.token, body: { passenger_otp: otp } });
  check('POST /trips/:id/start → 200, in_progress', start.status === 200 && start.json?.data?.status === 'in_progress', `status=${start.status}`);

  // 🎯 The big one — completion fires the dual-side fee trigger
  const complete = await j('POST', `/trips/${tripId}/complete`, { token: driver.token, body: { driver_notes: 'fee-smoke' } });
  check('POST /trips/:id/complete → 200, completed', complete.status === 200 && complete.json?.data?.status === 'completed', `status=${complete.status} body=${JSON.stringify(complete.json?.error)}`);

  // Both wallets should have lost ₹50 from promo
  const agentWalletPost = (await j('GET', '/wallet', { token: agent.token })).json?.data?.balance;
  const driverWalletPost = (await j('GET', '/wallet', { token: driver.token })).json?.data?.balance;
  check('agent promo balance dropped by ₹50 (now ₹950)', agentWalletPost?.promo_paise === 95000, `was ${agentWalletPre?.promo_paise} → ${agentWalletPost?.promo_paise}`);
  check('driver promo balance dropped by ₹50 (now ₹950)', driverWalletPost?.promo_paise === 95000, `was ${driverWalletPre?.promo_paise} → ${driverWalletPost?.promo_paise}`);
  check('agent total dropped by ₹50',  agentWalletPost?.total_paise === (agentWalletPre?.total_paise - 5000));
  check('driver total dropped by ₹50', driverWalletPost?.total_paise === (driverWalletPre?.total_paise - 5000));

  // Each wallet's recent ledger has a fee_debit row referencing platform_fee_charge
  const agentLedger = (await j('GET', '/wallet', { token: agent.token })).json?.data?.recent_ledger || [];
  const driverLedger = (await j('GET', '/wallet', { token: driver.token })).json?.data?.recent_ledger || [];
  const agentFeeRow = agentLedger.find((e) => e.entry_type === 'fee_debit' && e.amount_paise === -5000);
  const driverFeeRow = driverLedger.find((e) => e.entry_type === 'fee_debit' && e.amount_paise === -5000);
  check('agent ledger has fee_debit -₹50 (sub=promo, source=promo_credit, ref=platform_fee_charge)',
    agentFeeRow && agentFeeRow.sub_balance === 'promo' && agentFeeRow.payment_source === 'promo_credit' && agentFeeRow.reference_type === 'platform_fee_charge',
    `row=${JSON.stringify(agentFeeRow)}`);
  check('driver ledger has fee_debit -₹50 (sub=promo, source=promo_credit, ref=platform_fee_charge)',
    driverFeeRow && driverFeeRow.sub_balance === 'promo' && driverFeeRow.payment_source === 'promo_credit' && driverFeeRow.reference_type === 'platform_fee_charge',
    `row=${JSON.stringify(driverFeeRow)}`);

  // GET /trips/:id exposes platform_fee_breakdown to the agent
  const tripView = (await j('GET', `/trips/${tripId}`, { token: agent.token })).json?.data;
  const fb = tripView?.platform_fee_breakdown;
  check('GET /trips/:id → platform_fee_breakdown.driver charged from promo_credit',
    fb?.driver?.amount_paise === 5000 && fb?.driver?.payment_source === 'promo_credit' && fb?.driver?.status === 'charged',
    `driver=${JSON.stringify(fb?.driver)}`);
  check('GET /trips/:id → platform_fee_breakdown.agent charged from promo_credit',
    fb?.agent?.amount_paise === 5000 && fb?.agent?.payment_source === 'promo_credit' && fb?.agent?.status === 'charged',
    `agent=${JSON.stringify(fb?.agent)}`);

  // Re-completing must conflict and NOT double-charge
  const reComplete = await j('POST', `/trips/${tripId}/complete`, { token: driver.token, body: {} });
  check('POST /trips/:id/complete a second time → 409 CONFLICT', reComplete.status === 409, `status=${reComplete.status}`);
  const agentWalletAfterRetry = (await j('GET', '/wallet', { token: agent.token })).json?.data?.balance;
  check('no double-charge after retry (agent balance unchanged)', agentWalletAfterRetry?.promo_paise === 95000);

  console.log('');
  if (failures) { console.error(`[test-platform-fee] ${failures} failure(s)`); process.exit(1); }
  console.log('[test-platform-fee] all checks passed');
})().catch((err) => { console.error('[test-platform-fee] fatal', err); process.exit(2); });
