/**
 * k6 load-test config for the TripKing API.
 *
 * Run:  k6 run tests/load/scenario.js                              (the `smoke` preset — 3 VUs / 30s)
 *       k6 run -e SCENARIO=load tests/load/scenario.js             (ramp to 20 VUs / 2m)
 *       k6 run -e BASE_URL=… -e VUS=50 -e DURATION=5m -e SCENARIO=load tests/load/scenario.js
 *
 * Env vars (all optional):
 *   BASE_URL  — the `…/functions/v1` root (default: the QA Supabase project — note: there is no
 *               separate load-test env, so `npm run test:load` hits QA. Don't point it at prod.)
 *   SCENARIO  — `smoke` (default) | `load`
 *   VUS       — override the VU count
 *   DURATION  — override the steady-state duration
 *
 * No API key needed — public reads are unauthenticated; the authed reads get a Bearer via the
 * `/auth` dev-OTP path (see helpers.signIn). Edge functions cold-start ~900ms on Deno Deploy and
 * warm to ~150ms, so per-endpoint p95 targets are generous.
 */
export const BASE_URL = (__ENV.BASE_URL || 'https://saxcbebqxgatiktsebxw.supabase.co/functions/v1').replace(/\/+$/, '');

export const DEFAULT_THRESHOLDS = {
  http_req_failed: ['rate<0.10'],                 // includes 429s under load — see rate_limited_429
  http_req_duration: ['p(95)<4000', 'p(99)<8000'],
};

// Per-endpoint p95/p99 targets (ms). Keys = logical endpoint names (helpers.ENDPOINTS / test-data).
export const ENDPOINT_THRESHOLDS = {
  'admin-lists':           { p95: 1500, p99: 3000 },
  'places-search':         { p95: 4000, p99: 8000 },   // proxies an external geocoder (LocationIQ)
  'trips-list':            { p95: 3000, p99: 6000 },
  'trips-list-radius':     { p95: 3500, p99: 7000 },   // + a PostGIS ST_DWithin RPC
  'vacancies-list':        { p95: 3000, p99: 6000 },
  'vacancies-list-radius': { p95: 3500, p99: 7000 },
  'drivers-list':          { p95: 3000, p99: 6000 },
  'drivers-list-radius':   { p95: 3500, p99: 7000 },
  'drivers-me':            { p95: 3000, p99: 6000 },
  'agents-list':           { p95: 3000, p99: 6000 },
  'notifications-list':    { p95: 3000, p99: 6000 },
  'alerts-list':           { p95: 3000, p99: 6000 },
  'reviews-list':          { p95: 3000, p99: 6000 },
  'places-create':         { p95: 3000, p99: 6000 },
};

const VUS = Number(__ENV.VUS) || null;
const DURATION = __ENV.DURATION || null;
export const SCENARIOS = {
  smoke: { executor: 'constant-vus', vus: VUS || 3, duration: DURATION || '30s' },
  load: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [{ duration: '30s', target: VUS || 20 }, { duration: DURATION || '2m', target: VUS || 20 }, { duration: '15s', target: 0 }],
  },
};
export const SCENARIO = __ENV.SCENARIO && SCENARIOS[__ENV.SCENARIO] ? __ENV.SCENARIO : 'smoke';
