# TripKing — k6 load tests

Synthetic load over the public + lightly-authed `…/functions/v1` endpoints. Complements `api_metrics` /
`GET /analytics/api-metrics` (which observe *real* traffic) with a *synthetic* latency/error regression
check you can run before a release.

## Run

Needs [k6](https://k6.io/docs/get-started/installation/) on `PATH`. No API key required.

```sh
k6 run tests/load/scenario.js                        # smoke preset — 3 VUs, 30s
k6 run -e SCENARIO=load tests/load/scenario.js       # load preset — ramp to 20 VUs, 2m
k6 run -e SCENARIO=load -e VUS=50 -e DURATION=5m tests/load/scenario.js
k6 run -e BASE_URL=https://<ref>.supabase.co/functions/v1 tests/load/scenario.js
```

Or `npm run test:load` (the smoke preset). **There is no separate load-test environment** — `BASE_URL`
defaults to the QA Supabase project, so `npm run test:load` hits QA. Don't point `BASE_URL` at prod.

The authed-read load (`GET /trips`, `/drivers/me`, `/notifications`, `/alerts`) gets a Bearer via the
`/auth` dev-OTP path (`POST /auth/auth/verify-otp { otp:'12345' }`) — see `helpers.signIn`. `POST /places`
(find-or-create) is per-IP rate-limited, so under load it'll 429 from a single test machine; that's
expected and counted in the `rate_limited_429` metric, not as a failure.

## Files

| File | What |
|---|---|
| `config.js` | `BASE_URL`, the `smoke`/`load` presets, global + per-endpoint p95/p99 thresholds. |
| `helpers.js` | `signIn(role)`, `hit(name, method, path, {token, body})` (records `ep_<name>_duration`/`_errors`/`_reqs`), the `ENDPOINTS` list. |
| `test-data.js` | `getRequests(setupData)` → the weighted endpoint mix. |
| `scenario.js` | the k6 entry point (`options`, `setup`, `default`). |

## Adding a new edge function

1. add its logical name to `helpers.ENDPOINTS`,
2. add a target to `config.ENDPOINT_THRESHOLDS`,
3. add an entry (with a weight) to `test-data.getRequests()`.

(See `docs/CONTINUE_HERE_BACKEND.md` — the "new edge function recipe".)
