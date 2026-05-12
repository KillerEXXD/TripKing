#!/usr/bin/env node
/**
 * Smoke test for the /admin/* master-data endpoints (the "new edge function" checklist).
 *
 *   ADMIN_API_BASE=https://api.tripking.in ADMIN_API_KEY=... node scripts/test-admin-config.cjs
 *
 * If ADMIN_API_BASE is unset it prints a skip notice and exits 0 — the `admin` edge
 * function isn't deployed until the Supabase service-role key is provided and
 * `npx supabase functions deploy admin` is run (with ADMIN_API_KEY set as a secret).
 */
const BASE = process.env.ADMIN_API_BASE || process.env.VITE_API_BASE_URL;
const ADMIN_KEY = process.env.ADMIN_API_KEY || '';

if (!BASE) {
  console.log('[test-admin-config] ADMIN_API_BASE not set — skipping (deploy the `admin` edge function first).');
  process.exit(0);
}

const url = (p) => `${BASE.replace(/\/+$/, '')}${p}`;
let failures = 0;

async function req(method, path, { body, admin } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (admin && ADMIN_KEY) headers['X-Admin-Key'] = ADMIN_KEY;
  const res = await fetch(url(path), { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}
function check(name, cond, detail) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

(async () => {
  console.log(`[test-admin-config] base = ${BASE}`);

  // public reads
  const list = await req('GET', '/admin/car-types');
  check('GET /admin/car-types → 200 + array', list.status === 200 && Array.isArray(list.json?.data), `status=${list.status}`);

  const settings = await req('GET', '/admin/app-settings');
  check('GET /admin/app-settings → 200 + object', settings.status === 200 && settings.json?.data && typeof settings.json.data.min_vehicle_year === 'number', `status=${settings.status}`);

  const filtered = await req('GET', '/admin/review-tags?category=manager_to_driver');
  check('GET /admin/review-tags?category= → 200', filtered.status === 200, `status=${filtered.status}`);

  const unknown = await req('GET', '/admin/not-a-list');
  check('GET /admin/not-a-list → 404', unknown.status === 404, `status=${unknown.status}`);

  // mutation without the admin key → 403
  const noAuth = await req('POST', '/admin/car-types', { body: { label: 'Smoke Test (no auth)' } });
  check('POST without X-Admin-Key → 403', noAuth.status === 403, `status=${noAuth.status}`);

  if (ADMIN_KEY) {
    const created = await req('POST', '/admin/car-types', { admin: true, body: { label: `__smoke_${Date.now()}`, sort_order: 999 } });
    check('POST /admin/car-types (admin) → 200', created.status === 200 && created.json?.data?.id, `status=${created.status}`);
    const id = created.json?.data?.id;
    if (id) {
      const patched = await req('PATCH', `/admin/car-types/${id}`, { admin: true, body: { is_active: false } });
      check('PATCH disable → 200, is_active=false', patched.status === 200 && patched.json?.data?.is_active === false, `status=${patched.status}`);
      const deleted = await req('DELETE', `/admin/car-types/${id}`, { admin: true });
      check('DELETE → 200', deleted.status === 200, `status=${deleted.status}`);
    }
  } else {
    console.log('  (ADMIN_API_KEY not set — skipping the create/update/delete round-trip)');
  }

  if (failures) {
    console.error(`[test-admin-config] ${failures} check(s) failed`);
    process.exit(1);
  }
  console.log('[test-admin-config] all checks passed');
})().catch((e) => {
  console.error('[test-admin-config] error:', e);
  process.exit(1);
});
