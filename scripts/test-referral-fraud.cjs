#!/usr/bin/env node
/**
 * Smoke test for Stage 9: fraud controls + admin operations.
 *   ADMIN_API_BASE=https://<ref>.supabase.co/functions/v1 node scripts/test-referral-fraud.cjs
 * Skips cleanly if ADMIN_API_BASE is unset.
 *
 * Covers:
 *  - GET /admin/referrals — searchable links list
 *  - POST /admin/referrals/flags — manual flag insert
 *  - GET /admin/referrals/flags + filters
 *  - PATCH /admin/referrals/flags/:id — resolve
 *  - PATCH /admin/referrals/:link/status — admin sets suspended
 *  - POST /admin/referrals/:link/reverse-earnings — restores referrer balance
 *  - PATCH /admin/users/:id/risk — flips is_high_risk
 *  - Auto-detection: duplicate Aadhaar fires on qualification → flag inserted +
 *    link suspended (high severity → suspend_link action per fraud_action_rules)
 */
const { execSync } = require('node:child_process');
const path = require('node:path');

const BASE = (process.env.ADMIN_API_BASE || (process.env.VITE_API_BASE_URL ? `${process.env.VITE_API_BASE_URL}/functions/v1` : '')).replace(/\/+$/, '');
if (!BASE) { console.log('[test-referral-fraud] ADMIN_API_BASE not set — skipping.'); process.exit(0); }

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
  console.log(`[test-referral-fraud] BASE=${BASE}`);
  execSql("update public.wallet_settings set driver_signup_promo_credit_paise = 0, agent_signup_promo_credit_paise = 0 where id = 1");

  try {
    const adminToken = (await signIn('admin', 'Stage9 Admin')).token;

    // === Earn a real ₹50 first so we have something to act on ===
    const R = await signIn('driver', 'Stage9 R');
    const refCode = (await j('GET', '/auth/me', { token: R.token })).json?.data?.referral_code;
    const B = await signIn('driver', 'Stage9 B', refCode);
    const A = await signIn('trip_manager', 'Stage9 A');
    const Aagent = await j('POST', '/agents', { token: A.token, body: { full_name: 'Stage9 A', business_name: 'S9' } });
    await j('PATCH', `/agents/${Aagent.json?.data?.id}/kyc`, { token: adminToken, body: { kyc_status: 'approved' } });
    const Bdrv = await j('POST', '/drivers', { token: B.token, body: { full_name: 'Stage9 B' } });
    await j('PATCH', `/drivers/${Bdrv.json?.data?.id}/kyc`, { token: adminToken, body: { kyc_status: 'approved' } });
    await topUp(A.token, 50000);
    await topUp(B.token, 50000);
    const cityIds = ((await j('GET', '/admin/cities')).json?.data || []).map((c) => c.id);
    const carTypeId = ((await j('GET', '/admin/car-types')).json?.data || [])[0]?.id;
    const t = await j('POST', '/trips', { token: A.token, body: {
      from_city_id: cityIds[0], to_city_id: cityIds[1], pickup_at: futureIso(),
      expected_distance_km: 100, car_type_id: carTypeId, rate_per_km: 14, commission_pct: 10,
      gst_amount: 50, driver_bata: 200, passenger_name: 'S9 Pax', passenger_phone: '+918887776666',
      passenger_count: 2, hide_passenger_phone: false,
    }});
    const apply = await j('POST', `/trips/${t.json?.data?.id}/applicants`, { token: B.token, body: {} });
    await j('POST', `/trips/${t.json?.data?.id}/assign`, { token: A.token, body: { acceptance_id: apply.json?.data?.id } });
    const acc = await j('POST', `/trips/${t.json?.data?.id}/accept`, { token: B.token });
    await j('POST', `/trips/${t.json?.data?.id}/start`, { token: B.token, body: { passenger_otp: acc.json?.data?.passenger_otp, start_odo_url: 'test://odo/start', start_odo_reading: 10000 } });
    await j('POST', `/trips/${t.json?.data?.id}/complete`, { token: B.token, body: { end_odo_url: 'test://odo/end', end_odo_reading: 10100 } });

    const linksRes = await j('GET', `/admin/referrals?referrer_user_id=${R.userId}`, { token: adminToken });
    check('GET /admin/referrals filters by referrer', linksRes.status === 200 && (linksRes.json?.data?.length ?? 0) >= 1, `body=${JSON.stringify(linksRes.json)}`);
    const link = (linksRes.json?.data || [])[0];
    check('  link has referred join', !!link?.referred?.display_name, `link=${JSON.stringify(link)}`);
    check('  link is earning_active after the trip', link?.status === 'earning_active' || link?.status === 'qualified');

    // === Manual flag → list → resolve ===
    const flagRes = await j('POST', '/admin/referrals/flags', { token: adminToken, body: {
      referral_link_id: link.id, flag_type: 'manual_review', severity: 'low', note: 'smoke check',
    }});
    check('POST /admin/referrals/flags 200', flagRes.status === 200 && !!flagRes.json?.data?.id, `body=${JSON.stringify(flagRes.json)}`);
    const flagId = flagRes.json?.data?.id;
    const listFlags = await j('GET', '/admin/referrals/flags?resolved=false', { token: adminToken });
    check('GET /admin/referrals/flags?resolved=false includes ours', listFlags.status === 200 && (listFlags.json?.data || []).some((f) => f.id === flagId));
    const resolve = await j('PATCH', `/admin/referrals/flags/${flagId}`, { token: adminToken, body: { resolved_note: 'all good in smoke' } });
    check('PATCH .../flags/:id resolves', resolve.status === 200 && !!resolve.json?.data?.resolved_at);

    // === Admin set status: suspend the link ===
    const setStatus = await j('PATCH', `/admin/referrals/${link.id}/status`, { token: adminToken, body: { status: 'suspended' } });
    check('PATCH .../:id/status → suspended', setStatus.status === 200 && setStatus.json?.data?.status === 'suspended', `body=${JSON.stringify(setStatus.json)}`);
    // Restore for the next test
    await j('PATCH', `/admin/referrals/${link.id}/status`, { token: adminToken, body: { status: 'earning_active' } });

    // === Reverse earnings ===
    const rPre = (await j('GET', '/referrals/me', { token: R.token })).json?.data?.summary?.lifetime_earned_paise;
    const reverse = await j('POST', `/admin/referrals/${link.id}/reverse-earnings`, { token: adminToken, body: { note: 'smoke fraud reversal' } });
    check('POST .../reverse-earnings 200 + reversed_paise', reverse.status === 200 && reverse.json?.data?.reversed_paise === 5000, `body=${JSON.stringify(reverse.json)}`);
    check('  link is suspended after reverse', reverse.json?.data?.link?.status === 'suspended');
    const rPost = (await j('GET', '/referrals/me', { token: R.token })).json?.data?.summary;
    check('  R lifetime unchanged at ₹50 (reversal is a separate ledger row)', rPost?.lifetime_earned_paise === rPre);
    check('  R withdrawable dropped by ₹50 to 0', rPost?.withdrawable_paise === 0, `withdrawable=${rPost?.withdrawable_paise}`);

    // === User risk flag ===
    const risk = await j('PATCH', `/admin/users/${R.userId}/risk`, { token: adminToken, body: { is_high_risk: true } });
    check('PATCH /admin/users/:id/risk 200 + is_high_risk=true', risk.status === 200 && risk.json?.data?.is_high_risk === true, `body=${JSON.stringify(risk.json)}`);
    const clear = await j('PATCH', `/admin/users/${R.userId}/risk`, { token: adminToken, body: { is_high_risk: false } });
    check('PATCH .../risk 200 + cleared', clear.status === 200 && clear.json?.data?.is_high_risk === false);

    // === Auto-detection: duplicate Aadhaar fires on qualification ===
    // Set the referrer's referred user's Aadhaar to a value AND another existing
    // user to the same value, then trigger qualification (already happened above
    // — qualification fires the detector). To exercise the detector now, we
    // simulate by running another trip on a NEW pair where the referred user
    // has an Aadhaar that collides with someone else in the DB.
    const dupMask = `XXXX-XXXX-${Date.now() % 10000}`;
    // Plant the same masked Aadhaar on B
    execSql(`update public.drivers set aadhaar_number_masked = '${dupMask}' where user_id = '${B.userId}'`);
    // Plant on a SECOND fresh user
    const D = await signIn('driver', 'Stage9 D');
    const Ddrv = await j('POST', '/drivers', { token: D.token, body: { full_name: 'Stage9 D' } });
    await j('PATCH', `/drivers/${Ddrv.json?.data?.id}/kyc`, { token: adminToken, body: { kyc_status: 'approved' } });
    execSql(`update public.drivers set aadhaar_number_masked = '${dupMask}' where user_id = '${D.userId}'`);

    // Now make a NEW referrer R2 refer D, and run a trip → qualification fires → detector fires
    const R2 = await signIn('driver', 'Stage9 R2');
    // unfortunately D is already signed up, can't attach to R2 retroactively. Use a NEW user E.
    const refCodeR2 = (await j('GET', '/auth/me', { token: R2.token })).json?.data?.referral_code;
    const E = await signIn('driver', 'Stage9 E', refCodeR2);
    const Edrv = await j('POST', '/drivers', { token: E.token, body: { full_name: 'Stage9 E' } });
    await j('PATCH', `/drivers/${Edrv.json?.data?.id}/kyc`, { token: adminToken, body: { kyc_status: 'approved' } });
    execSql(`update public.drivers set aadhaar_number_masked = '${dupMask}' where user_id = '${E.userId}'`);

    // Run trip with E as driver
    const A2 = await signIn('trip_manager', 'Stage9 A2');
    const A2agent = await j('POST', '/agents', { token: A2.token, body: { full_name: 'Stage9 A2', business_name: 'S9-2' } });
    await j('PATCH', `/agents/${A2agent.json?.data?.id}/kyc`, { token: adminToken, body: { kyc_status: 'approved' } });
    await topUp(A2.token, 50000);
    await topUp(E.token, 50000);
    const t2 = await j('POST', '/trips', { token: A2.token, body: {
      from_city_id: cityIds[0], to_city_id: cityIds[1], pickup_at: futureIso(),
      expected_distance_km: 100, car_type_id: carTypeId, rate_per_km: 14, commission_pct: 10,
      gst_amount: 50, driver_bata: 200, passenger_name: 'S9 Pax', passenger_phone: '+918887776666',
      passenger_count: 2, hide_passenger_phone: false,
    }});
    const apply2 = await j('POST', `/trips/${t2.json?.data?.id}/applicants`, { token: E.token, body: {} });
    await j('POST', `/trips/${t2.json?.data?.id}/assign`, { token: A2.token, body: { acceptance_id: apply2.json?.data?.id } });
    const acc2 = await j('POST', `/trips/${t2.json?.data?.id}/accept`, { token: E.token });
    await j('POST', `/trips/${t2.json?.data?.id}/start`, { token: E.token, body: { passenger_otp: acc2.json?.data?.passenger_otp, start_odo_url: 'test://odo/start', start_odo_reading: 20000 } });
    await j('POST', `/trips/${t2.json?.data?.id}/complete`, { token: E.token, body: { end_odo_url: 'test://odo/end', end_odo_reading: 20100 } });

    // The accrual fires → status flips to earning_active → fraud detector runs →
    // duplicate_aadhaar flag inserted (3 users share dupMask) → action_taken=suspend_link
    const flagsAfter = (await j('GET', '/admin/referrals/flags?flag_type=duplicate_aadhaar&resolved=false', { token: adminToken })).json?.data;
    const dupFlag = (flagsAfter || []).find((f) => f.detail?.aadhaar_masked === dupMask);
    check('auto-detected duplicate_aadhaar flag inserted', !!dupFlag, `flags=${JSON.stringify(flagsAfter)}`);
    check('  flag has action_taken = suspend_link (high severity)', dupFlag?.action_taken === 'suspend_link', `action=${dupFlag?.action_taken}`);
    check('  flag is auto_detected', dupFlag?.auto_detected === true);

    // R2's link should be suspended now
    const r2Links = await j('GET', `/admin/referrals?referrer_user_id=${R2.userId}`, { token: adminToken });
    const r2Link = (r2Links.json?.data || [])[0];
    check('R2 link auto-suspended by duplicate-Aadhaar detector', r2Link?.status === 'suspended', `status=${r2Link?.status}`);

  } finally {
    execSql("update public.wallet_settings set driver_signup_promo_credit_paise = 100000, agent_signup_promo_credit_paise = 100000 where id = 1");
  }

  console.log('');
  if (failures) { console.error(`[test-referral-fraud] ${failures} failure(s)`); process.exit(1); }
  console.log('[test-referral-fraud] all checks passed');
})().catch((err) => { console.error('[test-referral-fraud] fatal', err); process.exit(2); });
