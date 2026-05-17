---
description: TripKing database health — cache hits, slow queries, seq scans, table sizes, unused indexes, the cron jobs, and the housekeeping-table sizes (rate_limits / api_metrics / places)
---

Check the TripKing Supabase database health. (Lighter than TournamentPro's `/dbperf` — TripKing has no `database_performance_functions` migration, so this uses the `supabase` CLI + direct queries via `scripts/db.cjs`.)

## Step 1 — Supabase CLI inspectors

These read `pg_stat_*` directly (the project is linked; ref `saxcbebqxgatiktsebxw`):

```bash
npx supabase inspect db cache-hit       # table + index cache hit ratios — want >99%
npx supabase inspect db outliers        # slowest queries (pg_stat_statements) — total time, mean, calls
npx supabase inspect db seq-scans       # tables with high sequential-scan ratios → index candidates
npx supabase inspect db unused-indexes  # never-used indexes — ignore *_pkey / *_key (constraint-enforcing)
npx supabase inspect db table-sizes
npx supabase inspect db index-sizes
npx supabase inspect db long-running-queries
npx supabase inspect db blocking
```

(If `npx supabase inspect` needs `--db-url`, build it from `.env.development`'s `SUPABASE_DB_URL`, or pass `--linked`.)

## Step 2 — Housekeeping-table sizes + the cron jobs (via `scripts/db.cjs`)

```bash
node scripts/db.cjs "select relname, n_live_tup as rows, pg_size_pretty(pg_total_relation_size(c.oid)) as size from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by pg_total_relation_size(c.oid) desc limit 20"
node scripts/db.cjs "select 'api_metrics' t, count(*) n, min(created_at) oldest from public.api_metrics union all select 'rate_limits', count(*), min(updated_at) from public.rate_limits union all select 'places', count(*), min(created_at) from public.places union all select 'admin_audit_log', count(*), min(created_at) from public.admin_audit_log"
node scripts/db.cjs "select jobid, jobname, schedule, active from cron.job order by jobid"
```

Expected cron jobs: `rate-limits-cleanup` (daily 03:17 UTC, migration 013) — and that's it. `rate_limits` should be tiny (the cron purges rows older than a day); if it's grown big, the cron may not be running. `api_metrics` grows ~one row per request and has **no** cleanup cron yet — if it's large (>~100k rows / >50MB) flag it (a `metrics-cleanup-weekly`-style cron purging >30 days, like TournamentPro's, would be the fix). PostGIS is enabled (migrations 011/015) — `places` / `drivers` have GiST-indexed `geog`.

## Step 2.5 — API cache hit rate (24h, per endpoint)

The application-level `withCache` outcomes — distinct from Postgres buffer cache (Step 1). Reads the `cache_status` column on `api_metrics` (set by `_shared/timing.ts` from the `X-Cache` header that `tagCacheHit` stamps). This is how we'd catch a regression where a `withCache` call was dropped (source/prod divergence — see PR #143's restore of orphaned `/notifications` cache).

```bash
node scripts/db.cjs "SELECT endpoint, COUNT(*) FILTER (WHERE cache_status IN ('shared','memory')) AS hits, COUNT(*) FILTER (WHERE cache_status='miss') AS misses, COUNT(*) FILTER (WHERE cache_status IS NULL) AS unwrapped, ROUND(100.0 * COUNT(*) FILTER (WHERE cache_status IN ('shared','memory')) / NULLIF(COUNT(*) FILTER (WHERE cache_status IS NOT NULL), 0), 2) AS hit_rate_pct FROM api_metrics WHERE created_at > now() - interval '24 hours' GROUP BY endpoint ORDER BY (COUNT(*) FILTER (WHERE cache_status IS NOT NULL)) DESC NULLS LAST"
```

Reading the output:
- **`hits` / `misses`**: requests that went through `withCache`. `hits/(hits+misses)` = the **hit rate**.
- **`unwrapped`**: `cache_status IS NULL` — request didn't go through `withCache` at all. Some of this is intentional (POST/PATCH writes, auth-failure short-circuits, design-justified single-row GETs like `/alerts/:id`); a *new* high count on an endpoint that used to be wrapped is a regression signal.

**IMPORTANT — read the source before flagging a "regression":** the query above splits a `memory` hit from a `shared` hit, but our older breakdown lumped them together. An endpoint can legitimately show **0 `shared` hits with lots of `memory` hits** when its `withCache` calls use `tier: 'memory'` (per-user keys, low-traffic admin endpoints, anything where the shared write would be wasteful). Before flagging an endpoint as a "cache regression":
1. `grep -n "withCache" supabase/functions/<endpoint>/index.ts` and read the tier.
2. If every `withCache` call uses `tier: 'memory'`, 0 shared hits is correct — DO NOT flag.
3. If a call uses `tier: 'shared'` but shows 0 shared hits AND non-trivial misses, that IS a regression worth flagging.
4. High-cardinality cache keys (e.g. `vacancies:list` keyed on city+driver+status combos) will show low shared-hit rates by design — note "structurally low" rather than "regression".

Baseline expectations (post-issue #114 rollout, see closing comment):
- `trips`, `notifications` — `tier: 'shared'`, should show non-zero `shared` hits.
- `vacancies` — `tier: 'shared'` but high-key cardinality; low shared hit rate is structural, not a regression.
- `alerts`, `reviews` — list endpoints wrapped; small absolute hit count fine at low traffic.
- `analytics`, `agents` — mostly `tier: 'memory'` (per-user keys); 0 shared hits is correct, don't flag.
- `drivers` — currently uncached lists (not in scope of #114).

Flag in the report ONLY if:
- A previously-wrapped endpoint shows 0 hits + 0 misses (cache wrapper likely dropped — orphan / regression), OR
- A `tier: 'shared'` endpoint shows 0 shared hits AND a high miss count (the SET path is broken).

## Step 3 — Migrations applied vs on disk

```bash
ls supabase/migrations/
node scripts/db.cjs "select version from supabase_migrations.schema_migrations order by version" 2>/dev/null || echo "(migrations applied via scripts/db.cjs --file, not the CLI — there may be no schema_migrations rows)"
```

Note: TripKing applies migrations with `node scripts/db.cjs --file …` (the Management API), not `supabase db push`, so `schema_migrations` is usually empty — that's expected; verify objects exist instead (e.g. `select to_regclass('public.places')`, `select proname from pg_proc where proname='get_api_metrics_summary'`).

## Step 4 — Present the report

```
## TripKing DB Health — [date]

### Cache & scans
| Metric | Value | Status |
|--------|-------|--------|
| Table cache hit | X% | OK >99 / WARN 95–99 / CRITICAL <95 |
| Index cache hit | X% | OK >99 / WARN 95–99 / CRITICAL <95 |
| Tables with high seq-scan ratio | [list] | OK if 0 |
| Unused indexes (excl. _pkey/_key) | [list] | OK if 0 |

### Slowest queries (pg_stat_statements)
| Query (truncated) | Calls | Total time | Mean |

### Largest tables
| Table | Rows | Size |

### Housekeeping
| Table | Rows | Oldest | Status |
| api_metrics | … | … | WARN if >100k / >50MB (no cleanup cron) |
| rate_limits | … | … | WARN if >few hundred (cron may be stuck) |
| admin_audit_log | … | … | INFO |

### API cache hit rates (24h) — origin tier (api_metrics)
| Endpoint | Hits (mem+shared) | Misses | Unwrapped | Hit % | Verdict |
| trips | … | … | … | … | ✅ Healthy / 🟡 Structurally low / 🟠 Regression |
| vacancies | … | … | … | … | … |
| notifications | … | … | … | … | … |
| alerts | … | … | … | … | … |
| reviews | … | … | … | … | … |
| <other> | … | … | … | … | INFO |

### CDN cache (Cloudflare — probe a few known-cached endpoints)
Single-shot probe to confirm CF is doing its job for the admin lookups that should be edge-cached:

```bash
KEY=sb_publishable_PRH2LiqnVjxAN7FYBVVQjA_TOWdFS0U
for path in admin/cities admin/car-types admin/app-settings admin/languages; do
  curl -sD - -o /dev/null "https://api.tripkingapp.com/functions/v1/$path" \
    -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
    | awk -v p="$path" '/^CF-Cache-Status:/{cf=$2} /^Age:/{age=$2} END{printf("%-25s cf=%-8s age=%s\n", p, cf, age)}'
done
```

Reading: `cf=HIT + age>0` = ✅ working · `cf=MISS` once, then HIT = ✅ warming · `cf=DYNAMIC` on a 200 = 🟠 origin missing `Cache-Control: public` (use `okCached()`) · `cf=BYPASS` = check cache-rule conflict.

### Verdict matrix
Apply when assigning a verdict per endpoint:

| Verdict | Trigger |
|---|---|
| ✅ Healthy | shared+memory hits ≥ 50% of cached requests OR CF=HIT consistently |
| 🟡 Structurally low | `tier:'shared'` w/ high-cardinality key (e.g. `vacancies` per-city-per-driver) |
| 🟡 Memory-only intentional | `tier:'memory'` per-user key (e.g. `agents:me`); 0 shared hits is correct |
| 🟠 Regression suspect | `tier:'shared'` w/ 0 hits + non-trivial misses → SET path may be broken |
| 🟠 Unwrapped read-heavy | 0 cache touches + high GET volume + low mutation rate → wrap candidate |
| ❌ PII leak risk | CF returns HIT on an authed/PII endpoint → stop, re-check rule + Cache-Control |

Flag endpoints where `hits + misses == 0` AND it used to be wrapped (regression / orphaned wrapper — see PR #143).

### Cache feedback — 1-3 concrete next actions
End the cache section with ROI-ranked recommendations. Examples:
- "Wrap `GET /vehicles` (200 calls / 24h, 0 cache touches) — ~20 min, expect 40% hit rate"
- "`/vacancies` hit rate climbed to X% after PR #240; structurally limited beyond ~40% — accept"
- "Three CDN endpoints (X/Y/Z) show DYNAMIC despite being lookups — add `okCached()`"
- "No regressions detected; current cache design is right-sized for current traffic"

**Don't recommend Cloudflare plan upgrades** unless (a) total daily requests > 100k OR (b) origin hit rate < 30% on shared-tier endpoints with high request volume. At current scale, Free is fine.

### Cron jobs
| jobid | name | schedule | active |

### Recommendations
[ANALYZE after recent schema changes? add an api_metrics cleanup cron? add a missing index? drop an unused one?]
```

If everything's nominal: "DB healthy — no action required." Always note if a recent migration would warrant `ANALYZE public.<table>;`.
