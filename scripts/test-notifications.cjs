#!/usr/bin/env node
/**
 * Smoke test for the /notifications edge function.
 *   NOTIFICATIONS_API_BASE=https://<ref>.supabase.co/functions/v1 node scripts/test-notifications.cjs
 * Skips cleanly (exit 0) if NOTIFICATIONS_API_BASE is unset.
 */
const BASE = (process.env.NOTIFICATIONS_API_BASE || (process.env.VITE_API_BASE_URL ? `${process.env.VITE_API_BASE_URL}/functions/v1` : '')).replace(/\/+$/, '');
if (!BASE) {
  console.log('[test-notifications] NOTIFICATIONS_API_BASE not set — skipping.');
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

(async () => {
  console.log(`[test-notifications] base = ${BASE}`);
  const phone = `+919900${Math.floor(100000 + Math.random() * 900000)}`;
  await j('POST', '/auth/auth/request-otp', { body: { phone } });
  const auth = await j('POST', '/auth/auth/verify-otp', { body: { phone, otp: '123456', display_name: 'Notif Smoke', role: 'driver' } });
  const token = auth.json?.data?.access_token;
  check('auth token obtained', !!token, `status=${auth.status} ${JSON.stringify(auth.json?.error || '')}`);
  if (!token) { process.exit(1); }

  const noAuth = await j('GET', '/notifications');
  check('GET /notifications without auth → 401', noAuth.status === 401, `status=${noAuth.status}`);

  const list = await j('GET', '/notifications', { token });
  check('GET /notifications (Bearer) → 200 + array', list.status === 200 && Array.isArray(list.json?.data), `status=${list.status} ${JSON.stringify(list.json?.error || '')}`);

  const unread = await j('GET', '/notifications?unread_only=true', { token });
  check('GET /notifications?unread_only=true → 200 + array', unread.status === 200 && Array.isArray(unread.json?.data), `status=${unread.status}`);

  const readAll = await j('POST', '/notifications/read-all', { token, body: {} });
  check('POST /notifications/read-all → 200', readAll.status === 200 && readAll.json?.data?.ok === true, `status=${readAll.status}`);

  const patch404 = await j('PATCH', '/notifications/00000000-0000-0000-0000-000000000000', { token, body: { is_read: true } });
  check('PATCH /notifications/<nonexistent> → 404', patch404.status === 404, `status=${patch404.status}`);

  if (failures) { console.error(`[test-notifications] ${failures} check(s) failed`); process.exit(1); }
  console.log('[test-notifications] all checks passed');
})().catch((e) => { console.error('[test-notifications] error:', e); process.exit(1); });
