#!/usr/bin/env node
/**
 * Smoke test for the /vacancies edge function.
 *   VACANCIES_API_BASE=https://<ref>.supabase.co/functions/v1 node scripts/test-vacancies.cjs
 * Skips cleanly (exit 0) if VACANCIES_API_BASE is unset.
 *
 * Covers: public list (200 + array) + filters, 404, unauth write (401), no-driver-profile (403),
 * post-my-availability happy path (driver + destinations joined), GET/:id, cancel (owner / non-owner / unauth).
 */
const BASE = (process.env.VACANCIES_API_BASE || (process.env.VITE_API_BASE_URL ? `${process.env.VITE_API_BASE_URL}/functions/v1` : '')).replace(/\/+$/, '');
if (!BASE) {
  console.log('[test-vacancies] VACANCIES_API_BASE not set — skipping.');
  process.exit(0);
}
const NONE = '00000000-0000-0000-0000-000000000000';
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
  const phone = `+919900${Math.floor(100000 + Math.random() * 900000)}`;
  await j('POST', '/auth/auth/request-otp', { body: { phone } });
  const auth = await j('POST', '/auth/auth/verify-otp', { body: { phone, otp: '123456', display_name: `Smoke ${role}`, role } });
  return auth.json?.data?.access_token;
}
const hasCity = (cities, cityId) => Array.isArray(cities) && cities.some((c) => c && c.id === cityId);

(async () => {
  console.log(`[test-vacancies] base = ${BASE}`);

  const driverToken = await tokenFor('driver');
  const otherToken = await tokenFor('trip_manager'); // a user with no driver profile
  check('driver auth token obtained', !!driverToken);
  check('other auth token obtained', !!otherToken);
  if (!driverToken || !otherToken) process.exit(1);

  const created = await j('POST', '/drivers', { token: driverToken, body: { full_name: 'Vacancy Smoke Driver' } });
  const driverId = created.json?.data?.id;
  check('driver profile created', created.status === 200 && !!driverId, `status=${created.status}`);

  const cities = await j('GET', '/admin/cities');
  const cityList = cities.json?.data || [];
  const currentCityId = cityList[0]?.id;
  const dest1 = cityList[1]?.id || currentCityId;
  const dest2 = cityList[2]?.id || dest1;
  check('have at least 1 city to work with', !!currentCityId);
  if (!currentCityId || !driverId) process.exit(1);

  // ── public reads ───────────────────────────────────────────────────────
  const list = await j('GET', '/vacancies');
  check('GET /vacancies → 200 + array', list.status === 200 && Array.isArray(list.json?.data), `status=${list.status} ${JSON.stringify(list.json?.error || '')}`);
  const g404 = await j('GET', `/vacancies/${NONE}`);
  check('GET /vacancies/<nonexistent> → 404', g404.status === 404, `status=${g404.status}`);

  // ── writes need auth + a driver profile ────────────────────────────────
  const noAuth = await j('POST', '/vacancies', { body: { current_city_id: currentCityId } });
  check('POST /vacancies without auth → 401', noAuth.status === 401, `status=${noAuth.status}`);
  const noDriver = await j('POST', '/vacancies', { token: otherToken, body: { current_city_id: currentCityId } });
  check('POST /vacancies by a user with no driver profile → 403', noDriver.status === 403, `status=${noDriver.status}`);
  const noCity = await j('POST', '/vacancies', { token: driverToken, body: {} });
  check('POST /vacancies without current_city_id → 422', noCity.status === 422, `status=${noCity.status}`);

  // ── post my availability ───────────────────────────────────────────────
  const posted = await j('POST', '/vacancies', { token: driverToken, body: { current_city_id: currentCityId, destination_city_ids: [dest1, dest2], min_rate_per_km: 14, notes: 'Smoke run' } });
  const vacancyId = posted.json?.data?.id;
  check('POST /vacancies (driver) → 200 + id + driver_id', posted.status === 200 && !!vacancyId && posted.json?.data?.driver_id === driverId, `status=${posted.status} ${JSON.stringify(posted.json?.error || '')}`);
  check('POST /vacancies joins current_city', !!posted.json?.data?.current_city && posted.json.data.current_city.id === currentCityId, `got=${JSON.stringify(posted.json?.data?.current_city || null)}`);
  const destCities = (posted.json?.data?.vacancy_destinations || []).map((vd) => vd.city).filter(Boolean);
  check('POST /vacancies joins destination cities', hasCity(destCities, dest1), `dests=${JSON.stringify(destCities.map((c) => c.id))}`);
  if (!vacancyId) process.exit(1);

  // ── reads + filters ────────────────────────────────────────────────────
  const gotOne = await j('GET', `/vacancies/${vacancyId}`);
  check('GET /vacancies/:id → 200 + matching id', gotOne.status === 200 && gotOne.json?.data?.id === vacancyId, `status=${gotOne.status}`);
  const byDriver = await j('GET', `/vacancies?driver_id=${driverId}`);
  check('GET /vacancies?driver_id= → contains my vacancy', byDriver.status === 200 && (byDriver.json?.data || []).some((v) => v.id === vacancyId), `len=${byDriver.json?.data?.length}`);
  const byCity = await j('GET', `/vacancies?current_city_id=${currentCityId}`);
  check('GET /vacancies?current_city_id= → contains my vacancy', byCity.status === 200 && (byCity.json?.data || []).some((v) => v.id === vacancyId), `len=${byCity.json?.data?.length}`);
  const byDest = await j('GET', `/vacancies?destination_city_id=${dest1}`);
  check('GET /vacancies?destination_city_id= → contains my vacancy', byDest.status === 200 && (byDest.json?.data || []).some((v) => v.id === vacancyId), `len=${byDest.json?.data?.length}`);
  const byNoDest = await j('GET', `/vacancies?destination_city_id=${NONE}`);
  check('GET /vacancies?destination_city_id=<none> → 200 + empty array', byNoDest.status === 200 && Array.isArray(byNoDest.json?.data) && byNoDest.json.data.length === 0, `status=${byNoDest.status} len=${byNoDest.json?.data?.length}`);

  // ── cancel ─────────────────────────────────────────────────────────────
  const cancelNoAuth = await j('POST', `/vacancies/${vacancyId}/cancel`, {});
  check('POST /vacancies/:id/cancel without auth → 401', cancelNoAuth.status === 401, `status=${cancelNoAuth.status}`);
  const cancelNotOwner = await j('POST', `/vacancies/${vacancyId}/cancel`, { token: otherToken });
  check('POST /vacancies/:id/cancel by a non-owner → 403', cancelNotOwner.status === 403, `status=${cancelNotOwner.status}`);
  const cancelled = await j('POST', `/vacancies/${vacancyId}/cancel`, { token: driverToken });
  check('POST /vacancies/:id/cancel (owner) → 200 + status cancelled', cancelled.status === 200 && cancelled.json?.data?.status === 'cancelled', `status=${cancelled.status} ${JSON.stringify(cancelled.json?.error || '')}`);
  const cancelAgain = await j('POST', `/vacancies/${vacancyId}/cancel`, { token: driverToken });
  check('POST /vacancies/:id/cancel again → 409', cancelAgain.status === 409, `status=${cancelAgain.status}`);
  const byStatus = await j('GET', '/vacancies?status=cancelled');
  check('GET /vacancies?status=cancelled → contains my vacancy', byStatus.status === 200 && (byStatus.json?.data || []).some((v) => v.id === vacancyId), `len=${byStatus.json?.data?.length}`);

  if (failures) { console.error(`[test-vacancies] ${failures} check(s) failed`); process.exit(1); }
  console.log('[test-vacancies] all checks passed');
})().catch((e) => { console.error('[test-vacancies] error:', e); process.exit(1); });
