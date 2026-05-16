#!/usr/bin/env node
/**
 * Smoke test for the /auth edge function (dev-OTP flow).
 *
 *   AUTH_API_BASE=https://<ref>.supabase.co/functions/v1 node scripts/test-auth.cjs
 *
 * Skips cleanly (exit 0) if AUTH_API_BASE is unset. Uses a fixed test phone; creates a real
 * Supabase auth user (this is a dev project).
 */
const BASE = process.env.AUTH_API_BASE || (process.env.VITE_API_BASE_URL ? `${process.env.VITE_API_BASE_URL}/functions/v1` : '');
if (!BASE) {
  console.log('[test-auth] AUTH_API_BASE not set — skipping (deploy the `auth` edge function first).');
  process.exit(0);
}
const PHONE = process.env.AUTH_TEST_PHONE || '+919900000007';
const url = (p) => `${BASE.replace(/\/+$/, '')}/auth${p}`;
const meUrl = `${BASE.replace(/\/+$/, '')}/auth/me`;
let failures = 0;

async function post(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url(path), { method: 'POST', headers, body: JSON.stringify(body || {}) });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
}
async function getMe(token) {
  const res = await fetch(meUrl, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
}
function check(name, cond, detail) {
  if (cond) console.log(`  ✓ ${name}`);
  else { failures++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}

(async () => {
  console.log(`[test-auth] base = ${BASE}  phone = ${PHONE}`);

  const r1 = await post('/request-otp', { phone: PHONE });
  check('POST /auth/request-otp → 200 + dev_otp', r1.status === 200 && r1.json?.data?.dev_otp, `status=${r1.status}`);

  const r2 = await post('/verify-otp', { phone: PHONE, otp: r1.json?.data?.dev_otp || '123456', display_name: 'Smoke Tester', role: 'driver' });
  check('POST /auth/verify-otp → 200 + session + user', r2.status === 200 && r2.json?.data?.access_token && r2.json?.data?.refresh_token && r2.json?.data?.user?.id, `status=${r2.status} ${JSON.stringify(r2.json?.error || '')}`);
  const accessToken = r2.json?.data?.access_token;
  const refreshToken = r2.json?.data?.refresh_token;

  if (accessToken) {
    const me = await getMe(accessToken);
    check('GET /auth/me (Bearer) → 200 + matching user', me.status === 200 && me.json?.data?.phone && me.json?.data?.id === r2.json?.data?.user?.id, `status=${me.status}`);
  }
  const meNoAuth = await getMe();
  check('GET /auth/me without token → 401', meNoAuth.status === 401, `status=${meNoAuth.status}`);

  if (refreshToken) {
    const r3 = await post('/refresh', { refresh_token: refreshToken });
    check('POST /auth/refresh → 200 + new tokens', r3.status === 200 && r3.json?.data?.access_token, `status=${r3.status}`);
  }

  const bad = await post('/verify-otp', { phone: PHONE, otp: 'abc' });
  check('POST /auth/verify-otp bad otp → 401', bad.status === 401, `status=${bad.status}`);

  // ── re-signing-in must NOT clobber an existing user's role ────────────────
  const adminPhone = `+919900${Math.floor(100000 + Math.random() * 900000)}`;
  const a1 = await post('/verify-otp', { phone: adminPhone, otp: '12345', display_name: 'Role Keeper', role: 'admin' });
  const a2 = await post('/verify-otp', { phone: adminPhone, otp: '12345' }); // no role on the body — a returning sign-in
  check('verify-otp: re-signing-in preserves the existing role (admin stays admin)', a1.json?.data?.user?.role === 'admin' && a2.status === 200 && a2.json?.data?.user?.role === 'admin', `first=${a1.json?.data?.user?.role} second=${a2.json?.data?.user?.role}`);
  // Regression: BUG fix — when auth.users count crosses the listUsers page cap, returning
  // sign-ins were falling into the createUser branch and 400'ing with SIGNUP_FAILED ("email
  // already registered"). The lookup now keys off public.users.phone (uncapped, indexed), so
  // a second verify-otp for the same phone MUST return a session with the same user id.
  check('verify-otp: second sign-in returns SAME user id + a fresh access_token (no SIGNUP_FAILED)', a1.json?.data?.user?.id && a2.json?.data?.user?.id === a1.json.data.user.id && !!a2.json?.data?.access_token && a2.json?.error == null, `a1.id=${a1.json?.data?.user?.id} a2.id=${a2.json?.data?.user?.id} a2.err=${JSON.stringify(a2.json?.error)}`);

  if (accessToken) {
    const out = await post('/logout', {}, accessToken);
    check('POST /auth/logout → 200', out.status === 200, `status=${out.status}`);
  }

  // ── verify-otp rate limit: 20 attempts per phone per 10 min, then 429 ──────
  const rlPhone = `+919900${Math.floor(100000 + Math.random() * 900000)}`;
  const rlStatuses = [];
  for (let i = 0; i < 22 && !rlStatuses.includes(429); i++) {
    rlStatuses.push((await post('/verify-otp', { phone: rlPhone, otp: 'wrong' })).status);
  }
  check('verify-otp: first ~20 attempts → 401, then → 429 (rate limited)', rlStatuses.slice(0, 20).every((s) => s === 401) && rlStatuses[20] === 429, `statuses=${rlStatuses.join(',')}`);

  if (failures) { console.error(`[test-auth] ${failures} check(s) failed`); process.exit(1); }
  console.log('[test-auth] all checks passed');
})().catch((e) => { console.error('[test-auth] error:', e); process.exit(1); });
