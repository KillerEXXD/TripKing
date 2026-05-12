/**
 * Smoke test for the exception-handling pipeline (the `debug` edge function +
 * the always-envelope-on-500 guarantee). Checks that:
 *   - /debug requires an admin Bearer (403 without one),
 *   - /debug/throw — an *uncaught* handler error — comes back as HTTP 500 with the
 *     `{ success:false, error:{ code:"INTERNAL" } }` envelope, never a raw runtime error
 *     (and is reported to Sentry; you'd verify that in the Sentry "trip-king" project,
 *     `source=edge-fn fn=debug`),
 *   - /debug/fail?code=<CODE> returns that code with a sensible status, no Sentry event,
 *   - /debug/slow?ms=<n> sleeps then 200s.
 *
 * Set DEBUG_API_BASE (or VITE_API_BASE_URL) to run; exits 0 (skip) otherwise.
 *   DEBUG_API_BASE=https://<ref>.supabase.co/functions/v1 node scripts/test-error-pipeline.cjs
 */
const BASE = (process.env.DEBUG_API_BASE || (process.env.VITE_API_BASE_URL ? `${process.env.VITE_API_BASE_URL}/functions/v1` : '')).replace(/\/+$/, '');
if (!BASE) {
  console.log('[test-error-pipeline] DEBUG_API_BASE / VITE_API_BASE_URL not set — skipping.');
  process.exit(0);
}

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `  — ${detail}`}`);
  if (!ok) failures++;
}
async function j(method, path, { body, token } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}
async function adminToken() {
  const phone = `+919900${Math.floor(100000 + Math.random() * 900000)}`;
  await j('POST', '/auth/auth/request-otp', { body: { phone } });
  const r = await j('POST', '/auth/auth/verify-otp', { body: { phone, otp: '123456', display_name: 'PipelineSmoke', role: 'admin' } });
  return r.json?.data?.access_token;
}

(async () => {
  // 1 — admin gate
  check('GET /debug without a token → 403 FORBIDDEN', (await j('GET', '/debug')).status === 403);

  const token = await adminToken();
  check('minted an admin token', !!token, 'verify-otp returned no access_token');
  if (!token) process.exit(1);

  // 2 — /debug index
  const idx = await j('GET', '/debug', { token });
  check('GET /debug (admin) → 200 + routes list', idx.status === 200 && Array.isArray(idx.json?.data?.routes));

  // 3 — uncaught error → 500 INTERNAL envelope (never a raw runtime 500)
  const thrown = await j('GET', '/debug/throw', { token });
  check(
    'GET /debug/throw → HTTP 500 + { success:false, error.code:"INTERNAL" } (reported to Sentry, source=edge-fn)',
    thrown.status === 500 && thrown.json?.success === false && thrown.json?.error?.code === 'INTERNAL' && !('raw' in thrown.json),
    `status=${thrown.status} body=${JSON.stringify(thrown.json)}`,
  );

  // 4 — explicit fail() codes map to sensible statuses
  for (const [code, status] of [
    ['VALIDATION', 422],
    ['FORBIDDEN', 403],
    ['NOT_FOUND', 404],
    ['CONFLICT', 409],
    ['RATE_LIMITED', 429],
  ]) {
    const r = await j('GET', `/debug/fail?code=${code}`, { token });
    check(`GET /debug/fail?code=${code} → HTTP ${status} + error.code:"${code}"`, r.status === status && r.json?.error?.code === code, `status=${r.status} body=${JSON.stringify(r.json)}`);
  }

  // 5 — slow
  const t0 = Date.now();
  const slow = await j('GET', '/debug/slow?ms=400', { token });
  const elapsed = Date.now() - t0;
  check('GET /debug/slow?ms=400 → 200 + slept_ms:400 (and actually took ~400ms)', slow.status === 200 && slow.json?.data?.slept_ms === 400 && elapsed >= 350, `status=${slow.status} elapsed=${elapsed}ms`);

  console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error('[test-error-pipeline] threw:', e);
  process.exit(1);
});
