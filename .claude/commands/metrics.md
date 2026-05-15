---
description: TripKing API metrics (last N hours, default 24) — per-endpoint latency/errors from api_metrics, slowest requests, instrumentation gaps, plus GitHub health
---

Investigate TripKing's API performance for the **last 24 hours** (or `$1` hours if a number is given). Workflow:

## Step 1 — Per-endpoint summary

Query the `api_metrics` table. There's a server-computed rollup — use it:

```bash
node scripts/db.cjs "select public.get_api_metrics_summary(24) as s"
```

`get_api_metrics_summary(p_hours)` returns `{ hours, since, generated_at, total, errors, endpoints: [{ endpoint, count, errors, avg_ms, max_ms, p95_ms }] }`. (It powers `GET /analytics/api-metrics?hours=24` — admin Bearer — too.)

## Step 2 — Slowest individual requests + the error breakdown (raw `api_metrics`)

```bash
node scripts/db.cjs "select endpoint, method, status, duration_ms, created_at from public.api_metrics where created_at > now() - interval '24 hours' and duration_ms > 1500 order by duration_ms desc limit 20"
node scripts/db.cjs "select endpoint, method, status, count(*) as n from public.api_metrics where created_at > now() - interval '24 hours' and status >= 400 group by endpoint, method, status order by n desc"
```

(All requests pass through `withTiming` in `_shared/timing.ts`, which fire-and-forget-persists one `api_metrics` row each — `OPTIONS` preflights are excluded; persist rate is ~90% on Deno Deploy, fine for trend data. `api_metrics` has admin-only RLS, so use `scripts/db.cjs` / the service role, not the anon key.)

## Step 3 — Instrumentation coverage

List the edge functions and check each appears in `api_metrics`:

```bash
ls supabase/functions/ | grep -v _shared
node scripts/db.cjs "select distinct endpoint from public.api_metrics where created_at > now() - interval '24 hours' order by 1"
```

There are 16 functions: `admin, agents, alerts, analytics, auth, bug-reports, debug, drivers, notifications, passengers, places, reviews, trips, vacancies, vehicles, video-verifications`. Cross-check against `ls supabase/functions/ | grep -v '^_'` — that's the source of truth. A function with **zero** calls in 24h is fine (low-traffic). A function that was called but has **no metrics rows** is an instrumentation gap (it should be wrapped with `withTiming('<name>', …)`).

## Step 4 — GitHub health

Read the GitHub PAT from `CLAUDE.md` at runtime (don't hardcode — it can rotate):

```js
const fs = require('fs');
const md = fs.readFileSync('CLAUDE.md', 'utf-8');
const tok = (md.match(/\*\*Personal Access Token\*\*\s*\|\s*`(ghp_[^`]+)`/) || [])[1];
const REPO = 'KillerEXXD/TripKing';
const headers = { Authorization: `token ${tok}`, Accept: 'application/vnd.github+json' };
```

(Or use the `github` MCP / `gh` CLI if available.) Gather: open PRs (count, ages), open issues (count — exclude PRs), failed workflow runs in the last 24h, latest deployment status, Dependabot alerts by severity, age of the last commit on `main`.

## Step 5 — Present the report

```
## TripKing API Metrics — last 24h ([since] → [now])

### Overview
- Total requests: [n] · Endpoints active: [x] / 12 · Errors: [e] ([e/n %])

### Health
| Metric | Value | Status |
|--------|-------|--------|
| Avg response | Xms | OK/WARN/CRITICAL |
| Worst p95 | Xms (endpoint) | OK/WARN/CRITICAL |
| Error rate | X% | OK/WARN/CRITICAL |

### Per-endpoint (sorted by avg DESC)
| Endpoint | Calls | Avg | p95 | Max | Errors |
|----------|-------|-----|-----|-----|--------|

### Slow requests (>1.5s)
| Time | Endpoint | Method | Status | Duration |

### Errors (status ≥ 400)
| Endpoint | Method | Status | Count |

### Inactive endpoints (no calls in 24h)
[list — informational]

### GitHub Health
| Check | Value | Status |
|-------|-------|--------|
| Open PRs / Issues | X / Y | INFO / WARN if issues>5 |
| Failed workflows (24h) | X | OK if 0, WARN 1-2, CRITICAL >2 |
| Dependabot alerts | X critical, Y high | OK/WARN/CRITICAL |
| Last commit | Xh ago | INFO |

### Recommendations
[prioritised — only if anything needs attention]
```

### Thresholds
- **OK**: avg < 500ms, error rate < 2%, p95 < 2s
- **WARN**: avg 500ms–2s, error rate 2–10%, p95 2–4s (the geocoder-proxy `/places/search` and the radius queries are inherently slower — judge them against ~4s)
- **CRITICAL**: avg > 2s, error rate > 10%, p95 > 6s
- If nothing needs attention: "API healthy — no action required."
