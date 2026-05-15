#!/usr/bin/env node
/**
 * Smoke test for the Stage-2 launch credit grant + Cash Wallet endpoints.
 *   ADMIN_API_BASE=https://<ref>.supabase.co/functions/v1 node scripts/test-onboarding-promo.cjs
 * Skips cleanly if ADMIN_API_BASE is unset.
 *
 * Covers:
 *  - new driver signup → after POST /drivers, GET /wallet shows ₹1,000 promo balance
 *  - new agent signup  → after POST /agents,  GET /wallet shows ₹1,000 promo balance
 *  - one user with BOTH profiles → promo granted twice (₹2,000 total promo)
 *  - re-creating the same profile is idempotent (no double credit)
 *  - GET /wallet returns total_paise = sum of sub-balances + a ledger entry per grant
 */
const BASE = (process.env.ADMIN_API_BASE || (process.env.VITE_API_BASE_URL ? `${process.env.VITE_API_BASE_URL}/functions/v1` : '')).replace(/\/+$/, '');
if (!BASE) {
  console.log('[test-onboarding-promo] ADMIN_API_BASE not set — skipping.');
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

const randomPhone = () => `+919900${Math.floor(100000 + Math.random() * 900000)}`;

async function signUp(role, displayName) {
  const phone = randomPhone();
  await j('POST', '/auth/auth/request-otp', { body: { phone } });
  const r = await j('POST', '/auth/auth/verify-otp', { body: { phone, otp: '12345', display_name: displayName, role } });
  return { phone, token: r.json?.data?.access_token, userId: r.json?.data?.user?.id };
}

(async () => {
  console.log(`[test-onboarding-promo] BASE=${BASE}`);

  // 1. Driver path
  const a = await signUp('driver', 'Promo Smoke Driver');
  check('driver signup got token', !!a.token);
  // BEFORE creating profile — wallet should be 0
  const wPre = await j('GET', '/wallet', { token: a.token });
  check('GET /wallet for new user (no profile yet) → 200', wPre.status === 200, `status ${wPre.status}`);
  check('  pre-profile total = 0', wPre.json?.data?.balance?.total_paise === 0, `total=${wPre.json?.data?.balance?.total_paise}`);

  // Create driver profile → trigger fires
  const drv = await j('POST', '/drivers', { token: a.token, body: { full_name: 'Promo Smoke Driver' } });
  check('POST /drivers 200', drv.status === 200, `status ${drv.status}`);

  const wPost = await j('GET', '/wallet', { token: a.token });
  check('post-profile GET /wallet 200', wPost.status === 200);
  check('promo_paise = 100000 (₹1,000)', wPost.json?.data?.balance?.promo_paise === 100000, `promo=${wPost.json?.data?.balance?.promo_paise}`);
  check('cash_paise = 0', wPost.json?.data?.balance?.cash_paise === 0);
  check('total_paise = 100000', wPost.json?.data?.balance?.total_paise === 100000);
  check('ledger has a promo_credit_grant entry',
    Array.isArray(wPost.json?.data?.recent_ledger)
      && wPost.json.data.recent_ledger.some((e) => e.entry_type === 'promo_credit_grant' && e.amount_paise === 100000),
    `ledger=${JSON.stringify(wPost.json?.data?.recent_ledger)}`);

  // 2. Agent path
  const b = await signUp('trip_manager', 'Promo Smoke Agent');
  await j('POST', '/agents', { token: b.token, body: { full_name: 'Promo Smoke Agent' } });
  const wAgent = await j('GET', '/wallet', { token: b.token });
  check('agent: promo_paise = 100000', wAgent.json?.data?.balance?.promo_paise === 100000, `promo=${wAgent.json?.data?.balance?.promo_paise}`);

  // 3. Same user with BOTH profiles → both grants
  const c = await signUp('driver', 'Both Roles Smoke');
  await j('POST', '/drivers', { token: c.token, body: { full_name: 'Both Roles Smoke' } });
  await j('POST', '/agents',  { token: c.token, body: { full_name: 'Both Roles Smoke' } });
  const wBoth = await j('GET', '/wallet', { token: c.token });
  check('both-roles user: promo_paise = 200000 (₹2,000)', wBoth.json?.data?.balance?.promo_paise === 200000, `promo=${wBoth.json?.data?.balance?.promo_paise}`);

  // 4. Idempotency — calling POST /drivers again must NOT issue a second grant
  await j('POST', '/drivers', { token: a.token, body: { full_name: 'Promo Smoke Driver retry' } });
  const wRetry = await j('GET', '/wallet', { token: a.token });
  check('idempotency: still ₹1,000 after re-POST /drivers', wRetry.json?.data?.balance?.promo_paise === 100000, `promo=${wRetry.json?.data?.balance?.promo_paise}`);

  // 5. Stub Razorpay top-up: initiate then verify → wallet credited
  const init = await j('POST', '/wallet/topup/initiate', { token: a.token, body: { amount_paise: 50000 } });
  check('topup/initiate returns 200 + topup_id', init.status === 200 && !!init.json?.data?.topup_id, `status ${init.status} body ${JSON.stringify(init.json)}`);
  check('topup/initiate is stubbed (Razorpay not configured)', init.json?.data?.stubbed === true);

  const verify = await j('POST', '/wallet/topup/verify', { token: a.token, body: { topup_id: init.json.data.topup_id } });
  check('topup/verify returns 200 + status=succeeded', verify.status === 200 && verify.json?.data?.status === 'succeeded', `status ${verify.status} body ${JSON.stringify(verify.json)}`);

  const wAfterTopup = await j('GET', '/wallet', { token: a.token });
  check('after stub top-up: cash_paise = 50000', wAfterTopup.json?.data?.balance?.cash_paise === 50000, `cash=${wAfterTopup.json?.data?.balance?.cash_paise}`);
  check('after stub top-up: promo unchanged at 100000', wAfterTopup.json?.data?.balance?.promo_paise === 100000);
  check('after stub top-up: total = 150000', wAfterTopup.json?.data?.balance?.total_paise === 150000);

  // 6. Verify is idempotent — calling again returns succeeded with already_credited
  const verifyAgain = await j('POST', '/wallet/topup/verify', { token: a.token, body: { topup_id: init.json.data.topup_id } });
  check('verify is idempotent (already_credited)',
    verifyAgain.status === 200 && verifyAgain.json?.data?.already_credited === true,
    `body ${JSON.stringify(verifyAgain.json)}`);
  // and the wallet didn't double-up
  const wAfterIdem = await j('GET', '/wallet', { token: a.token });
  check('wallet unchanged after idempotent verify', wAfterIdem.json?.data?.balance?.cash_paise === 50000);

  // 7. Validation: amount too small / too large
  const tooSmall = await j('POST', '/wallet/topup/initiate', { token: a.token, body: { amount_paise: 100 } });
  check('topup/initiate rejects amount < ₹50', tooSmall.status === 422 && tooSmall.json?.error?.code === 'TOPUP_TOO_SMALL', `status ${tooSmall.status} ${JSON.stringify(tooSmall.json)}`);
  const tooBig = await j('POST', '/wallet/topup/initiate', { token: a.token, body: { amount_paise: 10_000_000 } });
  check('topup/initiate rejects amount > ₹50,000', tooBig.status === 422 && tooBig.json?.error?.code === 'TOPUP_TOO_LARGE', `status ${tooBig.status}`);

  // 8. Unauthed
  const unauth = await j('GET', '/wallet');
  check('GET /wallet without token → 401', unauth.status === 401);

  console.log('');
  if (failures) { console.error(`[test-onboarding-promo] ${failures} failure(s)`); process.exit(1); }
  console.log('[test-onboarding-promo] all checks passed');
})().catch((err) => { console.error('[test-onboarding-promo] fatal', err); process.exit(2); });
