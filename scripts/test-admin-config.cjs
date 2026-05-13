#!/usr/bin/env node
/**
 * Smoke test for the /admin/* master-data endpoints.
 *   ADMIN_API_BASE=https://<ref>.supabase.co/functions/v1 node scripts/test-admin-config.cjs
 * Skips cleanly (exit 0) if ADMIN_API_BASE is unset.
 *
 * Auth: mutations require a Bearer token whose users.role === 'admin' (obtained via the /auth
 * function's dev OTP). Covers: public reads, 404, unauth mutation (401), non-admin mutation (403),
 * the admin create/disable/delete round-trip, and /admin/users (list/view, role grant, the
 * account-level is_active kill switch — deactivate → verify-otp 403 → reactivate → verify-otp 200 —
 * and the self-lockout guards).
 */
const BASE = (process.env.ADMIN_API_BASE || (process.env.VITE_API_BASE_URL ? `${process.env.VITE_API_BASE_URL}/functions/v1` : '')).replace(/\/+$/, '');
if (!BASE) {
  console.log('[test-admin-config] ADMIN_API_BASE not set — skipping.');
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
  return (await signInFull(role)).token;
}
async function signInFull(role) {
  const phone = `+919900${Math.floor(100000 + Math.random() * 900000)}`;
  await j('POST', '/auth/auth/request-otp', { body: { phone } });
  const auth = await j('POST', '/auth/auth/verify-otp', { body: { phone, otp: '123456', display_name: `Admin Smoke ${role}`, role } });
  return { token: auth.json?.data?.access_token, userId: auth.json?.data?.user?.id, phone };
}

(async () => {
  console.log(`[test-admin-config] base = ${BASE}`);

  // ── public reads ───────────────────────────────────────────────────────
  const list = await j('GET', '/admin/car-types');
  check('GET /admin/car-types → 200 + array', list.status === 200 && Array.isArray(list.json?.data), `status=${list.status}`);
  const settings = await j('GET', '/admin/app-settings');
  check('GET /admin/app-settings → 200 + object', settings.status === 200 && settings.json?.data && typeof settings.json.data.min_vehicle_year === 'number', `status=${settings.status}`);
  const filtered = await j('GET', '/admin/review-tags?category=manager_to_driver');
  check('GET /admin/review-tags?category= → 200', filtered.status === 200, `status=${filtered.status}`);
  const unknown = await j('GET', '/admin/not-a-list');
  check('GET /admin/not-a-list → 404', unknown.status === 404, `status=${unknown.status}`);

  // ── mutations need an admin Bearer ─────────────────────────────────────
  const noAuth = await j('POST', '/admin/car-types', { body: { label: 'Smoke (no auth)' } });
  check('POST /admin/car-types without auth → 401', noAuth.status === 401, `status=${noAuth.status}`);
  const driverToken = await tokenFor('driver');
  const notAdmin = await j('POST', '/admin/car-types', { token: driverToken, body: { label: 'Smoke (not admin)' } });
  check('POST /admin/car-types by a non-admin → 403', notAdmin.status === 403, `status=${notAdmin.status}`);

  const adminToken = await tokenFor('admin');
  check('admin auth token obtained', !!adminToken);
  if (!adminToken) process.exit(1);

  const created = await j('POST', '/admin/car-types', { token: adminToken, body: { label: `__smoke_${Date.now()}`, sort_order: 999 } });
  const id = created.json?.data?.id;
  check('POST /admin/car-types (admin) → 200 + id', created.status === 200 && !!id, `status=${created.status} ${JSON.stringify(created.json?.error || '')}`);
  if (id) {
    const patched = await j('PATCH', `/admin/car-types/${id}`, { token: adminToken, body: { is_active: false } });
    check('PATCH /admin/car-types/:id { is_active:false } (admin) → 200', patched.status === 200 && patched.json?.data?.is_active === false, `status=${patched.status}`);
    const patchNoAuth = await j('PATCH', `/admin/car-types/${id}`, { body: { label: 'hijack' } });
    check('PATCH /admin/car-types/:id without auth → 401', patchNoAuth.status === 401, `status=${patchNoAuth.status}`);
    const deleted = await j('DELETE', `/admin/car-types/${id}`, { token: adminToken });
    check('DELETE /admin/car-types/:id (admin) → 200', deleted.status === 200 && deleted.json?.data?.deleted === id, `status=${deleted.status}`);
  }

  // ── /admin/users — account management (list / view / grant role / the account-level kill switch) ──
  const subject = await signInFull('driver');                           // a throwaway user we'll poke
  const adminId = (await j('GET', '/auth/auth/me', { token: adminToken })).json?.data?.id;
  check('subject + admin ids obtained', !!subject.userId && !!adminId, `subject=${subject.userId} admin=${adminId}`);
  check('GET /admin/users without auth → 401', (await j('GET', '/admin/users')).status === 401);
  check('GET /admin/users by a non-admin → 403', (await j('GET', '/admin/users', { token: driverToken })).status === 403);
  const usersList = await j('GET', '/admin/users?role=driver&limit=10', { token: adminToken });
  check('GET /admin/users?role=driver (admin) → 200 + array', usersList.status === 200 && Array.isArray(usersList.json?.data), `status=${usersList.status} ${JSON.stringify(usersList.json?.error || '')}`);
  const oneUser = await j('GET', `/admin/users/${subject.userId}`, { token: adminToken });
  check('GET /admin/users/:id (admin) → 200 + matching id + is_active:true', oneUser.status === 200 && oneUser.json?.data?.id === subject.userId && oneUser.json?.data?.is_active === true, `status=${oneUser.status} ${JSON.stringify(oneUser.json?.data || oneUser.json?.error)}`);
  const granted = await j('PATCH', `/admin/users/${subject.userId}`, { token: adminToken, body: { role: 'trip_manager' } });
  check('PATCH /admin/users/:id { role:trip_manager } (admin) → 200 + role updated', granted.status === 200 && granted.json?.data?.role === 'trip_manager', `status=${granted.status} ${JSON.stringify(granted.json?.error || '')}`);
  check('PATCH /admin/users/:id { role:<bad> } → 422', (await j('PATCH', `/admin/users/${subject.userId}`, { token: adminToken, body: { role: 'wizard' } })).status === 422);
  check('PATCH /admin/users/:id {} (nothing) → 422', (await j('PATCH', `/admin/users/${subject.userId}`, { token: adminToken, body: {} })).status === 422);
  check('PATCH /admin/users/:id without auth → 401', (await j('PATCH', `/admin/users/${subject.userId}`, { body: { is_active: false } })).status === 401);
  check('PATCH /admin/users/:id by a non-admin → 403', (await j('PATCH', `/admin/users/${subject.userId}`, { token: driverToken, body: { is_active: false } })).status === 403);
  // self-lockout guards
  check('PATCH /admin/users/<self> { is_active:false } → 422', (await j('PATCH', `/admin/users/${adminId}`, { token: adminToken, body: { is_active: false } })).status === 422);
  check('PATCH /admin/users/<self> { role:driver } → 422', (await j('PATCH', `/admin/users/${adminId}`, { token: adminToken, body: { role: 'driver' } })).status === 422);
  // the account-level kill switch: deactivate → verify-otp 403 → reactivate → verify-otp 200
  const deact = await j('PATCH', `/admin/users/${subject.userId}`, { token: adminToken, body: { is_active: false, reason: 'smoke suspension' } });
  check('PATCH /admin/users/:id { is_active:false, reason } (admin) → 200 + is_active:false', deact.status === 200 && deact.json?.data?.is_active === false, `status=${deact.status} ${JSON.stringify(deact.json?.error || deact.json?.data)}`);
  await j('POST', '/auth/auth/request-otp', { body: { phone: subject.phone } });
  const reVerify = await j('POST', '/auth/auth/verify-otp', { body: { phone: subject.phone, otp: '123456' } });
  check('verify-otp for a suspended account → 403 ACCOUNT_SUSPENDED', reVerify.status === 403 && reVerify.json?.error?.code === 'ACCOUNT_SUSPENDED', `status=${reVerify.status} ${JSON.stringify(reVerify.json?.error || '')}`);
  const react = await j('PATCH', `/admin/users/${subject.userId}`, { token: adminToken, body: { is_active: true } });
  check('PATCH /admin/users/:id { is_active:true } (admin) → 200 + is_active:true', react.status === 200 && react.json?.data?.is_active === true, `status=${react.status} ${JSON.stringify(react.json?.error || '')}`);
  const reVerify2 = await j('POST', '/auth/auth/verify-otp', { body: { phone: subject.phone, otp: '123456' } });
  check('verify-otp for the reactivated account → 200 + tokens', reVerify2.status === 200 && !!reVerify2.json?.data?.access_token, `status=${reVerify2.status} ${JSON.stringify(reVerify2.json?.error || '')}`);
  check('PATCH /admin/users/<nonexistent> → 404', (await j('PATCH', '/admin/users/00000000-0000-0000-0000-000000000000', { token: adminToken, body: { is_active: false } })).status === 404);

  if (failures) { console.error(`[test-admin-config] ${failures} check(s) failed`); process.exit(1); }
  console.log('[test-admin-config] all checks passed');
})().catch((e) => { console.error('[test-admin-config] error:', e); process.exit(1); });
