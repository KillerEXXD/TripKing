#!/usr/bin/env node
/**
 * Smoke test for Stage 8: referral + withdrawal notifications fan out from triggers.
 *   ADMIN_API_BASE=https://<ref>.supabase.co/functions/v1 node scripts/test-referral-notifications.cjs
 * Skips cleanly if ADMIN_API_BASE is unset.
 *
 * Covers:
 *  - referral_signup fired to R when B signs up with R's code
 *  - referral_verified fired when B's KYC flips to approved
 *  - referral_earning fired on each accrual
 *  - referral_qualified / earning_active fired on first qualification
 *  - withdrawal_requested + withdrawal_paid fired on the withdrawal lifecycle
 *  - title/body rendered from notification_templates with {var} substitution
 */
const { execSync } = require('node:child_process');
const path = require('node:path');

const BASE = (process.env.ADMIN_API_BASE || (process.env.VITE_API_BASE_URL ? `${process.env.VITE_API_BASE_URL}/functions/v1` : '')).replace(/\/+$/, '');
if (!BASE) { console.log('[test-referral-notifications] ADMIN_API_BASE not set — skipping.'); process.exit(0); }

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
function notificationsFor(userId) {
  const out = execSql(`select type, title, body, payload_json from public.notifications where user_id = '${userId}' order by created_at desc limit 50`);
  // db.cjs prints two top-level arrays: [status] then [rows]. The rows array is the
  // SECOND [...] block. Parse by finding brace-balanced regions.
  const lines = out.split('\n');
  let depth = 0; let buf = ''; let arrays = [];
  for (const ch of out) {
    if (ch === '[') { if (depth === 0) buf = ''; depth++; buf += ch; }
    else if (ch === ']') { buf += ch; depth--; if (depth === 0) arrays.push(buf); }
    else if (depth > 0) buf += ch;
  }
  void lines;
  // arrays[0] is the [status] (e.g. "[201]"), arrays[1] is the rows array
  if (arrays.length < 2) return [];
  try { return JSON.parse(arrays[arrays.length - 1]); } catch { return []; }
}

(async () => {
  console.log(`[test-referral-notifications] BASE=${BASE}`);

  execSql("update public.wallet_settings set driver_signup_promo_credit_paise = 0, agent_signup_promo_credit_paise = 0, withdrawal_hold_days = 0, new_user_withdrawal_delay_days = 0, daily_withdrawal_cap_paise = 100000000, driver_monthly_withdrawal_cap_paise = 100000000, agent_monthly_withdrawal_cap_paise = 100000000 where id = 1");

  try {
    const adminToken = (await signIn('admin', 'Stage8 Admin')).token;
    const R = await signIn('driver', 'Stage8 R');
    const refCode = (await j('GET', '/auth/me', { token: R.token })).json?.data?.referral_code;

    // 1. B signs up with R's code → R should get a referral_signup notification
    const B = await signIn('driver', 'Stage8 B', refCode);
    let notifs = notificationsFor(R.userId);
    const signupNotif = notifs.find((n) => n.type === 'referral_signup');
    check('referral_signup fired to R', !!signupNotif, `notifs=${JSON.stringify(notifs.map((n) => n.type))}`);
    check('  title rendered with {name}', signupNotif?.title?.includes('referral') || signupNotif?.title?.includes('New'));
    check('  body contains "Stage8 B"', signupNotif?.body?.includes('Stage8 B'), `body=${signupNotif?.body}`);

    // 2. KYC approval → referral_verified
    const A = await signIn('trip_manager', 'Stage8 A');
    const Aagent = await j('POST', '/agents', { token: A.token, body: { full_name: 'Stage8 A', business_name: 'S8' } });
    await j('PATCH', `/agents/${Aagent.json?.data?.id}/kyc`, { token: adminToken, body: { kyc_status: 'approved' } });
    const Bdrv = await j('POST', '/drivers', { token: B.token, body: { full_name: 'Stage8 B' } });
    await j('PATCH', `/drivers/${Bdrv.json?.data?.id}/kyc`, { token: adminToken, body: { kyc_status: 'approved' } });

    notifs = notificationsFor(R.userId);
    const verifiedNotif = notifs.find((n) => n.type === 'referral_verified');
    check('referral_verified fired to R when B KYC approved', !!verifiedNotif, `notifs=${JSON.stringify(notifs.map((n) => n.type))}`);

    // 3. First eligible trip → referral_first_eligible_trip + referral_qualified + referral_earning
    await topUp(A.token, 50000);
    await topUp(B.token, 50000);
    const t = await j('POST', '/trips', { token: A.token, body: {
      from_city_id: ((await j('GET', '/admin/cities')).json?.data || [])[0]?.id,
      to_city_id:   ((await j('GET', '/admin/cities')).json?.data || [])[1]?.id,
      pickup_at: futureIso(), expected_distance_km: 100,
      car_type_id: ((await j('GET', '/admin/car-types')).json?.data || [])[0]?.id,
      rate_per_km: 14, commission_pct: 10, gst_amount: 50, driver_bata: 200,
      passenger_name: 'S8 Pax', passenger_phone: '+918887776666', passenger_count: 2, hide_passenger_phone: false,
    }});
    const tid = t.json?.data?.id;
    const apply = await j('POST', `/trips/${tid}/applicants`, { token: B.token, body: {} });
    await j('POST', `/trips/${tid}/assign`, { token: A.token, body: { acceptance_id: apply.json?.data?.id } });
    const acc = await j('POST', `/trips/${tid}/accept`, { token: B.token });
    await j('POST', `/trips/${tid}/start`, { token: B.token, body: { passenger_otp: acc.json?.data?.passenger_otp, start_odo_url: 'test://odo/start', start_odo_reading: 10000 } });
    await j('POST', `/trips/${tid}/complete`, { token: B.token, body: { end_odo_url: 'test://odo/end', end_odo_reading: 10100 } });

    notifs = notificationsFor(R.userId);
    const earnNotif = notifs.find((n) => n.type === 'referral_earning');
    check('referral_earning fired to R after eligible trip', !!earnNotif, `types=${JSON.stringify(notifs.map((n) => n.type))}`);
    check('  earning body has Lifetime + amount', earnNotif?.body?.includes('Lifetime earned: ₹50'), `body=${earnNotif?.body}`);
    const qualNotif = notifs.find((n) => n.type === 'referral_qualified');
    check('referral_qualified fired (Stage 4 single-tier qualifies on first accrual)', !!qualNotif);

    // 4. Withdrawal lifecycle → withdrawal_requested + withdrawal_paid
    execSql('update public.wallet_settings set min_withdrawal_paise = 5000 where id = 1');
    const wd = await j('POST', '/referrals/me/withdraw', { token: R.token, body: { amount_paise: 5000, upi_id: 'r@upi' } });
    check('withdrawal request 200', wd.status === 200, `status=${wd.status} body=${JSON.stringify(wd.json)}`);
    notifs = notificationsFor(R.userId);
    check('withdrawal_requested fired to R', notifs.some((n) => n.type === 'withdrawal_requested'));

    const wdId = wd.json?.data?.withdrawal_id;
    await j('PATCH', `/admin/withdrawals/${wdId}`, { token: adminToken, body: { outcome: 'paid', external_txn_ref: 'razorpay_test_PAY_001' } });
    notifs = notificationsFor(R.userId);
    const paidNotif = notifs.find((n) => n.type === 'withdrawal_paid');
    check('withdrawal_paid fired to R', !!paidNotif, `types=${JSON.stringify(notifs.map((n) => n.type))}`);
    check('  paid notification body contains the txn ref', paidNotif?.body?.includes('razorpay_test_PAY_001'), `body=${paidNotif?.body}`);

  } finally {
    execSql("update public.wallet_settings set driver_signup_promo_credit_paise = 100000, agent_signup_promo_credit_paise = 100000, withdrawal_hold_days = 3, new_user_withdrawal_delay_days = 7, daily_withdrawal_cap_paise = 200000, driver_monthly_withdrawal_cap_paise = 500000, agent_monthly_withdrawal_cap_paise = 1000000, min_withdrawal_paise = 50000 where id = 1");
  }

  console.log('');
  if (failures) { console.error(`[test-referral-notifications] ${failures} failure(s)`); process.exit(1); }
  console.log('[test-referral-notifications] all checks passed');
})().catch((err) => { console.error('[test-referral-notifications] fatal', err); process.exit(2); });
