---
description: TripKing full health check — runs /metrics, /dbperf, /smokeall, the Vercel deploy status, and GitHub health, then a unified action summary
---

Run a comprehensive TripKing health check by executing each diagnostic **in full** (the complete report for each, exactly as if run individually — don't abbreviate within a section), then end with a consolidated action summary.

Output order:
1. Full `/metrics` report
2. Full `/dbperf` report
3. Full `/smokeall` report
4. Frontend deploy status (Vercel)
5. Unified action summary

---

## Step 1 — API metrics — full report

Execute the complete `/metrics` workflow (see `.claude/commands/metrics.md`): `get_api_metrics_summary(24)`, the raw slow-request + error queries on `api_metrics`, instrumentation coverage vs the 12 edge functions, and GitHub health. Present the FULL structured report with all tables.

## Step 2 — Database — full report

Execute the complete `/dbperf` workflow (see `.claude/commands/dbperf.md`): `npx supabase inspect db` (cache-hit, outliers, seq-scans, unused-indexes, table-sizes, long-running, blocking), the housekeeping-table sizes + cron jobs via `scripts/db.cjs`, migrations applied vs on disk. Present the FULL report with all tables (cache & scans, slowest queries, largest tables, housekeeping, cron jobs, recommendations).

## Step 3 — Edge-function smokes — full report

Execute the complete `/smokeall` workflow (see `.claude/commands/smokeall.md`): run every `scripts/test-*.cjs` against `https://saxcbebqxgatiktsebxw.supabase.co` (via `VITE_API_BASE_URL`), present the per-suite pass/fail table, and diagnose any failures.

## Step 4 — Frontend deploy status (Vercel)

TripKing's frontend is deployed at **`trip-king.vercel.app`**. Check the latest deployment:

- Prefer the `vercel` MCP if available: list the project's recent deployments — name, state (`READY` / `BUILDING` / `ERROR`), the git commit it built, age. If the latest is `ERROR`, pull the build log and summarise why.
- Otherwise: `curl -sI https://trip-king.vercel.app/ | head -3` to confirm it's up (200/3xx), and note that the detailed deploy state needs the Vercel dashboard.
- Sanity-check that the live `main` HEAD (`git log -1 --oneline origin/main`) is what Vercel last built (Vercel auto-deploys `main`).

Present:
```
### Frontend (Vercel — trip-king.vercel.app)
| Check | Value | Status |
|-------|-------|--------|
| Latest deployment | READY/BUILDING/ERROR | OK/WARN/CRITICAL |
| Built commit | <hash> "<msg>" | matches origin/main? |
| Site reachable | 200 / … | OK/CRITICAL |
[if ERROR: the build-failure reason]
```

---

## Step 5 — Unified action summary

```
---

## TripKing Status — [date]

### Health Dashboard
| System | Grade / State | Key metric | Status |
|--------|---------------|------------|--------|
| API (api_metrics, 24h) | OK/WARN/CRITICAL | Avg Xms · Errors X% · p95 Xms | … |
| Database | OK/WARN/CRITICAL | Cache X% · api_metrics N rows · rate_limits N | … |
| Edge-function smokes | X/12 green | [failing suites] | OK if 12/12 |
| Frontend (Vercel) | READY/ERROR | built <hash> | OK/CRITICAL |
| GitHub | X PRs, Y issues | Z failed workflows (24h) | … |

### Action items (need attention — severity-sorted)
1. [CRITICAL] … (errors for users now: 500s, a failing smoke, an ERROR deploy)
2. [WARNING] … (degrading p95, rising error rate, api_metrics with no cleanup cron and growing, stale main not yet deployed)
3. [INFO] … (housekeeping — ANALYZE after a migration, an unused index, etc.)

### Done this run
[anything fixed proactively — e.g. re-deployed a stale edge fn, re-ran a flaky smoke that then passed]

### Reminders / known TODOs
- The one remaining Phase-6 backend item: real SMS + `auth_otps` for `/auth` (needs a provider decision) — `/auth` is a dev placeholder (`otp:'12345'`, dev-only `role:'admin'` self-signup).
- Sentry / PostHog aren't wired for TripKing yet (only `.env.example` placeholders) — no `/sentry` or `/posthog` skill yet.
```

### Rules
- **CRITICAL** = anything causing errors for users right now (5xx, a red smoke, an `ERROR` Vercel deploy, site down).
- **WARNING** = degradation trends / things about to break (rising p95 or error rate, `api_metrics` growing unbounded, `main` ahead of the last Vercel build, the `rate-limits-cleanup` cron not running).
- **INFO** = housekeeping.
- If everything's healthy: "All systems healthy — no action required."
- Always show "Done this run" so the user sees what was fixed proactively.
