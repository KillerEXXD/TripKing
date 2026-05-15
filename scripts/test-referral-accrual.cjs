#!/usr/bin/env node
/**
 * Smoke test for Stage 4: referral qualification + per-trip accrual.
 *   ADMIN_API_BASE=https://<ref>.supabase.co/functions/v1 node scripts/test-referral-accrual.cjs
 * Skips cleanly if ADMIN_API_BASE is unset.
 *
 * The hard part: the Stage 3 fee trigger spends `promo` first by default, so a freshly
 * signed-up user always pays from launch credit — which is NOT referral-eligible (the
 * anti-circular rule). To force a `cash`-source debit and prove accrual works, we
 * temporarily set wallet_settings.{driver,agent}_signup_promo_credit_paise = 0 BEFORE
 * signing up the test users; they get no promo grant; we top them up to cash via the
 * Stage-2 stub Razorpay flow; trip completes → cash debit → referral accrual fires.
 *
 * Covers:
 *  - referrer_R refers driver_B → after B signs up with R's code, referral_links has a row
 *  - B drives a trip for agent_A (also fresh, no promo)
 *  - both sides paid from CASH → referral_ledger has 2 accruals (R earned ₹50, anyone
 *    referring A would earn ₹50; A is unreferred so no agent-side accrual)
 *  - Cap math: after the trip, R's referral_links row has total_earned_paise=5000,
 *    eligible_paid_trips_count=1, status=earning_active
 *  - GET /referrals/me returns the right summary
 *  - GET /referrals/me/referred lists the link
 *  - GET /drivers/me .referral.summary reflects the earned amount
 *  - A second eligible trip → second accrual; cap math compounds
 */
const { execSync } = require('node:child_process');
const path = require('node:path');

const BASE = (process.env.ADMIN_API_BASE || (process.env.VITE_API_BASE_URL ? `${process.env.VITE_API_BASE_URL}/functions/v1` : '')).replace(/\/+$/, '');
if (!BASE) {
  console.log('[test-referral-accrual] ADMIN_API_BASE not set — skipping.');
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
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
}
function randomPhone() { return `+919900${Math.floor(100000 + Math.random() * 900000)}`; }
function futureIso(m = 30) { return new Date(Date.now() + m * 60_000).toISOString(); }
async function signIn(role, name) {
  const phone = randomPhone();
  await j('POST', '/auth/auth/request-otp', { body: { phone } });
  const r = await j('POST', '/auth/auth/verify-otp', { body: { phone, otp: '12345', display_name: name, role } });
  return { token: r.json?.data?.access_token, userId: r.json?.data?.user?.id, phone };
}
async function signInWithRef(role, name, refCode) {
  const phone = randomPhone();
  await j('POST', '/auth/auth/request-otp', { body: { phone } });
  const r = await j('POST', '/auth/auth/verify-otp', { body: { phone, otp: '12345', display_name: name, role, referral_code: refCode } });
  return { token: r.json?.data?.access_token, userId: r.json?.data?.user?.id, attribution: r.json?.data?.referral_attribution };
}
function execSql(sql) {
  // db.cjs is in this same scripts/ directory
  const cmd = process.platform === 'win32'
    ? `node "${path.join(__dirname, 'db.cjs')}" "${sql.replace(/"/g, '\\"')}"`
    : `node ${path.join(__dirname, 'db.cjs')} "${sql.replace(/"/g, '\\"')}"`;
  return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
}

(async () => {
  console.log(`[test-referral-accrual] BASE=${BASE}`);

  // 0. Disable the promo grant for THIS run so we can force cash-source fees
  console.log('  · setting wallet_settings.driver/agent_signup_promo_credit_paise = 0');
  execSql('update public.wallet_settings set driver_signup_promo_credit_paise = 0, agent_signup_promo_credit_paise = 0 where id = 1');

  let referrerCode;
  try {
    const adminToken = (await signIn('admin', 'Refer Accrual Admin')).token;

    // 1. Referrer R — gets a referral code, no profile needed
    const R = await signIn('driver', 'Refer Accrual R');
    const meR = (await j('GET', '/auth/me', { token: R.token })).json?.data;
    referrerCode = meR?.referral_code;
    check('R has a referral_code', typeof referrerCode === 'string' && referrerCode.length === 8);

    // 2. Driver B signs up with R's code
    const B = await signInWithRef('driver', 'Refer Accrual B', referrerCode);
    check('B attached to R', B.attribution === 'attached', `attr=${B.attribution}`);

    // 3. Agent A (no referrer)
    const A = await signIn('trip_manager', 'Refer Accrual A');

    // 4. Profiles + KYC
    const cityIds = ((await j('GET', '/admin/cities')).json?.data || []).map((c) => c.id);
    const carTypeId = ((await j('GET', '/admin/car-types')).json?.data || [])[0]?.id;
    const agentRow = await j('POST', '/agents', { token: A.token, body: { full_name: 'Refer Accrual A', business_name: 'Refer Accrual Travels' } });
    const agentId = agentRow.json?.data?.id;
    await j('PATCH', `/agents/${agentId}/kyc`, { token: adminToken, body: { kyc_status: 'approved', note: 'refer-accrual' } });
    const drvRow = await j('POST', '/drivers', { token: B.token, body: { full_name: 'Refer Accrual B' } });
    const drvId = drvRow.json?.data?.id;
    await j('PATCH', `/drivers/${drvId}/kyc`, { token: adminToken, body: { kyc_status: 'approved', note: 'refer-accrual' } });

    // 5. Both wallets should be EMPTY (we disabled the promo grant); top up via stub Razorpay
    const wA = (await j('GET', '/wallet', { token: A.token })).json?.data?.balance;
    const wB = (await j('GET', '/wallet', { token: B.token })).json?.data?.balance;
    check('A wallet is empty (promo disabled)', wA?.promo_paise === 0 && wA?.cash_paise === 0, `bal=${JSON.stringify(wA)}`);
    check('B wallet is empty (promo disabled)', wB?.promo_paise === 0 && wB?.cash_paise === 0);

    async function topUp(token, paise) {
      const init = await j('POST', '/wallet/topup/initiate', { token, body: { amount_paise: paise } });
      const verify = await j('POST', '/wallet/topup/verify', { token, body: { topup_id: init.json?.data?.topup_id } });
      return verify.status === 200;
    }
    check('top up A by ₹500 (cash)', await topUp(A.token, 50000));
    check('top up B by ₹500 (cash)', await topUp(B.token, 50000));

    // 6. Verify R has a signed_up referral_links row before the trip
    const refrPre = (await j('GET', '/referrals/me', { token: R.token })).json?.data;
    check('R has 1 referred user pre-trip', refrPre?.summary?.counts?.total_referred === 1, `summary=${JSON.stringify(refrPre?.summary?.counts)}`);
    check('R has 0 lifetime earned pre-trip', refrPre?.summary?.lifetime_earned_paise === 0);

    // 7. Run a trip: A posts → B applies → assign → accept → start → complete
    const baseTrip = {
      from_city_id: cityIds[0], to_city_id: cityIds[1],
      pickup_at: futureIso(), expected_distance_km: 100,
      car_type_id: carTypeId, rate_per_km: 14, commission_pct: 10, gst_amount: 50, driver_bata: 200,
      passenger_name: 'Refer Pax', passenger_phone: '+918888777700', passenger_count: 2,
      hide_passenger_phone: false,
    };
    const post = await j('POST', '/trips', { token: A.token, body: baseTrip });
    const tripId = post.json?.data?.id;
    check('POST /trips → 200', post.status === 200 && !!tripId);

    const apply = await j('POST', `/trips/${tripId}/applicants`, { token: B.token, body: { applicant_message: 'go' } });
    const aid = apply.json?.data?.id;
    await j('POST', `/trips/${tripId}/assign`, { token: A.token, body: { acceptance_id: aid } });
    const accept = await j('POST', `/trips/${tripId}/accept`, { token: B.token });
    const otp = accept.json?.data?.passenger_otp;
    await j('POST', `/trips/${tripId}/start`, { token: B.token, body: { passenger_otp: otp } });
    const complete = await j('POST', `/trips/${tripId}/complete`, { token: B.token, body: {} });
    check('POST /trips/:id/complete → 200, completed', complete.status === 200 && complete.json?.data?.status === 'completed', `status=${complete.status} body=${JSON.stringify(complete.json?.error)}`);

    // 8. Both wallets should have lost ₹50 from CASH (not promo)
    const wA2 = (await j('GET', '/wallet', { token: A.token })).json?.data?.balance;
    const wB2 = (await j('GET', '/wallet', { token: B.token })).json?.data?.balance;
    check('A cash dropped by ₹50', wA2?.cash_paise === 45000, `cash=${wA2?.cash_paise}`);
    check('B cash dropped by ₹50', wB2?.cash_paise === 45000, `cash=${wB2?.cash_paise}`);

    // 9. fee_breakdown shows source=cash_wallet
    const tripView = (await j('GET', `/trips/${tripId}`, { token: A.token })).json?.data;
    check('platform_fee_breakdown.driver source=cash_wallet', tripView?.platform_fee_breakdown?.driver?.payment_source === 'cash_wallet');
    check('platform_fee_breakdown.agent source=cash_wallet',  tripView?.platform_fee_breakdown?.agent?.payment_source === 'cash_wallet');

    // 10. R's referral_ledger has +₹50 (from B's driver-side cash fee)
    const refrPost = (await j('GET', '/referrals/me', { token: R.token })).json?.data;
    check('R lifetime earned = ₹50', refrPost?.summary?.lifetime_earned_paise === 5000, `lifetime=${refrPost?.summary?.lifetime_earned_paise}`);
    check('R withdrawable = ₹50', refrPost?.summary?.withdrawable_paise === 5000);
    check('R earning_active count = 1', refrPost?.summary?.counts?.earning_active === 1, `counts=${JSON.stringify(refrPost?.summary?.counts)}`);
    check('R recent ledger has 1 accrual entry of ₹50',
      Array.isArray(refrPost?.recent_ledger)
        && refrPost.recent_ledger.length === 1
        && refrPost.recent_ledger[0].entry_type === 'accrual'
        && refrPost.recent_ledger[0].amount_paise === 5000,
      `ledger=${JSON.stringify(refrPost?.recent_ledger)}`);

    // 11. R's GET /me/referred shows the link with earning_active status
    const referredList = (await j('GET', '/referrals/me/referred', { token: R.token })).json?.data;
    check('R has 1 link in /me/referred', Array.isArray(referredList) && referredList.length === 1);
    const link = referredList?.[0];
    check('link status = earning_active', link?.status === 'earning_active', `status=${link?.status}`);
    check('link total_earned_paise = 5000', link?.total_earned_paise === 5000);
    check('link eligible_paid_trips_count = 1', link?.eligible_paid_trips_count === 1);

    // 12. B's referrer block in /drivers/me reflects R is referred_by
    const drvMe = (await j('GET', '/drivers/me', { token: B.token })).json?.data;
    check('B /drivers/me referral.referred_by_user_id = R.id', drvMe?.referral?.referred_by_user_id === R.userId);
    // B has no referrals of their own → summary zeros
    check('B /drivers/me referral.summary.lifetime = 0', drvMe?.referral?.summary?.lifetime_earned_paise === 0);

    // 13. R's /drivers/me would error (R has no driver profile yet) — skip; the /referrals
    //     endpoint is the canonical referrer view. /drivers/me + /agents/me referral block is
    //     for users who happen to have BOTH a profile and referrals.

    // 14. A second trip → second accrual; total goes to ₹100; eligible_paid_trips_count=2
    await topUp(A.token, 50000);
    await topUp(B.token, 50000);
    const post2 = await j('POST', '/trips', { token: A.token, body: baseTrip });
    const tid2 = post2.json?.data?.id;
    const apply2 = await j('POST', `/trips/${tid2}/applicants`, { token: B.token, body: {} });
    await j('POST', `/trips/${tid2}/assign`, { token: A.token, body: { acceptance_id: apply2.json?.data?.id } });
    const accept2 = await j('POST', `/trips/${tid2}/accept`, { token: B.token });
    await j('POST', `/trips/${tid2}/start`, { token: B.token, body: { passenger_otp: accept2.json?.data?.passenger_otp } });
    await j('POST', `/trips/${tid2}/complete`, { token: B.token, body: {} });

    const refr3 = (await j('GET', '/referrals/me', { token: R.token })).json?.data;
    check('R lifetime after 2 trips = ₹100', refr3?.summary?.lifetime_earned_paise === 10000, `lifetime=${refr3?.summary?.lifetime_earned_paise}`);
    const referred2 = (await j('GET', '/referrals/me/referred', { token: R.token })).json?.data;
    check('link total_earned_paise = 10000 (2 trips)', referred2?.[0]?.total_earned_paise === 10000);
    check('link eligible_paid_trips_count = 2', referred2?.[0]?.eligible_paid_trips_count === 2);

    // 15. /me/earnings has at least 1 day with the right total
    const earnings = (await j('GET', '/referrals/me/earnings', { token: R.token })).json?.data;
    const today = new Date().toISOString().slice(0, 10);
    const todayRow = (earnings?.days || []).find((d) => d.date === today);
    check('/me/earnings today shows ₹100 (2 trips)', todayRow?.paise === 10000 && todayRow?.trips === 2, `today=${JSON.stringify(todayRow)}`);

    // 16. Drilldown by link_id
    const linkId = referred2?.[0]?.id;
    const drill = (await j('GET', `/referrals/${linkId}`, { token: R.token })).json?.data;
    check('GET /referrals/:link_id → link + ledger array',
      drill?.link?.id === linkId && Array.isArray(drill?.ledger) && drill.ledger.length === 2,
      `drill=${JSON.stringify(drill)}`);

  } finally {
    // restore promo grant defaults so future test runs / production users get the launch credit
    console.log('  · restoring wallet_settings.driver/agent_signup_promo_credit_paise = 100000');
    execSql('update public.wallet_settings set driver_signup_promo_credit_paise = 100000, agent_signup_promo_credit_paise = 100000 where id = 1');
  }

  console.log('');
  if (failures) { console.error(`[test-referral-accrual] ${failures} failure(s)`); process.exit(1); }
  console.log('[test-referral-accrual] all checks passed');
})().catch((err) => { console.error('[test-referral-accrual] fatal', err); process.exit(2); });
