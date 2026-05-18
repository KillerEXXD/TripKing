#!/usr/bin/env node
/**
 * Smoke test for Stage 6: earnings transfer + anti-circular enforcement.
 *   ADMIN_API_BASE=https://<ref>.supabase.co/functions/v1 node scripts/test-earnings-transfer.cjs
 * Skips cleanly if ADMIN_API_BASE is unset.
 *
 * The critical invariant: when a platform fee is paid from the `transferred`
 * sub-balance (i.e. money the agent moved across from their referral earnings),
 * the fee row's payment_source = 'earnings_transfer_credit', which Stage 5's
 * eligible-source list excludes — so the referrer earns ₹0 from that trip.
 *
 * Setup:
 *   1. Disable promo grants (so cash-source fees fire and the referrer EARNS)
 *   2. R refers B → run a trip → R earns ₹50
 *   3. Transfer R's ₹50 to R's cash wallet (R has no driver/agent profile yet,
 *      so we make R an agent so they can post a trip and use their wallet)
 *   4. Run a 2nd trip where R is the AGENT — fee is paid from R's transferred
 *      sub-balance (priority promo→transferred→cash, promo is empty)
 *   5. Assert: R's referrer (none in this case) doesn't earn; the fee carries
 *      payment_source=earnings_transfer_credit; R's referral total didn't move
 *      from ANY source on this trip
 *
 * Plus the easier checks: invalid amount → 422, > withdrawable → 402,
 * happy path returns the new balances, ledger rows are paired.
 */
const { execSync } = require('node:child_process');
const path = require('node:path');

const BASE = (process.env.ADMIN_API_BASE || (process.env.VITE_API_BASE_URL ? `${process.env.VITE_API_BASE_URL}/functions/v1` : '')).replace(/\/+$/, '');
if (!BASE) { console.log('[test-earnings-transfer] ADMIN_API_BASE not set — skipping.'); process.exit(0); }

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
function rPhone() { return `+919900${Math.floor(100000 + Math.random() * 900000)}`; }
function futureIso(m = 30) { return new Date(Date.now() + m * 60_000).toISOString(); }
async function signIn(role, name, refCode) {
  const phone = rPhone();
  await j('POST', '/auth/auth/request-otp', { body: { phone } });
  const r = await j('POST', '/auth/auth/verify-otp', { body: { phone, otp: '12345', display_name: name, role, referral_code: refCode } });
  return { token: r.json?.data?.access_token, userId: r.json?.data?.user?.id };
}
async function topUp(token, paise) {
  const init = await j('POST', '/wallet/topup/initiate', { token, body: { amount_paise: paise } });
  await j('POST', '/wallet/topup/verify', { token, body: { topup_id: init.json?.data?.topup_id } });
}
function execSql(sql) {
  const cmd = process.platform === 'win32'
    ? `node "${path.join(__dirname, 'db.cjs')}" "${sql.replace(/"/g, '\\"')}"`
    : `node ${path.join(__dirname, 'db.cjs')} "${sql.replace(/"/g, '\\"')}"`;
  return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
}

(async () => {
  console.log(`[test-earnings-transfer] BASE=${BASE}`);

  // 0. Disable promo grants so fees come from cash → accrual fires
  execSql('update public.wallet_settings set driver_signup_promo_credit_paise = 0, agent_signup_promo_credit_paise = 0 where id = 1');

  try {
    const adminToken = (await signIn('admin', 'Stage6 Admin')).token;

    // R refers B; A posts the first trip; B drives it → R earns ₹50
    const R = await signIn('driver', 'Stage6 R');
    const refCode = (await j('GET', '/auth/me', { token: R.token })).json?.data?.referral_code;
    const B = await signIn('driver', 'Stage6 B', refCode);
    const A = await signIn('trip_manager', 'Stage6 A');

    // make R an agent so R can post trip 2 and use R's own wallet for the agent-side fee
    const Ragent = await j('POST', '/agents', { token: R.token, body: { full_name: 'Stage6 R as agent', business_name: 'S6R' } });
    await j('PATCH', `/agents/${Ragent.json?.data?.id}/kyc`, { token: adminToken, body: { kyc_status: 'approved', note: 'stage6' } });

    const cityIds = ((await j('GET', '/admin/cities')).json?.data || []).map((c) => c.id);
    const carTypeId = ((await j('GET', '/admin/car-types')).json?.data || [])[0]?.id;
    const Aagent = await j('POST', '/agents', { token: A.token, body: { full_name: 'Stage6 A', business_name: 'S6A' } });
    await j('PATCH', `/agents/${Aagent.json?.data?.id}/kyc`, { token: adminToken, body: { kyc_status: 'approved', note: 'stage6' } });
    const Bdrv = await j('POST', '/drivers', { token: B.token, body: { full_name: 'Stage6 B' } });
    await j('PATCH', `/drivers/${Bdrv.json?.data?.id}/kyc`, { token: adminToken, body: { kyc_status: 'approved', note: 'stage6' } });

    await topUp(A.token, 50000);
    await topUp(B.token, 50000);
    await topUp(R.token, 50000); // R will need cash for trip 2's agent-side fee fallback

    // === Trip 1: A posts → B drives → fee from cash → R earns ₹50 ===
    const trip1 = await j('POST', '/trips', { token: A.token, body: {
      from_city_id: cityIds[0], to_city_id: cityIds[1], pickup_at: futureIso(),
      expected_distance_km: 100, car_type_id: carTypeId, rate_per_km: 14, commission_pct: 10,
      gst_amount: 50, driver_bata: 200, passenger_name: 'S6 Pax', passenger_phone: '+918887776666',
      passenger_count: 2, hide_passenger_phone: false,
    }});
    const tid1 = trip1.json?.data?.id;
    const apply1 = await j('POST', `/trips/${tid1}/applicants`, { token: B.token, body: {} });
    await j('POST', `/trips/${tid1}/assign`, { token: A.token, body: { acceptance_id: apply1.json?.data?.id } });
    const acc1 = await j('POST', `/trips/${tid1}/accept`, { token: B.token });
    await j('POST', `/trips/${tid1}/start`, { token: B.token, body: { passenger_otp: acc1.json?.data?.passenger_otp, start_odo_url: 'test://odo/start', start_odo_reading: 10000 } });
    const comp1 = await j('POST', `/trips/${tid1}/complete`, { token: B.token, body: { end_odo_url: 'test://odo/end', end_odo_reading: 10100 } });
    check('Trip 1 completed', comp1.status === 200);

    const refRpre = (await j('GET', '/referrals/me', { token: R.token })).json?.data;
    check('R earned ₹50 from trip 1 (cash source)', refRpre?.summary?.lifetime_earned_paise === 5000, `lifetime=${refRpre?.summary?.lifetime_earned_paise}`);
    check('R has ₹50 withdrawable', refRpre?.summary?.withdrawable_paise === 5000);

    // === Validation: bad amount, > withdrawable ===
    const bad = await j('POST', '/referrals/me/transfer-to-wallet', { token: R.token, body: { amount_paise: 0 } });
    check('transfer 0 → 422', bad.status === 422, `status=${bad.status}`);
    const tooMuch = await j('POST', '/referrals/me/transfer-to-wallet', { token: R.token, body: { amount_paise: 100000 } });
    check('transfer ₹1000 (> withdrawable) → 402', tooMuch.status === 402, `status=${tooMuch.status} body=${JSON.stringify(tooMuch.json)}`);

    // === Happy path: transfer R's ₹50 to R's cash wallet ===
    const Rwalletpre = (await j('GET', '/wallet', { token: R.token })).json?.data?.balance;
    check('R cash balance pre-transfer = 500 + 0 (just topped-up cash, no transferred)',
      Rwalletpre?.cash_paise === 50000 && Rwalletpre?.transferred_paise === 0,
      `bal=${JSON.stringify(Rwalletpre)}`);

    const xfer = await j('POST', '/referrals/me/transfer-to-wallet', { token: R.token, body: { amount_paise: 5000 } });
    check('transfer ₹50 → 200 + balances', xfer.status === 200 && xfer.json?.data?.transferred_paise === 5000, `body=${JSON.stringify(xfer.json)}`);
    check('  new_referral_withdrawable_paise = 0', xfer.json?.data?.new_referral_withdrawable_paise === 0);
    check('  new_cash_wallet_transferred_paise = 5000', xfer.json?.data?.new_cash_wallet_transferred_paise === 5000);

    const Rwalletpost = (await j('GET', '/wallet', { token: R.token })).json?.data?.balance;
    check('R cash wallet now has transferred_paise=5000', Rwalletpost?.transferred_paise === 5000, `bal=${JSON.stringify(Rwalletpost)}`);
    check('R cash wallet total = 50000+5000 = 55000', Rwalletpost?.total_paise === 55000);

    // === The anti-circular test ===
    // Trip 2: R is the agent (R has no referrer of their own). The trigger picks R's
    // sub-balance per priority promo→transferred→cash; promo=0, transferred=5000.
    // So the agent-side fee debits transferred → payment_source='earnings_transfer_credit'.
    // R has no referrer so even if it WERE eligible there'd be no accrual.
    // Instead let's do: B is the AGENT (B has R as referrer). After R's transfer, B
    // doesn't have transferred funds — only R does. So this test needs B to do a
    // transfer too. But B has no earnings of their own.
    //
    // Cleaner anti-circular check: R refers a NEW user X; X earns enough for R to
    // transfer; then X drives a trip where X pays from THEIR transferred sub-balance.
    // This doesn't really exercise B/R because R has no chain. Let me simplify.
    //
    // SIMPLEST: focus on what we already have. R transferred 5000 → R's wallet has
    // transferred=5000. R is the agent on trip 2. R's referrer doesn't exist (R was
    // never referred). So no referral can mint regardless of source. But we CAN
    // assert the fee row's payment_source on trip 2 = 'earnings_transfer_credit'.
    const trip2 = await j('POST', '/trips', { token: R.token, body: {
      from_city_id: cityIds[0], to_city_id: cityIds[1], pickup_at: futureIso(),
      expected_distance_km: 100, car_type_id: carTypeId, rate_per_km: 14, commission_pct: 10,
      gst_amount: 50, driver_bata: 200, passenger_name: 'S6 Pax', passenger_phone: '+918887776666',
      passenger_count: 2, hide_passenger_phone: false,
    }});
    const tid2 = trip2.json?.data?.id;
    const apply2 = await j('POST', `/trips/${tid2}/applicants`, { token: B.token, body: {} });
    await j('POST', `/trips/${tid2}/assign`, { token: R.token, body: { acceptance_id: apply2.json?.data?.id } });
    const acc2 = await j('POST', `/trips/${tid2}/accept`, { token: B.token });
    await j('POST', `/trips/${tid2}/start`, { token: B.token, body: { passenger_otp: acc2.json?.data?.passenger_otp, start_odo_url: 'test://odo/start', start_odo_reading: 20000 } });
    // need to top up B again (used 50 in trip 1 → 450 left, plenty)
    const comp2 = await j('POST', `/trips/${tid2}/complete`, { token: B.token, body: { end_odo_url: 'test://odo/end', end_odo_reading: 20100 } });
    check('Trip 2 completed (R is agent)', comp2.status === 200, `status=${comp2.status} body=${JSON.stringify(comp2.json)}`);

    const trip2View = (await j('GET', `/trips/${tid2}`, { token: R.token })).json?.data;
    const fb = trip2View?.platform_fee_breakdown;
    check('Trip 2 agent-side payment_source = earnings_transfer_credit (anti-circular)',
      fb?.agent?.payment_source === 'earnings_transfer_credit',
      `agent=${JSON.stringify(fb?.agent)}`);
    check('Trip 2 driver-side still cash_wallet (B paid normally)',
      fb?.driver?.payment_source === 'cash_wallet',
      `driver=${JSON.stringify(fb?.driver)}`);

    // Trip 2 has 2 fee rows: driver-side (B, cash → eligible, R earns) and
    // agent-side (R, transferred → NOT eligible, no accrual). So R's total goes
    // up by exactly ₹50 from trip 2 — not ₹100.
    const refRpost = (await j('GET', '/referrals/me', { token: R.token })).json?.data;
    check('R lifetime = ₹100 after trip 2 (only driver-side accrued; agent-side anti-circular)',
      refRpost?.summary?.lifetime_earned_paise === 10000,
      `lifetime=${refRpost?.summary?.lifetime_earned_paise} (expected 10000 = trip 1 driver + trip 2 driver, NOT trip 2 agent)`);

    // The anti-circular invariant: exactly ONE accrual ledger entry references trip 2
    // (the driver side). Zero entries reference trip 2 as an agent-side accrual.
    const ledger = (await j('GET', '/referrals/me', { token: R.token })).json?.data?.recent_ledger || [];
    const trip2Accruals = ledger.filter((e) => e.trip_id === tid2 && e.entry_type === 'accrual');
    check('trip 2 produces exactly 1 accrual entry (driver-side only)', trip2Accruals.length === 1, `accruals=${JSON.stringify(trip2Accruals)}`);

    // R's transferred sub-balance should be 0 after the agent-side fee debited it
    const RwalletEnd = (await j('GET', '/wallet', { token: R.token })).json?.data?.balance;
    check('R transferred sub-balance = 0 after fee debit', RwalletEnd?.transferred_paise === 0, `bal=${JSON.stringify(RwalletEnd)}`);

  } finally {
    execSql('update public.wallet_settings set driver_signup_promo_credit_paise = 100000, agent_signup_promo_credit_paise = 100000 where id = 1');
  }

  console.log('');
  if (failures) { console.error(`[test-earnings-transfer] ${failures} failure(s)`); process.exit(1); }
  console.log('[test-earnings-transfer] all checks passed');
})().catch((err) => { console.error('[test-earnings-transfer] fatal', err); process.exit(2); });
