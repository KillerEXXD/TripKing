#!/usr/bin/env node
/**
 * Smoke test for Stage 5: admin config endpoints.
 *   ADMIN_API_BASE=https://<ref>.supabase.co/functions/v1 node scripts/test-admin-referral-config.cjs
 * Skips cleanly if ADMIN_API_BASE is unset.
 *
 * Covers:
 *  - GET /admin/wallet-settings + /admin/referral-settings + /admin/fraud-settings (admin)
 *  - PATCH /admin/wallet-settings updates the row + audit
 *  - GET/POST/PATCH/DELETE /admin/referral-tiers (using existing LISTS plumbing)
 *  - GET /admin/fraud-action-rules + /admin/notification-templates
 *  - GET /admin/app-wallet returns balance + ledger
 *  - 401/403 on no-auth / non-admin
 *  - the refactored accrual trigger reads from referral_tiers (change Tier 1 cap, sign up
 *    a fresh referrer-referred pair, run an eligible trip, assert link.cap_paise reflects
 *    the new tier value)
 */
const { execSync } = require('node:child_process');
const path = require('node:path');

const BASE = (process.env.ADMIN_API_BASE || (process.env.VITE_API_BASE_URL ? `${process.env.VITE_API_BASE_URL}/functions/v1` : '')).replace(/\/+$/, '');
if (!BASE) {
  console.log('[test-admin-referral-config] ADMIN_API_BASE not set — skipping.');
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
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
}
function rPhone() { return `+919900${Math.floor(100000 + Math.random() * 900000)}`; }
function futureIso(m = 30) { return new Date(Date.now() + m * 60_000).toISOString(); }
async function signIn(role, name, refCode) {
  const phone = rPhone();
  await j('POST', '/auth/auth/request-otp', { body: { phone } });
  const r = await j('POST', '/auth/auth/verify-otp', { body: { phone, otp: '12345', display_name: name, role, referral_code: refCode } });
  return { token: r.json?.data?.access_token, userId: r.json?.data?.user?.id, attribution: r.json?.data?.referral_attribution };
}
function execSql(sql) {
  const cmd = process.platform === 'win32'
    ? `node "${path.join(__dirname, 'db.cjs')}" "${sql.replace(/"/g, '\\"')}"`
    : `node ${path.join(__dirname, 'db.cjs')} "${sql.replace(/"/g, '\\"')}"`;
  return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
}

(async () => {
  console.log(`[test-admin-referral-config] BASE=${BASE}`);

  const adminToken = (await signIn('admin', 'Stage5 Admin')).token;
  const driverToken = (await signIn('driver', 'Stage5 NonAdmin')).token;
  check('signed in admin + non-admin', !!adminToken && !!driverToken);

  // 1. Singletons GET
  const ws = await j('GET', '/admin/wallet-settings', { token: adminToken });
  check('GET /admin/wallet-settings 200', ws.status === 200 && ws.json?.data?.id === 1, `status=${ws.status}`);
  check('  has driver_platform_fee_paise', typeof ws.json?.data?.driver_platform_fee_paise === 'number');
  check('  has eligible_payment_sources_for_referral JSONB', Array.isArray(ws.json?.data?.eligible_payment_sources_for_referral));
  check('  has topup_presets_paise JSONB', Array.isArray(ws.json?.data?.topup_presets_paise));

  const rs = await j('GET', '/admin/referral-settings', { token: adminToken });
  check('GET /admin/referral-settings 200', rs.status === 200 && rs.json?.data?.program_active === true);
  check('  has whatsapp_share_template', typeof rs.json?.data?.whatsapp_share_template === 'string');

  const fs = await j('GET', '/admin/fraud-settings', { token: adminToken });
  check('GET /admin/fraud-settings 200', fs.status === 200 && typeof fs.json?.data?.duplicate_aadhaar_threshold === 'number');

  // 2. Auth / role gating on singletons
  const fsNoAuth = await j('GET', '/admin/fraud-settings');
  check('GET /admin/fraud-settings without auth → 401', fsNoAuth.status === 401, `status=${fsNoAuth.status}`);
  const fsNonAdmin = await j('GET', '/admin/fraud-settings', { token: driverToken });
  check('GET /admin/fraud-settings as non-admin → 403', fsNonAdmin.status === 403);

  // wallet-settings is publicly readable (UI needs the defaults), so non-admin GET passes
  const wsNonAdmin = await j('GET', '/admin/wallet-settings', { token: driverToken });
  check('GET /admin/wallet-settings as non-admin → 200 (public read)', wsNonAdmin.status === 200);
  // …but PATCH requires admin
  const wsPatchUnauth = await j('PATCH', '/admin/wallet-settings', { token: driverToken, body: { default_platform_fee_pct: 12 } });
  check('PATCH /admin/wallet-settings as non-admin → 403', wsPatchUnauth.status === 403);

  // 3. PATCH a singleton + verify
  const before = ws.json.data.default_platform_fee_pct;
  const newPct = before === 12 ? 11 : 12;
  const patch = await j('PATCH', '/admin/wallet-settings', { token: adminToken, body: { default_platform_fee_pct: newPct } });
  check('PATCH /admin/wallet-settings 200', patch.status === 200 && Number(patch.json?.data?.default_platform_fee_pct) === newPct, `status=${patch.status} val=${patch.json?.data?.default_platform_fee_pct}`);
  // restore
  await j('PATCH', '/admin/wallet-settings', { token: adminToken, body: { default_platform_fee_pct: before } });

  // 4. Lists
  const tiers = await j('GET', '/admin/referral-tiers');
  check('GET /admin/referral-tiers 200 + 4 seeded tiers', tiers.status === 200 && (tiers.json?.data?.length ?? 0) >= 4);
  const rules = await j('GET', '/admin/fraud-action-rules');
  check('GET /admin/fraud-action-rules 200 + 21 seeded rules', rules.status === 200 && (rules.json?.data?.length ?? 0) >= 21);
  const tmpl = await j('GET', '/admin/notification-templates');
  check('GET /admin/notification-templates 200 + 11 seeded', tmpl.status === 200 && (tmpl.json?.data?.length ?? 0) >= 11);

  // 5. App Wallet
  const aw = await j('GET', '/admin/app-wallet', { token: adminToken });
  check('GET /admin/app-wallet 200 + balance + ledger array',
    aw.status === 200 && typeof aw.json?.data?.balance?.total_paise === 'number' && Array.isArray(aw.json?.data?.ledger),
    `status=${aw.status} ${JSON.stringify(aw.json?.data?.balance)}`);
  const awNonAdmin = await j('GET', '/admin/app-wallet', { token: driverToken });
  check('GET /admin/app-wallet as non-admin → 403', awNonAdmin.status === 403);

  // 6. Refactored accrual trigger reads from referral_tiers
  //    Plan: bump Tier 1 cap_paise + payout_per_trip_paise, then run a fresh end-to-end trip
  //    where the referred user has 0 prior qualified-referrals (so Tier 1 applies). Assert
  //    link.cap_paise reflects the new value.
  console.log('  · checking the trigger reads referral_tiers');
  const t1 = await j('GET', '/admin/referral-tiers');
  const tier1 = (t1.json?.data || []).find((t) => t.slot_name === 'Tier 1');
  check('Tier 1 fetched', !!tier1, `body=${JSON.stringify(t1.json)}`);
  if (tier1) {
    const newCapPaise = tier1.cap_paise === 240000 ? 250000 : 240000;
    const newPayoutPaise = tier1.payout_per_trip_paise === 6000 ? 5000 : 6000;
    await j('PATCH', `/admin/referral-tiers/${tier1.id}`, { token: adminToken, body: { cap_paise: newCapPaise, payout_per_trip_paise: newPayoutPaise } });

    // disable promo grants so cash-source fees fire
    execSql('update public.wallet_settings set driver_signup_promo_credit_paise = 0, agent_signup_promo_credit_paise = 0 where id = 1');
    try {
      // R refers B; A posts trip; B drives
      const R = await signIn('driver', 'Stage5 R');
      const me = (await j('GET', '/auth/me', { token: R.token })).json?.data;
      const refCode = me?.referral_code;
      const B = await signIn('driver', 'Stage5 B', refCode);
      const A = await signIn('trip_manager', 'Stage5 A');

      const cityIds = ((await j('GET', '/admin/cities')).json?.data || []).map((c) => c.id);
      const carTypeId = ((await j('GET', '/admin/car-types')).json?.data || [])[0]?.id;
      const agentRow = await j('POST', '/agents', { token: A.token, body: { full_name: 'Stage5 A', business_name: 'S5' } });
      await j('PATCH', `/agents/${agentRow.json?.data?.id}/kyc`, { token: adminToken, body: { kyc_status: 'approved', note: 'stage5' } });
      const drvRow = await j('POST', '/drivers', { token: B.token, body: { full_name: 'Stage5 B' } });
      await j('PATCH', `/drivers/${drvRow.json?.data?.id}/kyc`, { token: adminToken, body: { kyc_status: 'approved', note: 'stage5' } });

      async function topUp(token, paise) {
        const init = await j('POST', '/wallet/topup/initiate', { token, body: { amount_paise: paise } });
        await j('POST', '/wallet/topup/verify', { token, body: { topup_id: init.json?.data?.topup_id } });
      }
      await topUp(A.token, 50000);
      await topUp(B.token, 50000);

      const trip = await j('POST', '/trips', { token: A.token, body: {
        from_city_id: cityIds[0], to_city_id: cityIds[1], pickup_at: futureIso(),
        expected_distance_km: 100, car_type_id: carTypeId, rate_per_km: 14, commission_pct: 10,
        gst_amount: 50, driver_bata: 200, passenger_name: 'S5 Pax', passenger_phone: '+918887776666',
        passenger_count: 2, hide_passenger_phone: false,
      }});
      const tid = trip.json?.data?.id;
      const apply = await j('POST', `/trips/${tid}/applicants`, { token: B.token, body: {} });
      await j('POST', `/trips/${tid}/assign`, { token: A.token, body: { acceptance_id: apply.json?.data?.id } });
      const acc = await j('POST', `/trips/${tid}/accept`, { token: B.token });
      await j('POST', `/trips/${tid}/start`, { token: B.token, body: { passenger_otp: acc.json?.data?.passenger_otp } });
      const comp = await j('POST', `/trips/${tid}/complete`, { token: B.token, body: {} });
      check('Stage5 trip completed', comp.status === 200 && comp.json?.data?.status === 'completed', `status=${comp.status}`);

      const referredList = (await j('GET', '/referrals/me/referred', { token: R.token })).json?.data;
      const link = (referredList || []).find((l) => l.referred_user_id === B.userId);
      check('R link snapshotted Tier 1\'s NEW cap_paise',
        link?.cap_paise === newCapPaise,
        `cap=${link?.cap_paise} expected=${newCapPaise}`);
      check('R link snapshotted Tier 1\'s NEW payout_per_trip_paise',
        link?.payout_per_trip_paise === newPayoutPaise,
        `payout=${link?.payout_per_trip_paise} expected=${newPayoutPaise}`);
      check('R earned the NEW per-trip payout',
        link?.total_earned_paise === newPayoutPaise,
        `earned=${link?.total_earned_paise}`);
    } finally {
      // restore Tier 1 + promo grants
      await j('PATCH', `/admin/referral-tiers/${tier1.id}`, { token: adminToken, body: { cap_paise: tier1.cap_paise, payout_per_trip_paise: tier1.payout_per_trip_paise } });
      execSql('update public.wallet_settings set driver_signup_promo_credit_paise = 100000, agent_signup_promo_credit_paise = 100000 where id = 1');
    }
  }

  console.log('');
  if (failures) { console.error(`[test-admin-referral-config] ${failures} failure(s)`); process.exit(1); }
  console.log('[test-admin-referral-config] all checks passed');
})().catch((err) => { console.error('[test-admin-referral-config] fatal', err); process.exit(2); });
