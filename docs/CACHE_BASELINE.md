# Cache baseline — Phase 0 (2026-05-13, last 7 days)

**Purpose.** A snapshot of where TripKing's edge-function reads spend their time, classified by cacheability, with the auth-leakage traps called out — so the 4-tier caching rollout (see the approved plan) has real numbers to tune against.

**Refresh cadence.** Re-run this doc whenever traffic shape changes (new feature, marketing push) or at minimum monthly. Source queries are at the end.

---

## 1. Headline numbers (last 168 h)

- **3,728 total requests** across 14 edge functions.
- **7 server-side errors** (status ≥ 500) — 0.19 % error rate. **Health is good.**
- DB cache: **100 %** table hit, **99.85 %** index hit.
- DB is tiny — largest user table is `api_metrics` at **912 kB / 3,737 rows** (well under the cleanup threshold).
- Both housekeeping crons run: `rate-limits-cleanup` (daily 03:17 UTC), `api-metrics-cleanup` (weekly Sun 04:23 UTC).
- **No slow application queries.** Top `pg_stat_statements` entries are Supabase's own catalog/timezone introspection — the app SQL doesn't crack the top 15.

**Conclusion:** the cost we're paying today is **edge-function dispatch + Deno cold/warm overhead + transform + serialisation**, not Postgres. That sets the strategy: cache *responses*, not *rows*. The biggest wins are the responses that take 500–1500 ms to assemble and could come from memory in <5 ms.

---

## 2. Per-endpoint perf — sorted by call volume × p95 (hot paths first)

Only 2xx responses, so latencies aren't skewed by 401/404 fast-paths.

| Endpoint+method | Calls/wk | Avg ms | p95 ms | Bucket | CDN-safe? | Comment |
|---|--:|--:|--:|---|---|---|
| **GET /trips** | 554 | 441 | **895** | LIVE | **varies-by-viewer** | #1 hot path. Payload differs for owner/assigned/anonymous. Server-side cache only; do NOT put on Cloudflare without splitting public/authed routes. |
| **POST /auth** | 504 | 705 | 1558 | UNCACHEABLE | — | OTP request/verify/refresh. Optimise via single-flight only. |
| **POST /trips** | 259 | 1357 | 1660 | UNCACHEABLE | — | Mutation. Slow on insert → invalidates list cache. |
| **GET /admin/*** | 224 | 527 | **1000** | MASTER | **safe-public** | **Biggest CDN win.** Reference data: car_types, cities, languages, etc. Public-cacheable for hours. |
| **PATCH /drivers** | 168 | 1132 | 1645 | UNCACHEABLE | — | Mutation. Hot because of location pings — confirm `meta:{ silent:true }` and don't toast. |
| **GET /vacancies** | 163 | 454 | **936** | LIVE | safe-public | High-volume marketplace board. 5–15 min TTL is reasonable; safe to put behind Cloudflare. |
| **GET /drivers** | 145 | 651 | **1356** | PROFILE | **varies-by-viewer** | Admin sees KYC fields; public doesn't. Cache per-role server-side, not at CDN. |
| **POST /drivers** | 95 | 1416 | 1893 | UNCACHEABLE | — | Mutation (profile create/idempotent). |
| **GET /notifications** | 78 | 512 | 1071 | PER_USER_PRIVATE | private-only | Per-inbox. Cache in memory keyed by user_id, short TTL (30–60 s). |
| **POST /places** | 77 | 546 | 717 | UNCACHEABLE | — | Find-or-create — but the `GET /places/search` path already does `Cache-Control: public, max-age=300`. |
| **GET /auth/me** | 47 | 620 | 1121 | PER_USER_PRIVATE | private-only | Frequent. Cache in memory per user_id, 30–60 s. |
| **GET /agents** | 43 | 712 | 1256 | PROFILE | **varies-by-viewer** | Same admin-vs-public split as `/drivers`. |
| **POST /agents** | 42 | 1219 | 1408 | UNCACHEABLE | — | |
| **GET /reviews** | 37 | 315 | 553 | LIVE | **varies-by-viewer** | Anon sees published; authed/admin see more. |
| **GET /vehicles** | 36 | 484 | 1203 | PROFILE | safe-public | Vehicle records are public. CDN-safe. |
| **POST /vacancies** | 36 | 1311 | 1548 | UNCACHEABLE | — | |
| **GET /analytics** | 31 | 538 | 563 | varies | private-only (admin/owner) | `/analytics/admin` is the big win — compute-heavy aggregation, 5–15 min TTL. |
| **PATCH /agents** | 31 | 1177 | 1483 | UNCACHEABLE | — | |
| **GET /places/search** | 22 | 654 | 1824 | IMMUTABLE | safe-public | Already cached (`okCached`, 300 s). Pattern to copy. |
| **GET /alerts** | 17 | 565 | 699 | PER_USER_PRIVATE | private-only | |
| **GET /video-verifications/available-slots** | (within 45) | 1275 | 1635 | LIVE | private-only | High-impact when KYC traffic ramps. |

**Outliers (>3 s observed):** all single-occurrence cold-start spikes clustered around peak windows (May 12 17:22 + 17:39 UTC). No sustained slow path. Cold-start mitigation is a separate concern from caching.

---

## 3. Cacheability buckets (the design grid)

Each bucket maps to a single caching strategy.

### `IMMUTABLE` — never refetch once written
- `GET /places/search?q=...&near_lat=...&near_lng=...` (already done)
- `GET /trips/:id` **only when status = completed**
- `GET /reviews/:id` once published

**Strategy:** Cache-Control `public, max-age=86400, immutable` + Cloudflare. Browser+SW also caches forever.

### `MASTER` — admin reference data
- `GET /admin/car-types`, `/admin/fuel-types`, `/admin/vehicle-makes`, `/admin/vehicle-models`, `/admin/seat-options`, `/admin/cities`, `/admin/languages`, `/admin/review-tags`, `/admin/cancel-reasons`
- `GET /admin/app-settings`

**Strategy:** Cache-Control `public, max-age=900, s-maxage=1800, stale-while-revalidate=900`. Server-side memory + shared cache (15 min). Bump `referenceDataVersion` on any admin write → clients re-fetch.

### `PROFILE` — slow-changing per-entity, public-visible
- `GET /drivers/:id` (public payload, the deactivated-hidden one)
- `GET /agents/:id`
- `GET /vehicles`, `GET /vehicles/:id`

**Strategy:** Cache-Control `public, max-age=300`. Server-side memory only (skip shared DB cache — payload is small, edge function instance memory is enough). ETag for revalidation.

### `LIVE` — marketplace lists, high turnover
- `GET /trips?status=open&...`
- `GET /vacancies?current_city_id=...`
- `GET /trips/:id/applicants`
- `GET /video-verifications/available-slots`

**Strategy:** Server-side cache with **30–60 s TTL**, keyed by `(endpoint, filters, viewerRole)`. Mutation handlers invalidate `cacheDeletePattern('trips:list:*')`. Browser keeps React Query's `STALE.live = 30_000`.

### `PER_USER_PRIVATE` — per-inbox / per-account
- `GET /notifications`
- `GET /alerts`
- `GET /drivers/me`, `GET /agents/me`, `GET /auth/me`
- `GET /trips/applied`
- `GET /analytics/agent`, `GET /analytics/driver`

**Strategy:** **Never** at CDN. Cache-Control `private, no-store`. Server-side memory cache keyed by `user_id`, 30–60 s TTL. The `me` endpoints are the highest-value targets here — they're hit on every page load.

### `UNCACHEABLE`
- All mutations (POST/PATCH/DELETE)
- `POST /auth/*`
- `GET /trips/by-otp/:otp` (single-use credential)
- `GET /admin/users` (live admin tool)

---

## 4. The Cloudflare PII trap — the **must-not-break** rule

Four endpoints return **different payloads at the same URL** depending on the caller's role. If we put Cloudflare in front naively, we'll serve admin payloads to anonymous users (or vice-versa).

| Endpoint | What varies |
|---|---|
| `GET /trips`, `GET /trips/:id` | Owner sees passenger phone + OTP; assigned driver sees passenger phone; anon sees neither. Owner sees in-progress driver position. |
| `GET /drivers`, `GET /drivers/:id` | Admin sees Aadhaar/DL fields; non-admin sees them stripped. Deactivated drivers hidden from non-owner/admin. |
| `GET /agents`, `GET /agents/:id` | Admin sees Aadhaar; non-admin doesn't. |
| `GET /reviews` | Anon sees `is_published=true` only; authed user sees own; admin sees flagged + unpublished. |

**Fix options (pick one, write it in Phase 3 plan):**
1. **Split the routes** — e.g. `/admin/drivers/:id` returns the full payload (admin Bearer), `/drivers/:id` returns the public payload. Cache `/drivers/:id` at CDN, never cache `/admin/*` reads at CDN. **Recommended** — explicit and unambiguous.
2. Send `Cache-Control: private, no-store` whenever an `Authorization` header is present, `public, max-age=N` only when it isn't. Works but fragile.
3. Use `Vary: Authorization` — unreliable in practice (Cloudflare treats any non-empty header as a cache-buster).

---

## 5. N+1 audit — corrected from the plan

The plan flagged `buildVerification()` in `/drivers` and `/agents` as a list-endpoint N+1. **The audit shows that's not actually a list-level problem** — `buildVerification()` is **only called for privileged views** (`/drivers/me`, `/agents/me`, and admin detail routes), never on the list endpoint. So:

- ✅ `GET /drivers` list — clean, single query.
- ✅ `GET /agents` list — clean, single query.
- ⚠️ `GET /drivers/me`, `GET /agents/me` — each call adds one `vehicles` query + one `video_verifications` query. **Per-request, not per-row.** Not an N+1, but it's three round-trips that could be one CTE. Low priority — these are `/me`-style endpoints called once per page load.
- ✅ Every other endpoint — no N+1 detected.

**Action:** drop the "fix N+1 before caching" task from Phase 1. The actual TODO is: when we cache `/drivers/me`, the cache wraps all three queries — that's the win.

**Indirectly relevant:** `eligibilityFor(db, vehicles)` in `/vehicles` re-fetches `app_settings.min_vehicle_year` on every call. Cache `app_settings` in memory (15 min TTL) and this disappears.

---

## 6. Unused indexes — don't drop yet

`pg_stat_user_indexes` shows ~20 unused indexes (incl. `idx_drivers_name_trgm`, `idx_cities_name_trgm`, `idx_vehicle_models_make`, `idx_trips_to_city`, etc.). **These are not actually unused** — they were added in recent migrations, and the `pg_stat_*` counters reset on Postgres restart. The project is new and traffic is low; the search-by-name UI just hasn't been exercised in the metrics window.

**Action:** revisit this list 30 days post-launch. If `idx_drivers_name_trgm` and `idx_cities_name_trgm` are still at `idx_scan = 0` with real user traffic, then drop.

---

## 7. The 5 endpoints we should wire `withCache` to first

In order of expected impact (`p95 × calls × cacheability`):

| Rank | Endpoint | Tier | TTL | CDN? | Why |
|--:|---|---|--:|---|---|
| 1 | `GET /admin/*` (the 9 lookup lists + app-settings) | MASTER | 900 s | ✅ | Highest p95×calls of any safely-cacheable read. Reference data is by definition stable. |
| 2 | `GET /vacancies?current_city_id=X` | LIVE | 60 s | ✅ | High volume, public, CDN-safe, no PII. |
| 3 | `GET /drivers/me` + `GET /agents/me` + `GET /auth/me` | PER_USER_PRIVATE | 60 s | ❌ private | Hit on every page load. Server-side keyed by `user_id`. |
| 4 | `GET /trips?status=open&from_city=X&to_city=Y` | LIVE | 60 s | ❌ varies-by-viewer | Highest call volume overall. Must cache server-side per `(filters, viewerRole)` — not CDN. |
| 5 | `GET /analytics/admin` | MASTER-ish | 300 s | ❌ admin-only | Compute-heavy aggregation, infrequent change. Big win per call. |

**Phase 1 success criterion:** these five endpoints' p95 cache-hit latency < 50 ms (target: 10–20 ms). Cold-miss latency unchanged. Hit rate steady-state > 70 %.

---

## 8. What we're parking (and why)

- **Cold-start mitigation** — Deno Deploy cold starts cause the 8–26 s outliers seen on May 12 17:22. Solved by Supabase function warm-keeping, not caching. Park for now.
- **Mutation latency** (POST/PATCH at 1100–1400 ms avg) — separate work: review insert/update transactions, the post-write `select` for response, RLS overhead.
- **Dropping unused indexes** — re-evaluate in 30 days.
- **Materialised views** — not adopting (see plan §"What we're explicitly NOT doing").
- **Redis/Upstash** — not adopting yet; the Postgres `api_cache` table is sufficient at current scale.

---

## 9. How this doc was generated (run these to refresh)

```bash
# Per-endpoint 2xx-only rollup
node scripts/db.cjs "select endpoint, method, count(*) as n, round(avg(duration_ms)) as avg_ms, percentile_cont(0.95) within group (order by duration_ms) as p95 from public.api_metrics where created_at > now() - interval '168 hours' and status < 400 group by endpoint, method order by n desc"

# Whole-endpoint summary (incl. errors)
node scripts/db.cjs "select public.get_api_metrics_summary(168) as s"

# Slowest individual requests
node scripts/db.cjs "select endpoint, method, status, duration_ms, created_at from public.api_metrics where created_at > now() - interval '168 hours' and duration_ms > 1500 order by duration_ms desc limit 25"

# Error breakdown
node scripts/db.cjs "select endpoint, method, status, count(*) as n from public.api_metrics where created_at > now() - interval '168 hours' and status >= 400 group by endpoint, method, status order by n desc"

# DB cache hit
node scripts/db.cjs "select round(sum(heap_blks_hit) * 100.0 / nullif(sum(heap_blks_hit) + sum(heap_blks_read), 0), 2) as table_cache_hit_pct, round(sum(idx_blks_hit) * 100.0 / nullif(sum(idx_blks_hit) + sum(idx_blks_read), 0), 2) as index_cache_hit_pct from pg_statio_user_tables"

# Slow queries (Supabase introspection dominates; app queries don't appear)
node scripts/db.cjs "select substring(query, 1, 100) as q, calls, round(total_exec_time::numeric) as total_ms, round(mean_exec_time::numeric) as mean_ms from pg_stat_statements where query not ilike '%pg_stat%' and query not ilike '%pg_catalog%' order by total_exec_time desc limit 15"

# Housekeeping
node scripts/db.cjs "select c.relname, s.n_live_tup as rows, pg_size_pretty(pg_total_relation_size(c.oid)) as size from pg_class c join pg_namespace n on n.oid=c.relnamespace left join pg_stat_user_tables s on s.relid = c.oid where n.nspname='public' and c.relkind='r' order by pg_total_relation_size(c.oid) desc limit 15"

# Cron jobs
node scripts/db.cjs "select jobid, jobname, schedule, active from cron.job order by jobid"
```

---

## 10. Next — Phase 1 entry checklist

Before writing a line of cache code, confirm:

- [x] **Phase 0 baseline captured** (this doc).
- [ ] Plan ranked endpoints (above §7) reviewed — any objection to that ordering?
- [ ] Cloudflare PII trap fix decided — §4 option 1 (route split) recommended; needs sign-off.
- [ ] Migration number reserved for `api_cache` table (next is `0NN` — confirm in `supabase/migrations/`).
- [ ] Decide where `withCache` lives — `supabase/functions/_shared/withCache.ts` next to existing `withTiming`.

Once those four are ticked, Phase 1 (server-side primitives) starts.
