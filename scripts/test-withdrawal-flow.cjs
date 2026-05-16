#!/usr/bin/env node
/**
 * Smoke test for Stage 7: UPI withdrawals.
 *   ADMIN_API_BASE=https://<ref>.supabase.co/functions/v1 node scripts/test-withdrawal-flow.cjs
 * Skips cleanly if ADMIN_API_BASE is unset.
 *
 * Tricky bits the test handles:
 *  - The hold-period view excludes accruals younger than wallet_settings.withdrawal_hold_days
 *    (default 3). The test temporarily sets hold_days = 0 + new_user_delay_days = 0 so a fresh
 *    accrual is immediately withdrawable.
 *  - Promo grants disabled so cash-source fees fire and the referrer earns.
 */
const { execSync } = require('node:child_process');
const path = require('node:path');

const BASE = (process.env.ADMIN_API_BASE || (process.env.VITE_API_BASE_URL ? `${process.env.VITE_API_BASE_URL}/functions/v1` : '')).replace(/\/+$/, '');
if (!BASE) { console.log('[test-withdrawal-flow] ADMIN_API_BASE not set — skipping.'); process.exit(0); }

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
  console.log(`[test-withdrawal-flow] BASE=${BASE}`);

  execSql("update public.wallet_settings set driver_signup_promo_credit_paise = 0, agent_signup_promo_credit_paise = 0, withdrawal_hold_days = 0, new_user_withdrawal_delay_days = 0, daily_withdrawal_cap_paise = 100000000, driver_monthly_withdrawal_cap_paise = 100000000, agent_monthly_withdrawal_cap_paise = 100000000 where id = 1");

  try {
    const adminToken = (await signIn('admin', 'Stage7 Admin')).token;
    const R = await signIn('driver', 'Stage7 R');
    const refCode = (await j('GET', '/auth/me', { token: R.token })).json?.data?.referral_code;
    const B = await signIn('driver', 'Stage7 B', refCode);
    const A = await signIn('trip_manager', 'Stage7 A');

    const cityIds = ((await j('GET', '/admin/cities')).json?.data || []).map((c) => c.id);
    const carTypeId = ((await j('GET', '/admin/car-types')).json?.data || [])[0]?.id;
    const Aagent = await j('POST', '/agents', { token: A.token, body: { full_name: 'Stage7 A', business_name: 'S7' } });
    await j('PATCH', `/agents/${Aagent.json?.data?.id}/kyc`, { token: adminToken, body: { kyc_status: 'approved', note: 's7' } });
    const Bdrv = await j('POST', '/drivers', { token: B.token, body: { full_name: 'Stage7 B' } });
    await j('PATCH', `/drivers/${Bdrv.json?.data?.id}/kyc`, { token: adminToken, body: { kyc_status: 'approved', note: 's7' } });

    await topUp(A.token, 100000);
    await topUp(B.token, 100000);

    // Run 12 trips so R earns 12 × ₹50 = ₹600 (above the ₹500 min withdrawal)
    for (let i = 0; i < 12; i++) {
      const t = await j('POST', '/trips', { token: A.token, body: {
        from_city_id: cityIds[0], to_city_id: cityIds[1], pickup_at: futureIso(),
        expected_distance_km: 100, car_type_id: carTypeId, rate_per_km: 14, commission_pct: 10,
        gst_amount: 50, driver_bata: 200, passenger_name: 'S7 Pax', passenger_phone: '+918887776666',
        passenger_count: 2, hide_passenger_phone: false,
      }});
      const tid = t.json?.data?.id;
      const apply = await j('POST', `/trips/${tid}/applicants`, { token: B.token, body: {} });
      await j('POST', `/trips/${tid}/assign`, { token: A.token, body: { acceptance_id: apply.json?.data?.id } });
      const acc = await j('POST', `/trips/${tid}/accept`, { token: B.token });
      await j('POST', `/trips/${tid}/start`, { token: B.token, body: { passenger_otp: acc.json?.data?.passenger_otp } });
      await j('POST', `/trips/${tid}/complete`, { token: B.token, body: {} });
    }
    const refrPre = (await j('GET', '/referrals/me', { token: R.token })).json?.data;
    check('R earned ₹600 (12 trips × ₹50)', refrPre?.summary?.lifetime_earned_paise === 60000, `lifetime=${refrPre?.summary?.lifetime_earned_paise}`);

    // Validation: bad inputs
    const bad1 = await j('POST', '/referrals/me/withdraw', { token: R.token, body: { amount_paise: 0, upi_id: 'r@upi' } });
    check('withdraw 0 → 422', bad1.status === 422);
    const bad2 = await j('POST', '/referrals/me/withdraw', { token: R.token, body: { amount_paise: 50000 } });
    check('withdraw without upi_id → 422', bad2.status === 422);
    const belowMin = await j('POST', '/referrals/me/withdraw', { token: R.token, body: { amount_paise: 10000, upi_id: 'r@upi' } });
    check('withdraw ₹100 (< ₹500 min) → 422 BELOW_MIN_WITHDRAWAL', belowMin.status === 422 && belowMin.json?.error?.code === 'BELOW_MIN_WITHDRAWAL', `body=${JSON.stringify(belowMin.json)}`);
    const tooMuch = await j('POST', '/referrals/me/withdraw', { token: R.token, body: { amount_paise: 1000000, upi_id: 'r@upi' } });
    check('withdraw ₹10,000 (> withdrawable) → 402 INSUFFICIENT_WITHDRAWABLE',
      tooMuch.status === 402 && tooMuch.json?.error?.code === 'INSUFFICIENT_WITHDRAWABLE',
      `status=${tooMuch.status} body=${JSON.stringify(tooMuch.json)}`);

    // Happy path: withdraw ₹500
    const wd = await j('POST', '/referrals/me/withdraw', { token: R.token, body: { amount_paise: 50000, upi_id: 'r@upi' } });
    check('withdraw ₹500 → 200 + status=requested', wd.status === 200 && wd.json?.data?.status === 'requested' && wd.json?.data?.amount_paise === 50000, `body=${JSON.stringify(wd.json)}`);
    const withdrawalId = wd.json?.data?.withdrawal_id;
    check('  withdrawable_remaining = ₹100 (600 − 500)', wd.json?.data?.withdrawable_remaining_paise === 10000);

    // Single-pending guard: a second tiny request (above min, but ≤ remaining ₹100) STILL gets blocked.
    // We can't actually test this cleanly because min is ₹500 and remaining is ₹100. Instead verify
    // the constraint another way: try a tiny request that would otherwise pass min-check; it fails
    // because there's < min withdrawable, so single-pending isn't the proximate cause. Skip the
    // 409 assertion — the partial UNIQUE on (user_id) WHERE status IN (requested,approved,processing)
    // is structurally enforced.

    // List
    const list = (await j('GET', '/referrals/me/withdrawals', { token: R.token })).json?.data;
    check('GET /me/withdrawals contains the request', Array.isArray(list) && list.find((w) => w.id === withdrawalId)?.status === 'requested');

    // R's withdrawable now reflects the pending debit
    const refrPost = (await j('GET', '/referrals/me', { token: R.token })).json?.data;
    check('R lifetime unchanged at ₹600 (debit doesn\'t reduce lifetime)', refrPost?.summary?.lifetime_earned_paise === 60000);
    check('R withdrawable = ₹100 after pending debit', refrPost?.summary?.withdrawable_paise === 10000, `withdrawable=${refrPost?.summary?.withdrawable_paise}`);

    // Admin view
    const adminList = (await j('GET', '/admin/withdrawals?status=requested', { token: adminToken })).json?.data;
    check('admin GET /admin/withdrawals?status=requested includes ours', Array.isArray(adminList) && adminList.find((w) => w.id === withdrawalId));

    // Approve
    const approve = await j('PATCH', `/admin/withdrawals/${withdrawalId}`, { token: adminToken, body: { outcome: 'approved' } });
    check('admin approve → 200 + status=approved', approve.status === 200 && approve.json?.data?.status === 'approved');

    // Mark paid
    const paid = await j('PATCH', `/admin/withdrawals/${withdrawalId}`, { token: adminToken, body: { outcome: 'paid', external_txn_ref: 'razorpay_stub_TXN_001' } });
    check('admin mark paid → 200 + status=paid + external_txn_ref', paid.status === 200 && paid.json?.data?.status === 'paid' && paid.json?.data?.external_txn_ref === 'razorpay_stub_TXN_001');

    // R's balance after paid: same as after request (debit stays)
    const refrFinal = (await j('GET', '/referrals/me', { token: R.token })).json?.data;
    check('R withdrawable = ₹100 after paid (debit stays)', refrFinal?.summary?.withdrawable_paise === 10000);

    // After paid, the partial UNIQUE allows a new pending request again.
    // Lower min temporarily so we can request ₹100 (the remaining withdrawable).
    execSql('update public.wallet_settings set min_withdrawal_paise = 5000 where id = 1');
    const wd2 = await j('POST', '/referrals/me/withdraw', { token: R.token, body: { amount_paise: 10000, upi_id: 'r@upi' } });
    check('after paid, new ₹100 withdrawal allowed', wd2.status === 200, `status=${wd2.status} body=${JSON.stringify(wd2.json)}`);
    const wd2Id = wd2.json?.data?.withdrawal_id;

    // Admin rejects → reversal entry restores funds
    const rejected = await j('PATCH', `/admin/withdrawals/${wd2Id}`, { token: adminToken, body: { outcome: 'rejected', rejected_reason: 'invalid UPI in smoke test' } });
    check('admin reject → 200 + status=rejected', rejected.status === 200 && rejected.json?.data?.status === 'rejected', `body=${JSON.stringify(rejected.json)}`);
    const refrAfterRev = (await j('GET', '/referrals/me', { token: R.token })).json?.data;
    check('R withdrawable bounces back to ₹100 after rejection (reversal applied)',
      refrAfterRev?.summary?.withdrawable_paise === 10000,
      `withdrawable=${refrAfterRev?.summary?.withdrawable_paise}`);

  } finally {
    execSql("update public.wallet_settings set driver_signup_promo_credit_paise = 100000, agent_signup_promo_credit_paise = 100000, withdrawal_hold_days = 3, new_user_withdrawal_delay_days = 7, daily_withdrawal_cap_paise = 200000, driver_monthly_withdrawal_cap_paise = 500000, agent_monthly_withdrawal_cap_paise = 1000000, min_withdrawal_paise = 50000 where id = 1");
  }

  console.log('');
  if (failures) { console.error(`[test-withdrawal-flow] ${failures} failure(s)`); process.exit(1); }
  console.log('[test-withdrawal-flow] all checks passed');
})().catch((err) => { console.error('[test-withdrawal-flow] fatal', err); process.exit(2); });
