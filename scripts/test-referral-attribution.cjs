#!/usr/bin/env node
/**
 * Smoke test for Stage 1 of the referral program (migration 042).
 *   ADMIN_API_BASE=https://<ref>.supabase.co/functions/v1 node scripts/test-referral-attribution.cjs
 * Skips cleanly if ADMIN_API_BASE is unset.
 *
 * Covers:
 *  - new signup without code → user.referral_code is auto-issued, attribution = 'none'
 *  - new signup with a valid code → referred_by_user_id set, attribution = 'attached'
 *  - new signup with an unknown code → user created, attribution = 'unknown_code', no referrer
 *  - self-referral attempt → blocked, attribution reflects it
 *  - returning user with a code → never re-attributed (attribution = 'already_attributed' or 'invalid')
 *  - GET /auth/me returns referral_code + referred_by_user_id
 *  - GET /drivers/me and /agents/me return a `referral` block with code + summary stub
 */
const BASE = (process.env.ADMIN_API_BASE || (process.env.VITE_API_BASE_URL ? `${process.env.VITE_API_BASE_URL}/functions/v1` : '')).replace(/\/+$/, '');
if (!BASE) {
  console.log('[test-referral-attribution] ADMIN_API_BASE not set — skipping.');
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

function randomPhone() {
  return `+919900${Math.floor(100000 + Math.random() * 900000)}`;
}

async function signUp({ role = 'driver', referral_code, displayName = 'Refer Smoke' } = {}) {
  const phone = randomPhone();
  await j('POST', '/auth/auth/request-otp', { body: { phone } });
  const r = await j('POST', '/auth/auth/verify-otp', {
    body: { phone, otp: '12345', display_name: displayName, role, referral_code },
  });
  return { phone, status: r.status, json: r.json };
}

(async () => {
  console.log(`[test-referral-attribution] BASE=${BASE}`);

  // 1. New user, no referral_code
  const a = await signUp({ role: 'driver' });
  const aData = a.json?.data;
  check('signup without code returns 200', a.status === 200, `status ${a.status} body ${JSON.stringify(a.json)}`);
  check('user.referral_code is set (8 chars)', typeof aData?.user?.referral_code === 'string' && aData.user.referral_code.length === 8, `code=${aData?.user?.referral_code}`);
  check('user.referred_by_user_id is null', aData?.user?.referred_by_user_id === null, `was ${aData?.user?.referred_by_user_id}`);
  check('attribution is "none" when no code passed', aData?.referral_attribution === 'none', `was ${aData?.referral_attribution}`);

  const referrerCode = aData?.user?.referral_code;
  const referrerId = aData?.user?.id;
  const referrerToken = aData?.access_token;

  // 2. /auth/me reflects the new fields
  const me = await j('GET', '/auth/me', { token: referrerToken });
  check('GET /auth/me 200', me.status === 200, `status ${me.status}`);
  check('GET /auth/me returns referral_code', me.json?.data?.referral_code === referrerCode, `was ${me.json?.data?.referral_code}`);

  // 3. New user WITH referrer's code → attached
  const b = await signUp({ role: 'driver', referral_code: referrerCode });
  const bData = b.json?.data;
  check('signup with valid code returns 200', b.status === 200);
  check('attribution = attached', bData?.referral_attribution === 'attached', `was ${bData?.referral_attribution}`);
  check('referred_by_user_id matches the referrer', bData?.user?.referred_by_user_id === referrerId, `was ${bData?.user?.referred_by_user_id}`);
  check('referred user gets their own unique code', typeof bData?.user?.referral_code === 'string' && bData.user.referral_code !== referrerCode, `code=${bData?.user?.referral_code}`);

  // 4. New user with UNKNOWN code → user still created, no referrer
  const c = await signUp({ role: 'driver', referral_code: 'XXXXXXXX' });
  const cData = c.json?.data;
  check('signup with unknown code returns 200', c.status === 200);
  check('attribution = unknown_code', cData?.referral_attribution === 'unknown_code', `was ${cData?.referral_attribution}`);
  check('referred_by_user_id is null for unknown code', cData?.user?.referred_by_user_id === null);

  // 5. Returning user signing in with a code → never re-attributed
  // First, make user d a referred user
  const d = await signUp({ role: 'driver', referral_code: referrerCode });
  const dPhone = d.phone;
  // Now d signs in again with someone else's code
  await j('POST', '/auth/auth/request-otp', { body: { phone: dPhone } });
  const dAgain = await j('POST', '/auth/auth/verify-otp', { body: { phone: dPhone, otp: '12345', referral_code: 'YYYYYYYY' } });
  check('returning user with code returns 200', dAgain.status === 200);
  const dAttr = dAgain.json?.data?.referral_attribution;
  check('returning user keeps original referrer (already_attributed)',
    dAttr === 'already_attributed' || dAttr === 'invalid',
    `was ${dAttr}`);
  check('returning user referred_by_user_id is unchanged', dAgain.json?.data?.user?.referred_by_user_id === referrerId, `was ${dAgain.json?.data?.user?.referred_by_user_id}`);

  // 6. Self-referral: new user signs up using their own (yet-to-exist) code is impossible; but
  //    a returning user passing their OWN code should be ignored. Use referrer (a) and pass their own code.
  await j('POST', '/auth/auth/request-otp', { body: { phone: a.phone } });
  const selfRef = await j('POST', '/auth/auth/verify-otp', { body: { phone: a.phone, otp: '12345', referral_code: referrerCode } });
  check('self-referral attempt returns 200 (no crash)', selfRef.status === 200);
  check('self-referrer\'s referred_by_user_id stays null',
    selfRef.json?.data?.user?.referred_by_user_id === null,
    `was ${selfRef.json?.data?.user?.referred_by_user_id}`);

  // 7. POST /drivers as user b, then GET /drivers/me — referral block present
  const bToken = bData?.access_token;
  await j('POST', '/drivers', { token: bToken, body: { full_name: 'Refer Smoke B' } });
  const drvMe = await j('GET', '/drivers/me', { token: bToken });
  check('GET /drivers/me 200', drvMe.status === 200, `status ${drvMe.status}`);
  check('drivers/me has referral.code', typeof drvMe.json?.data?.referral?.code === 'string' && drvMe.json.data.referral.code.length === 8, `referral=${JSON.stringify(drvMe.json?.data?.referral)}`);
  check('drivers/me referral.referred_by_user_id matches', drvMe.json?.data?.referral?.referred_by_user_id === referrerId, `was ${drvMe.json?.data?.referral?.referred_by_user_id}`);
  check('drivers/me referral.summary has zeros (Stage-1 stub)',
    drvMe.json?.data?.referral?.summary?.total_referred === 0
    && drvMe.json?.data?.referral?.summary?.lifetime_earned_paise === 0,
    `summary=${JSON.stringify(drvMe.json?.data?.referral?.summary)}`);

  // 8. Same for an agent — sign up a fresh user as trip_manager
  const e = await signUp({ role: 'trip_manager', referral_code: referrerCode });
  const eToken = e.json?.data?.access_token;
  await j('POST', '/agents', { token: eToken, body: { full_name: 'Refer Smoke E' } });
  const agtMe = await j('GET', '/agents/me', { token: eToken });
  check('GET /agents/me 200', agtMe.status === 200, `status ${agtMe.status}`);
  check('agents/me has referral.code', typeof agtMe.json?.data?.referral?.code === 'string' && agtMe.json.data.referral.code.length === 8);
  check('agents/me referral.referred_by_user_id matches', agtMe.json?.data?.referral?.referred_by_user_id === referrerId);

  console.log('');
  if (failures) { console.error(`[test-referral-attribution] ${failures} failure(s)`); process.exit(1); }
  console.log('[test-referral-attribution] all checks passed');
})().catch((err) => { console.error('[test-referral-attribution] fatal', err); process.exit(2); });
