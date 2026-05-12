#!/usr/bin/env node
/**
 * Smoke test for the /places edge function (Phase B of the locations epic).
 *   PLACES_API_BASE=https://<ref>.supabase.co/functions/v1 node scripts/test-places.cjs
 * Skips cleanly (exit 0) if PLACES_API_BASE is unset.
 *
 * Covers: GET /places/search?q=Madurai → ≥1 result with numeric lat/lng (default provider is
 * nominatim — works with no key); a too-short q → an empty list (200); POST /places twice with the
 * same provider/provider_place_id → the same stored id; POST with missing fields → 422; and a
 * 404 on an unknown route. NOTE: search depends on an external geocoder — if it's flaky/rate-limited
 * the search assertions degrade to "200 + array" rather than failing the whole run.
 */
const BASE = (process.env.PLACES_API_BASE || (process.env.VITE_API_BASE_URL ? `${process.env.VITE_API_BASE_URL}/functions/v1` : '')).replace(/\/+$/, '');
if (!BASE) {
  console.log('[test-places] PLACES_API_BASE not set — skipping.');
  process.exit(0);
}
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log(`  ✓ ${name}`);
  else { failures++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}
async function j(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json, headers: res.headers };
}
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

(async () => {
  console.log(`[test-places] base = ${BASE}`);

  // ── GET /places/search ───────────────────────────────────────────────────
  const search = await j('GET', '/places/search?q=Madurai&limit=5');
  const results = Array.isArray(search.json?.data) ? search.json.data : null;
  check('GET /places/search?q=Madurai → 200 + data array', search.status === 200 && results !== null, `status=${search.status} ${JSON.stringify(search.json).slice(0, 200)}`);
  check('GET /places/search → sets a Cache-Control header', /max-age=/.test(search.headers?.get('cache-control') || ''), `cache-control=${search.headers?.get('cache-control')}`);
  if (results && results.length > 0) {
    const r = results[0];
    check('GET /places/search → first result has provider + name + numeric lat/lng', !!r.provider && !!r.name && isNum(r.lat) && isNum(r.lng), JSON.stringify(r));
  } else {
    console.log('  · (geocoder returned no results — provider may be unconfigured or rate-limited; skipping the result-shape check)');
  }

  const short = await j('GET', '/places/search?q=M');
  check('GET /places/search?q=M (too short) → 200 + empty list', short.status === 200 && Array.isArray(short.json?.data) && short.json.data.length === 0, `status=${short.status}`);

  // ── POST /places — find-or-create ────────────────────────────────────────
  const ppid = `smoke-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const payload = { provider: 'smoketest', providerPlaceId: ppid, name: 'Madurai Junction', formattedAddress: 'Madurai Junction, Madurai, Tamil Nadu', state: 'Tamil Nadu', lat: 9.917716, lng: 78.119774 };
  const a = await j('POST', '/places', payload);
  check('POST /places → 200 + stored place with id', a.status === 200 && a.json?.data?.id && a.json.data.provider === 'smoketest' && Number(a.json.data.lat) !== 0, `status=${a.status} ${JSON.stringify(a.json).slice(0, 200)}`);
  const b = await j('POST', '/places', { ...payload, name: 'ignored on the second call' });
  check('POST /places again (same provider/providerPlaceId) → the SAME id (find-or-create)', b.status === 200 && b.json?.data?.id && b.json.data.id === a.json?.data?.id, `first=${a.json?.data?.id} second=${b.json?.data?.id}`);
  check('POST /places find-or-create → keeps the original name (did not overwrite)', b.json?.data?.name === 'Madurai Junction', `name=${b.json?.data?.name}`);

  const bad = await j('POST', '/places', { provider: 'smoketest', name: 'no coords' });
  check('POST /places without lat/lng → 422', bad.status === 422, `status=${bad.status}`);

  const nf = await j('GET', '/places/nope');
  check('GET /places/<unknown> → 404', nf.status === 404, `status=${nf.status}`);

  if (failures) { console.error(`[test-places] ${failures} check(s) failed`); process.exit(1); }
  console.log('[test-places] all checks passed');
})().catch((e) => { console.error('[test-places] error:', e); process.exit(1); });
