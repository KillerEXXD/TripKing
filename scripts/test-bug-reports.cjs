#!/usr/bin/env node
/**
 * Smoke test for /bug-reports/* + the /admin/users/:id { can_report_bugs } toggle.
 *   ADMIN_API_BASE=https://<ref>.supabase.co/functions/v1 node scripts/test-bug-reports.cjs
 * Skips cleanly (exit 0) if ADMIN_API_BASE is unset.
 *
 * Covers:
 *   - gate: 403 BUG_REPORTS_NOT_ENABLED when flag off
 *   - admin toggle flips the flag, then driver can submit
 *   - admin list filters (status, priority, category, reporter_id)
 *   - PATCH status transitions (open → in_progress → resolved fires bug_resolved notify)
 *   - POST comment (admin + reporter)
 *   - POST attachment-upload-url returns a signed URL
 */
const BASE = (process.env.ADMIN_API_BASE || (process.env.VITE_API_BASE_URL ? `${process.env.VITE_API_BASE_URL}/functions/v1` : '')).replace(/\/+$/, '');
if (!BASE) { console.log('[test-bug-reports] ADMIN_API_BASE not set — skipping.'); process.exit(0); }

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
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
}
async function signInFull(role) {
  const phone = `+919900${Math.floor(100000 + Math.random() * 900000)}`;
  await j('POST', '/auth/auth/request-otp', { body: { phone } });
  const auth = await j('POST', '/auth/auth/verify-otp', { body: { phone, otp: '123456', display_name: `BugSmoke ${role} ${Date.now()}`, role } });
  return { token: auth.json?.data?.access_token, userId: auth.json?.data?.user?.id, phone };
}

(async () => {
  console.log(`[test-bug-reports] base = ${BASE}`);

  const admin = await signInFull('admin');
  check('admin signed in', !!admin.token);
  const driver = await signInFull('driver');
  check('driver signed in', !!driver.token && !!driver.userId);
  if (!admin.token || !driver.token) process.exit(1);

  // unauth
  check('POST /bug-reports without auth → 401',
    (await j('POST', '/bug-reports', { body: { title: 'x' } })).status === 401);

  // gate: driver with flag=false → 403
  const blocked = await j('POST', '/bug-reports', { token: driver.token, body: { title: 'blocked' } });
  check('POST /bug-reports with flag off → 403 BUG_REPORTS_NOT_ENABLED',
    blocked.status === 403 && blocked.json?.error?.code === 'BUG_REPORTS_NOT_ENABLED',
    `status=${blocked.status} ${JSON.stringify(blocked.json?.error || '')}`);

  // admin flips driver's can_report_bugs=true
  const toggle = await j('PATCH', `/admin/users/${driver.userId}`, { token: admin.token, body: { can_report_bugs: true } });
  check('PATCH /admin/users/:id { can_report_bugs:true } → 200 + flag flipped',
    toggle.status === 200 && toggle.json?.data?.can_report_bugs === true,
    `status=${toggle.status} ${JSON.stringify(toggle.json?.error || toggle.json?.data)}`);

  // admin (always allowed) can submit too
  const adminSubmit = await j('POST', '/bug-reports', { token: admin.token, body: {
    title: 'admin reported bug', priority: 'high', category: 'ui', description: 'from admin',
  } });
  check('POST /bug-reports (admin) → 200 + bug_number BUG-…',
    adminSubmit.status === 200 && typeof adminSubmit.json?.data?.bug_number === 'string' && adminSubmit.json.data.bug_number.startsWith('BUG-'),
    `status=${adminSubmit.status} ${JSON.stringify(adminSubmit.json?.error || '')}`);

  // driver (now flag-enabled) submits
  const driverSubmit = await j('POST', '/bug-reports', { token: driver.token, body: {
    title: 'login otp not arriving', priority: 'high', category: 'auth_otp',
    description: 'Phone +919900… never gets the OTP SMS.',
    steps_to_reproduce: '1. open app\n2. enter phone\n3. wait', expected: 'OTP arrives', actual: 'silence',
    page_url: 'https://trip-king.vercel.app/sign-in', route: '/sign-in',
    browser_info: { ua: 'test', viewport: { w: 360, h: 800 } },
    console_logs: '[error] OTP request failed', breadcrumbs: [{ at: 't0', m: 'click submit' }],
    context: { phoneEntered: true }, query_cache_snapshot: [{ key: ['me'], status: 'error' }],
    sentry_replay_url: 'https://sentry.io/replay/abc',
  } });
  check('POST /bug-reports (flagged driver) → 200 + id',
    driverSubmit.status === 200 && !!driverSubmit.json?.data?.id,
    `status=${driverSubmit.status} ${JSON.stringify(driverSubmit.json?.error || '')}`);
  const bugId = driverSubmit.json?.data?.id;
  const bugNumber = driverSubmit.json?.data?.bug_number;

  // list (admin)
  const list = await j('GET', '/bug-reports?status=open&limit=10', { token: admin.token });
  check('GET /bug-reports?status=open (admin) → 200 + array',
    list.status === 200 && Array.isArray(list.json?.data) && list.json.data.some((b) => b.id === bugId),
    `status=${list.status}`);
  check('GET /bug-reports without auth → 401', (await j('GET', '/bug-reports')).status === 401);
  check('GET /bug-reports by non-admin → 403',
    (await j('GET', '/bug-reports', { token: driver.token })).status === 403);

  // list filters
  const listByReporter = await j('GET', `/bug-reports?reporter_id=${driver.userId}`, { token: admin.token });
  check('GET /bug-reports?reporter_id=… (admin) → 200 + driver bug present',
    listByReporter.status === 200 && Array.isArray(listByReporter.json?.data) && listByReporter.json.data.every((b) => b.reporter_id === driver.userId),
    `status=${listByReporter.status}`);
  const listByCategory = await j('GET', '/bug-reports?category=auth_otp', { token: admin.token });
  check('GET /bug-reports?category=auth_otp → 200 + filter holds',
    listByCategory.status === 200 && listByCategory.json?.data?.every((b) => b.category === 'auth_otp'),
    `status=${listByCategory.status}`);

  // detail (reporter can read own)
  const detailReporter = await j('GET', `/bug-reports/${bugId}`, { token: driver.token });
  check('GET /bug-reports/:id by reporter → 200',
    detailReporter.status === 200 && detailReporter.json?.data?.id === bugId);
  // detail (random other driver can't)
  const other = await signInFull('driver');
  check('GET /bug-reports/:id by another user → 403',
    (await j('GET', `/bug-reports/${bugId}`, { token: other.token })).status === 403);

  // PATCH status
  const inProg = await j('PATCH', `/bug-reports/${bugId}`, { token: admin.token, body: { status: 'in_progress', priority: 'critical' } });
  check('PATCH /bug-reports/:id { status:in_progress, priority:critical } → 200',
    inProg.status === 200 && inProg.json?.data?.status === 'in_progress' && inProg.json?.data?.priority === 'critical',
    `status=${inProg.status} ${JSON.stringify(inProg.json?.error || '')}`);
  check('PATCH /bug-reports/:id { status:bogus } → 422',
    (await j('PATCH', `/bug-reports/${bugId}`, { token: admin.token, body: { status: 'bogus' } })).status === 422);
  check('PATCH /bug-reports/:id by non-admin → 403',
    (await j('PATCH', `/bug-reports/${bugId}`, { token: driver.token, body: { status: 'closed' } })).status === 403);

  // comments
  const adminComment = await j('POST', `/bug-reports/${bugId}/comments`, { token: admin.token, body: { content: 'thanks, looking into it' } });
  check('POST /bug-reports/:id/comments (admin) → 200', adminComment.status === 200 && !!adminComment.json?.data?.id);
  const reporterComment = await j('POST', `/bug-reports/${bugId}/comments`, { token: driver.token, body: { content: 'still happening' } });
  check('POST /bug-reports/:id/comments (reporter) → 200', reporterComment.status === 200);
  const listComments = await j('GET', `/bug-reports/${bugId}/comments`, { token: admin.token });
  check('GET /bug-reports/:id/comments (admin) → 200 + ≥2',
    listComments.status === 200 && Array.isArray(listComments.json?.data) && listComments.json.data.length >= 2);
  check('POST /bug-reports/:id/comments with empty content → 422',
    (await j('POST', `/bug-reports/${bugId}/comments`, { token: admin.token, body: { content: '   ' } })).status === 422);

  // attachment upload URL
  const uploadUrl = await j('POST', `/bug-reports/${bugId}/attachment-upload-url`, { token: driver.token, body: { file_name: 'screenshot.png', file_size: 1234, content_type: 'image/png' } });
  check('POST /bug-reports/:id/attachment-upload-url (reporter) → 200 + signed_url',
    uploadUrl.status === 200 && typeof uploadUrl.json?.data?.signed_url === 'string' && uploadUrl.json.data.bucket === 'bug-attachments',
    `status=${uploadUrl.status} ${JSON.stringify(uploadUrl.json?.error || '')}`);

  // resolve → notification fires (we don't assert delivery; just that PATCH succeeds + resolved_at set)
  const resolve = await j('PATCH', `/bug-reports/${bugId}`, { token: admin.token, body: { status: 'resolved', resolution_notes: 'fixed in v1.2' } });
  check('PATCH /bug-reports/:id { status:resolved } → 200 + resolved_at set',
    resolve.status === 200 && resolve.json?.data?.status === 'resolved' && !!resolve.json?.data?.resolved_at && resolve.json?.data?.resolved_by === admin.userId,
    `status=${resolve.status} ${JSON.stringify(resolve.json?.error || '')}`);

  // flip flag back off — driver gets blocked again
  const off = await j('PATCH', `/admin/users/${driver.userId}`, { token: admin.token, body: { can_report_bugs: false } });
  check('PATCH /admin/users/:id { can_report_bugs:false } → 200',
    off.status === 200 && off.json?.data?.can_report_bugs === false);
  const reBlocked = await j('POST', '/bug-reports', { token: driver.token, body: { title: 'should fail' } });
  check('POST /bug-reports after flag flipped off → 403',
    reBlocked.status === 403 && reBlocked.json?.error?.code === 'BUG_REPORTS_NOT_ENABLED');

  // 404
  check('GET /bug-reports/<bogus> → 404',
    (await j('GET', '/bug-reports/00000000-0000-0000-0000-000000000000', { token: admin.token })).status === 404);

  console.log(`[test-bug-reports] bug=${bugNumber} id=${bugId}`);
  if (failures) { console.error(`[test-bug-reports] ${failures} check(s) failed`); process.exit(1); }
  console.log('[test-bug-reports] all checks passed');
})().catch((e) => { console.error('[test-bug-reports] error:', e); process.exit(1); });
