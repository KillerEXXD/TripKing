#!/usr/bin/env node
/**
 * Smoke test for the driver presence endpoints (/drivers/{online,offline,heartbeat,presence}).
 *   PRESENCE_API_BASE=https://<ref>.supabase.co/functions/v1 node scripts/test-presence.cjs
 * (also reads VITE_API_BASE_URL + '/functions/v1' as a fallback). Skips cleanly if unset.
 *
 * Covers: unauth (401), no-driver-profile (404), KYC gate (403 KYC_REQUIRED), heartbeat-before-online
 * (409), validation (422 missing lat/lng), go-online happy path (status 'online'), the hidden global
 * token NEVER leaking into any response, presence read, go-offline → 'grace' (+ grace_expires_at),
 * and reconnect-within-grace.
 */
const BASE = (process.env.PRESENCE_API_BASE || (process.env.VITE_API_BASE_URL ? `${process.env.VITE_API_BASE_URL}/functions/v1` : '')).replace(/\/+$/, '');
if (!BASE) {
  console.log('[test-presence] PRESENCE_API_BASE not set — skipping.');
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
async function tokenFor(role) {
  const phone = `+919901${Math.floor(100000 + Math.random() * 900000)}`;
  await j('POST', '/auth/auth/request-otp', { body: { phone } });
  const auth = await j('POST', '/auth/auth/verify-otp', { body: { phone, otp: '123456', display_name: `Presence ${role}`, role } });
  return auth.json?.data?.access_token;
}
/** The global token must never reach the client. */
const leaksToken = (json) => JSON.stringify(json ?? {}).includes('"token"');
const VELLORE = { lat: 12.9165, lng: 79.1325 };

(async () => {
  console.log(`[test-presence] base = ${BASE}`);

  const driverToken = await tokenFor('driver');
  const adminToken = await tokenFor('admin');
  const otherToken = await tokenFor('trip_manager'); // user with no driver profile
  check('driver token', !!driverToken);
  check('admin token', !!adminToken);
  if (!driverToken || !adminToken || !otherToken) process.exit(1);

  // unauth + no-profile gates
  check('POST /drivers/online unauth → 401', (await j('POST', '/drivers/online', { body: VELLORE })).status === 401);
  check('POST /drivers/online with no driver profile → 404', (await j('POST', '/drivers/online', { token: otherToken, body: VELLORE })).status === 404);

  const created = await j('POST', '/drivers', { token: driverToken, body: { full_name: 'Presence Smoke Driver' } });
  const driverId = created.json?.data?.id;
  check('driver profile created', created.status === 200 && !!driverId, `status=${created.status}`);
  if (!driverId) process.exit(1);

  // KYC gate — un-approved driver cannot go online
  const blocked = await j('POST', '/drivers/online', { token: driverToken, body: VELLORE });
  check('online before KYC → 403 KYC_REQUIRED', blocked.status === 403 && blocked.json?.error?.code === 'KYC_REQUIRED', `status=${blocked.status} ${JSON.stringify(blocked.json?.error || '')}`);

  const kyc = await j('PATCH', `/drivers/${driverId}/kyc`, { token: adminToken, body: { kyc_status: 'approved', note: 'smoke' } });
  check('admin approves KYC', kyc.status === 200 && kyc.json?.data?.kyc_status === 'approved', `status=${kyc.status}`);

  // heartbeat before online → 409
  check('heartbeat before online → 409', (await j('POST', '/drivers/heartbeat', { token: driverToken, body: VELLORE })).status === 409);
  // validation
  check('online missing lat/lng → 422', (await j('POST', '/drivers/online', { token: driverToken, body: {} })).status === 422);

  // go online
  const online = await j('POST', '/drivers/online', { token: driverToken, body: VELLORE });
  check('go online → 200 + status online', online.status === 200 && online.json?.data?.status === 'online' && online.json?.data?.is_online === true, `status=${online.status} ${JSON.stringify(online.json?.data || online.json?.error)}`);
  check('go online response does NOT leak the global token', !leaksToken(online.json));

  // presence read
  const pres = await j('GET', '/drivers/presence', { token: driverToken });
  check('GET presence → online', pres.status === 200 && pres.json?.data?.status === 'online');
  check('presence read does NOT leak the global token', !leaksToken(pres.json));

  // heartbeat
  const hb = await j('POST', '/drivers/heartbeat', { token: driverToken, body: VELLORE });
  check('heartbeat → 200 online', hb.status === 200 && hb.json?.data?.status === 'online');

  // go offline → grace
  const off = await j('POST', '/drivers/offline', { token: driverToken });
  check('go offline → grace + grace_expires_at set', off.status === 200 && off.json?.data?.status === 'grace' && !!off.json?.data?.grace_expires_at, `${JSON.stringify(off.json?.data)}`);

  // reconnect within grace
  const back = await j('POST', '/drivers/online', { token: driverToken, body: VELLORE });
  check('reconnect within grace → online again', back.status === 200 && back.json?.data?.status === 'online');

  console.log(failures === 0 ? '\n[test-presence] ✅ all passed' : `\n[test-presence] ❌ ${failures} failed`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
