/**
 * k6 helpers for the TripKing load test — per-endpoint custom metrics, auth via the dev-OTP path,
 * and a `hit()` wrapper that records the metric + checks the status (a 429 from rate limiting is
 * expected under load, so it's not counted as a failure — it goes to the rate_limited_429 counter).
 *
 * NEW EDGE FUNCTION? Add its logical name to ENDPOINTS below + a target in config.ENDPOINT_THRESHOLDS
 * + an entry in test-data.getRequests().
 */
import http from 'k6/http';
import { check } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { BASE_URL } from './config.js';

export const ENDPOINTS = [
  'admin-lists', 'places-search', 'trips-list', 'trips-list-radius',
  'vacancies-list', 'vacancies-list-radius', 'drivers-list', 'drivers-list-radius',
  'drivers-me', 'agents-list', 'notifications-list', 'alerts-list', 'reviews-list', 'places-create',
];
const safe = (n) => n.replace(/-/g, '_');
const dur = {}, errs = {}, reqs = {};
for (const n of ENDPOINTS) {
  dur[n] = new Trend(`ep_${safe(n)}_duration`, true);
  errs[n] = new Rate(`ep_${safe(n)}_errors`);
  reqs[n] = new Counter(`ep_${safe(n)}_reqs`);
}
const rateLimited = new Counter('rate_limited_429');

/** Sign in via /auth's dev-OTP placeholder; returns the access token (or '' on failure). */
export function signIn(role) {
  const phone = `+919900${Math.floor(100000 + Math.random() * 900000)}`;
  const h = { 'Content-Type': 'application/json' };
  http.post(`${BASE_URL}/auth/auth/request-otp`, JSON.stringify({ phone }), { headers: h });
  const r = http.post(`${BASE_URL}/auth/auth/verify-otp`, JSON.stringify({ phone, otp: '123456', display_name: `LoadTest ${role}`, role }), { headers: h });
  try { return r.json('data.access_token') || ''; } catch { return ''; }
}

/** Idempotently create a driver profile for `token` so GET /drivers/me returns 200 (used in setup). */
export function createDriverProfile(token) {
  if (!token) return;
  http.post(`${BASE_URL}/drivers`, JSON.stringify({ full_name: 'LoadTest Driver' }), { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } });
}

/** Fire one request, record the per-endpoint Trend/Rate/Counter, and check the status. */
export function hit(name, method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = http.request(method, `${BASE_URL}${path}`, body ? JSON.stringify(body) : null, { headers, tags: { ep: name } });
  if (dur[name]) {
    dur[name].add(res.timings.duration);
    errs[name].add(res.status >= 400 && res.status !== 429);
    reqs[name].add(1);
  }
  if (res.status === 429) rateLimited.add(1);
  check(res, { [`${name}: 2xx/3xx (or 429 rate-limit)`]: (r) => (r.status >= 200 && r.status < 400) || r.status === 429 });
  return res;
}
