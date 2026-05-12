/**
 * TripKing API load test (k6).
 *   k6 run tests/load/scenario.js                          — the `smoke` preset (3 VUs, 30s)
 *   k6 run -e SCENARIO=load tests/load/scenario.js         — ramp to 20 VUs for 2m
 *   k6 run -e BASE_URL=… -e SCENARIO=load -e VUS=50 -e DURATION=5m tests/load/scenario.js
 * See tests/load/README.md.
 */
import { sleep } from 'k6';
import { SCENARIOS, SCENARIO, DEFAULT_THRESHOLDS, ENDPOINT_THRESHOLDS } from './config.js';
import { signIn, createDriverProfile, hit } from './helpers.js';
import { getRequests } from './test-data.js';

export const options = {
  scenarios: { default: { ...SCENARIOS[SCENARIO] } },
  thresholds: {
    ...DEFAULT_THRESHOLDS,
    ...Object.fromEntries(
      Object.entries(ENDPOINT_THRESHOLDS).map(([n, t]) => [`ep_${n.replace(/-/g, '_')}_duration`, [`p(95)<${t.p95}`, `p(99)<${t.p99}`]]),
    ),
  },
};

export function setup() {
  const user = signIn('trip_manager');
  const driver = signIn('driver');
  createDriverProfile(driver); // so the GET /drivers/me sample returns 200
  return { user, driver };
}

// Built lazily per-VU on the first iteration (we need the tokens from setup()).
let flatMix = null;
export default function (data) {
  if (!flatMix) {
    flatMix = [];
    for (const r of getRequests(data)) for (let i = 0; i < r.w; i++) flatMix.push(r);
  }
  const r = flatMix[Math.floor(Math.random() * flatMix.length)];
  hit(r.name, r.method, r.path, { token: r.token, body: r.body });
  sleep(Math.random() * 0.5 + 0.2);
}
