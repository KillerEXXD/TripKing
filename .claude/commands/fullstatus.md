---
description: TripKing full health check — runs /metrics, /dbperf, /smokeall, /sentry, /posthog, the Vercel deploy status, the latest scheduled E2E run, and GitHub health, then a unified action summary
---

Run a comprehensive TripKing health check by executing each diagnostic **in full** (the complete report for each, exactly as if run individually — don't abbreviate within a section), then end with a consolidated action summary.

Output order:
1. Full `/metrics` report
2. Full `/dbperf` report
3. Full `/smokeall` report
4. Full `/sentry` report
5. Full `/posthog` report
6. Frontend deploy status (Vercel)
7. Latest scheduled E2E run (GitHub Actions `e2e-qase.yml`)
8. Cache effectiveness review (origin + CDN + verdict per endpoint)
9. Unified action summary

---

## Step 1 — API metrics — full report

Execute the complete `/metrics` workflow (see `.claude/commands/metrics.md`): `get_api_metrics_summary(24)`, the raw slow-request + error queries on `api_metrics`, instrumentation coverage vs the 12 edge functions, and GitHub health. Present the FULL structured report with all tables.

## Step 2 — Database — full report

Execute the complete `/dbperf` workflow (see `.claude/commands/dbperf.md`): `npx supabase inspect db` (cache-hit, outliers, seq-scans, unused-indexes, table-sizes, long-running, blocking), the housekeeping-table sizes + cron jobs via `scripts/db.cjs`, migrations applied vs on disk. Present the FULL report with all tables (cache & scans, slowest queries, largest tables, housekeeping, cron jobs, recommendations).

## Step 3 — Edge-function smokes — full report

Execute the complete `/smokeall` workflow (see `.claude/commands/smokeall.md`): run every `scripts/test-*.cjs` against `https://saxcbebqxgatiktsebxw.supabase.co` (via `VITE_API_BASE_URL`), present the per-suite pass/fail table, and diagnose any failures.

## Step 4 — Sentry — full report

Execute the complete `/sentry` workflow (see `.claude/commands/sentry.md`): unresolved issues for `hudr/trip-king` (token from `.env.development`), categorised, high-impact issues investigated, synthetic/transient ones auto-resolved. Present the FULL report with all tables (bucket table, issues table, high-impact details, resolved-this-run, assessment).

## Step 5 — PostHog — full report (includes Speed Insights)

Execute the complete `/posthog` workflow (see `.claude/commands/posthog.md`): the HogQL queries (volume, daily activity, top pages, top visitors, geo/device/browser, custom events, client-side errors, rage clicks, **`$web_vitals`** speed insights) for project `420735` (key from `.env.development`). Present the FULL report with all tables + the daily-activity bar chart + the Speed Insights table (LCP / INP / CLS / FCP / TTFB at p75, with **rating** per Core Web Vitals thresholds, mobile-vs-desktop split, worst pages by LCP) + the action items each metric implies.

If web-vitals is freshly wired (< 24h of data) or returns no rows, say "Speed Insights freshly wired — re-run in 24h" and skip the table. Otherwise treat any p75 in the **poor** band as a CRITICAL action item, **needs-improvement** as WARNING, and call out the specific page from the worst-pages query.

## Step 6 — Frontend deploy status (Vercel)

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

## Step 7 — Latest scheduled E2E run (GitHub Actions)

The `e2e-qase.yml` workflow runs twice daily (02:30 + 14:30 UTC = 08:00 + 20:00 IST) — full Playwright suite against deployed Supabase, results posted to Qase TRIPKINGAP. This step surfaces the most-recent run so you don't have to hunt the Actions tab.

- Pull the latest run via the `github` MCP (`mcp__github__list_workflow_runs` on `KillerEXXD/TripKing`, workflow `e2e-qase.yml`, `per_page: 3`). Fall back to a public web fetch of `https://github.com/KillerEXXD/TripKing/actions/workflows/e2e-qase.yml` if the MCP is unavailable.
- From the latest run extract: `conclusion` (success/failure/cancelled), `created_at`, `head_sha` + commit subject, `html_url`, and (if `failure`) the failed-jobs / failed-tests summary from the run logs.
- If the latest run is `failure`, drill into the run's annotations/logs to surface the failing spec name(s) — at minimum the file + test title — so the action-summary CRITICAL row can name them.
- If the latest run is older than **18 hours**, that means a scheduled run was missed (cron usually fires every 12h); flag it as WARNING.

Present:
```
### E2E (GitHub Actions — e2e-qase.yml, scheduled 08:00 + 20:00 IST)
| Check | Value | Status |
|-------|-------|--------|
| Last run | <conclusion> · <relative-time> · [commit hash + subject] | OK if success/recent / CRITICAL if failure / WARNING if >18h old |
| Failing specs | <count> (list titles inline if ≤3, else "see [run](url)") | OK if 0 |
| Qase posting | enabled (TRIPKINGAP) | INFO |
| Run URL | <html_url> | — |

[If failures: 1-line each of failing test title + the assertion that broke.]
```

If both the latest scheduled run AND any on-demand `workflow_dispatch` runs in the last 24h exist, prefer the scheduled one (it runs the FULL suite; dispatch may have been grep-filtered).

---

## Step 8 — Cache effectiveness review

A dedicated, opinionated read of how caching is performing across all three tiers — produces a verdict per endpoint, not just numbers. Use the data already gathered in Steps 1 + 2 plus a small CDN-tier probe.

### Tier 1 — Origin (`api_metrics.cache_status`)

Already pulled in `/dbperf` Step 2.5. Re-cite the per-endpoint hit rate here; don't re-query.

### Tier 2 — Cloudflare CDN

The CDN intercepts cache hits BEFORE they reach origin, so they don't appear in `api_metrics`. To estimate CDN effectiveness, compare 24h request volume against a known baseline AND probe the live edge:

```bash
KEY=sb_publishable_PRH2LiqnVjxAN7FYBVVQjA_TOWdFS0U
for path in admin/cities admin/car-types admin/app-settings admin/languages admin/seat-options; do
  curl -sD - -o /dev/null "https://api.tripkingapp.com/functions/v1/$path" \
    -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
    | awk -v p="$path" '
        /^CF-Cache-Status:/ { cf=$2 }
        /^Age:/ { age=$2 }
        END { printf("%-30s cf=%-8s age=%s\n", p, cf, age) }'
done
```

Reading the output:
- **`cf=HIT` + non-zero `age`** → CF is serving the response from edge, request never reached origin. ✅
- **`cf=MISS`** → first request in this CF data centre; next request should HIT. Run twice if needed.
- **`cf=DYNAMIC`** + origin returns 200 → origin isn't emitting `Cache-Control: public`. Check the source: should it be using `okCached()` instead of `ok()`?
- **`cf=BYPASS`** → either the Cloudflare cache rule explicitly excluded this path, or a "bypass authenticated" rule is firing on the `Authorization` header.
- **`cf=EXPIRED`** → cache had it, TTL elapsed; CF revalidating with origin. Next request should HIT again with `age` reset.

### Tier 3 — Client (React Query `STALE` tiers)

Not directly measurable post-hoc but inferable from request volume per session in PostHog. Skip detailed analysis unless `/metrics` shows a regression in client-driven endpoint volume (e.g. `GET /trips` traffic per active visitor 2× what it should be at 60s `STALE.live`).

### Verdict per endpoint

Build a table grading each endpoint on what's actually going on. Use these categories (don't make up new ones):

| Verdict | Meaning |
|---|---|
| ✅ **Healthy** | Origin hit rate ≥ 50% on `tier:'shared'` endpoints OR `tier:'memory'` endpoint with consistent timing — working as designed |
| ✅ **CDN-served** | CF returns HIT; origin never sees most traffic. Best case. |
| 🟡 **Structurally low** | `tier:'shared'` but high-cardinality cache key (e.g. `vacancies` per-city-per-driver). Low hit rate by design — not a bug; document, don't fix |
| 🟡 **Memory-only (intentional)** | `tier:'memory'` per-user keys (e.g. `agents:me`, `analytics:agent`). 0 shared hits is correct. |
| 🟠 **Regression suspect** | `tier:'shared'` endpoint with high miss + 0 hit — SET path may be broken. Investigate `withCache` callsite. |
| 🟠 **Unwrapped read-heavy** | Endpoint with 0 cache touches but high GET volume + low mutation rate. Candidate for wrapping. |
| ❌ **PII leak risk** | CF returned HIT on an endpoint that shouldn't be public-cached. Stop — re-check the cache rule + origin Cache-Control header. |

### Feedback — what would move the needle now

End the section with 1-3 concrete recommendations, ranked by ROI per hour of work. Examples:
- "Wrap `GET /vehicles` (200 calls / 24h, 0 cache touches, list-style read) — ~20 min, expect 40% hit rate"
- "`/vacancies` hit rate climbed from 2% → X% after PR #240; structurally limited beyond ~40% — accept and move on"
- "Three CDN endpoints (X, Y, Z) show DYNAMIC despite being lookups — origin is not emitting Cache-Control. Add `okCached()` wrapper."
- "No regressions detected; current cache design is right-sized for current traffic. Don't tune."

Don't recommend Cloudflare plan upgrades unless: (a) total daily requests > 100k, OR (b) Tier 2 hit rate < 30% AND Indian-only traffic. At current scale, Free is fine.

---

## Step 8.5 — Auto-fixes performed this run

While running the checks above, take these safe automatic remediation actions and log them under a dedicated section. **Never** take destructive actions silently — these are only the well-known recoveries TournamentPro's `/fullstatus` has been doing for months:

- **Vacuum bloated tables.** Any public-schema table with dead-row ratio > 10% from Step 2 → call the Supabase Management API to `VACUUM ANALYZE <table>` (runs OUTSIDE a transaction so big tables don't lock up). The Supabase MCP `execute_sql` or `node scripts/db.cjs` can drive it. Skip `pg_*` system tables, skip anything < 1MB.
- **Resolve clearly synthetic Sentry issues.** Title contains `smoke test` / `synthetic` / `safe to delete` → `PUT https://sentry.io/api/0/organizations/hudr/issues/?id=<id>` with `{"status":"resolved"}`.
- **Resolve stale-fix Sentry issues** (per Step 4's existing rule — see `/sentry`'s Step 3 stale-fix cross-check).
- **Auto-resolve user-error 4xx issues** that snuck past the queryClient/apiClient filter — 401/403/404/409/422/429 are known user errors.
- **Clean orphaned notifications** — rows whose `recipient_user_id` no longer exists in `users` (FK dangle), or `trip_id` no longer exists in `trips`. DELETE in a single transaction, capped at 1,000 rows per run.

For each, print one line: `✅ Vacuumed trips (2,341 dead rows cleaned)` / `✅ Resolved 3 stale Sentry issues (TRIP-KING-X, ...) — fix commits cited in comments`. If nothing fired: `No automatic remediation needed this run.`

This section runs even on dry-state systems — the act of CHECKING is the value (confirms nothing's drifting).

## Step 8.6 — Snapshot + trends (vs previous run)

TournamentPro stores `performance_snapshots` and shows deltas across runs. TripKing doesn't have the table yet — until it does, this step is best-effort:

1. **If table `public.fullstatus_snapshots` exists:**
   - Insert a row of today's key metrics: `created_at`, `api_avg_ms`, `api_p95_ms`, `api_error_pct`, `cache_origin_hit_pct`, `db_table_cache_hit_pct`, `sentry_live_issues`, `lcp_p75`, `cls_p75`.
   - SELECT the previous row, compute deltas, render a small `### Trends vs last run` table.
2. **If the table doesn't exist:** print `Snapshots not configured — create migration to add public.fullstatus_snapshots and re-run to capture trends.`. Stop, don't auto-create (DDL needs an explicit migration PR).

If snapshots exist, present:
```
### Trends vs last run (2026-05-XX → 2026-05-YY)
| Metric | Previous | Current | Δ |
|---|---:|---:|---:|
| API avg (ms) | … | … | ↑/↓/→ |
| API p95 (ms) | … | … | ↑/↓/→ |
| API error rate | … | … | ↑/↓/→ |
| Cache origin hit % | … | … | ↑/↓/→ |
| Sentry live issues | … | … | ↑/↓/→ |
| LCP p75 (ms) | … | … | ↑/↓/→ |
```
Flag any metric with > 20% degradation as WARNING.

---

## Step 9 — Unified action summary

```
---

## TripKing Status — [date]

### Health Dashboard
| System | Grade / State | Key metric | Status |
|--------|---------------|------------|--------|
| **Overall** | **A+ to F** | derived: -1 grade per CRITICAL, -0.3 per WARNING, +0.2 per "no action" green | — |
| API (api_metrics, 24h) | OK/WARN/CRITICAL | Avg Xms · Errors X% · p95 Xms | … |
| Database | **A+ to F** + OK/WARN | Cache X% · Dead-row peak X% · api_metrics N rows · rate_limits N | grade: cache <95 = B-, <90 = C, <85 = D; dead rows >10% on any table demotes one grade |
| Edge-function smokes | X/12 green | [failing suites] | OK if 12/12 |
| Sentry (trip-king) | X real issues | Y events, Z users | OK if 0 real |
| PostHog (trip-king) | X visitors | Y events | INFO |
| Speed Insights (Core Web Vitals, 24h) | OK/WARN/CRITICAL | LCP p75 X · INP p75 X · CLS X | poor on any metric = CRITICAL |
| Frontend (Vercel) | READY/ERROR | built <hash> | OK/CRITICAL |
| E2E (Playwright nightly) | success/failure | X passed · Y failed · <relative-time> | OK/CRITICAL |
| Cache | Origin X% · CDN Y endpoints HIT · Z regressions | one-line headline from Step 8 verdict | OK if 0 regressions / WARNING if 1-2 / CRITICAL if PII leak |
| GitHub | X PRs, Y issues | Z failed workflows (24h) | … |

### Action items (need attention — severity-sorted)
1. [CRITICAL] … (errors for users now: 500s, a failing smoke, an ERROR deploy, a recurring Sentry error)
2. [WARNING] … (degrading p95, rising error rate, api_metrics with no cleanup cron and growing, stale main not yet deployed, a data/parse Sentry issue → an API contract mismatch)
3. [INFO] … (housekeeping — ANALYZE after a migration, an unused index, a synthetic Sentry issue to delete, etc.)

### Auto-Fixed This Run
[Re-quote the per-line output from Step 8.5 here for easy scanning. Each line one of:]
- ✅ Vacuumed X tables (Y dead rows cleaned)
- ✅ Resolved X synthetic + Y stale-fix + Z user-error Sentry issues (with IDs + fix-commit refs)
- ✅ Cleaned X orphaned notifications
- ✅ Re-deployed a stale edge fn / re-ran a flaky smoke that then passed
(or "No automatic remediation needed this run." if nothing fired.)

### Reminders / known TODOs
- The one remaining Phase-6 backend item: real SMS + `auth_otps` for `/auth` (needs a provider decision) — `/auth` is a dev placeholder (`otp:'12345'`, dev-only `role:'admin'` self-signup).
```

### Rules
- **CRITICAL** = anything causing errors for users right now (5xx, a red smoke, an `ERROR` Vercel deploy, site down, a recurring Sentry error hitting real users).
- **WARNING** = degradation trends / things about to break (rising p95 or error rate, `api_metrics` growing unbounded, `main` ahead of the last Vercel build, the `rate-limits-cleanup` cron not running, a Sentry data/parse issue pointing at an API contract problem).
- **INFO** = housekeeping (incl. synthetic Sentry test issues to delete).
- If everything's healthy: "All systems healthy — no action required."
- Always show "Done this run" so the user sees what was fixed proactively.
