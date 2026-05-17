# Cloudflare cache rule — the 5-minute setup

> Wires Cloudflare's edge cache for the public `GET` endpoints on `api.tripkingapp.com`. Eliminates 50-100ms of origin latency per request for cached responses. Honours the `Cache-Control` headers the edge functions already emit (`public, max-age=N, s-maxage=N, stale-while-revalidate=N` via [`_shared/httpCache.ts`](../supabase/functions/_shared/httpCache.ts)). Private responses bypass automatically because their header is `private, ...`.

## Why this couldn't ship by code

The `CLOUDFLARE_PURGE_TOKEN` we have only grants `Zone.Cache Purge`. Creating a cache rule needs `Zone.Cache Rules > Edit`, which is a separate token. You need to either:
- Add cache-rule-edit permission to the existing token, OR
- Click through the dashboard once (5 minutes).

The dashboard path is faster and the rule rarely changes — recommended.

## Step 1 — Create the cache rule

1. Open https://dash.cloudflare.com/ → **tripkingapp.com** zone → **Caching** → **Cache Rules** → **Create rule**.
2. Fill in:
   - **Rule name:** `cache-public-api-reads`
   - **If incoming requests match...** → use the "Custom filter expression":
     ```
     (http.host eq "api.tripkingapp.com" and http.request.method eq "GET")
     ```
   - **Then...**
     - **Cache eligibility:** `Eligible for cache`
     - **Edge TTL:** `Respect origin TTL` (Cloudflare will honour the `s-maxage` we send)
     - **Browser TTL:** `Respect origin TTL`
     - **Cache key:**
       - Include query string: **All**
       - Exclude cookies (default)
       - Sort query string parameters: **On** (matters — our `vacanciesListKey` already sorts; this aligns CF's key with ours)
3. Save + deploy.

That's it. The rule is no-op for any response with `Cache-Control: private, ...` — Cloudflare's "respect origin TTL" mode treats `private` as `no-cache` automatically.

## Step 2 — Verify (immediately)

```bash
# First request — expect MISS (or DYNAMIC if no admin page traffic has warmed the cache yet)
curl -sI 'https://api.tripkingapp.com/admin/cities' \
  -H 'X-API-Key: <VITE_TRIPKING_API_KEY value from .env.development>' \
  | grep -E 'cf-cache-status|cache-control|x-cache'

# Run it again within 60s — expect HIT
curl -sI 'https://api.tripkingapp.com/admin/cities' \
  -H 'X-API-Key: <VITE_TRIPKING_API_KEY value from .env.development>' \
  | grep cf-cache-status
```

Expected headers:
```
cache-control: public, max-age=900, s-maxage=900, stale-while-revalidate=900
cf-cache-status: HIT       # after the warmup request
x-cache: shared            # from our origin (would have been a memory or shared hit)
```

If `cf-cache-status: DYNAMIC` persists, Cloudflare is bypassing — usually because the response `Cache-Control` contains `private` or `no-cache`. Check the origin response with `-I` direct to `…supabase.co/functions/v1/admin/cities`.

## Step 3 — Confirm PII doesn't leak

The PII trap is real: an authed `GET /trips/:id` response (which contains `posted_by_phone` for the assigned driver) MUST NOT be cached at the CDN. We rely on the origin sending `Cache-Control: private` for those. Verify:

```bash
# An authed trip detail — expect cf-cache-status: BYPASS
TOKEN=<a valid Bearer for a logged-in test user>
curl -sI 'https://api.tripkingapp.com/trips/<a-real-trip-uuid>' \
  -H "Authorization: Bearer $TOKEN" \
  | grep -E 'cache-control|cf-cache-status'

# Expected:
#   cache-control: private, ...
#   cf-cache-status: BYPASS
```

If `cf-cache-status: HIT` shows up on an authed endpoint, that's a P0 — disable the rule and grep the function for the cache-header path.

## Step 4 — Monitor

The existing `cron-qase-poll` cron + `api_metrics` already log every request. After 24 hours:

```sql
-- run via node scripts/db.cjs
SELECT endpoint,
       COUNT(*) FILTER (WHERE cache_status='shared') AS origin_shared,
       COUNT(*) FILTER (WHERE cache_status='miss')   AS origin_miss,
       COUNT(*)                                       AS total
FROM api_metrics
WHERE endpoint IN ('admin','trips','vacancies','alerts')
  AND created_at > now() - interval '24 hours'
GROUP BY endpoint;
```

Compare to the pre-rule baseline (see `/dbperf` from 2026-05-17). Even though we won't directly see CF hits in `api_metrics` (those never reach the origin), origin **miss** count should drop sharply on the same endpoint volume as CF starts serving from the edge.

To see real CF hit ratio, use Cloudflare's Analytics → Cache view on the zone.

## Rollback

One click — Cache Rules → toggle the rule **Off**. Origin behaviour is unchanged because the edge functions never relied on the CDN; this rule is purely additive.

## Out of scope (deliberately)

- **Argo Smart Routing** — separate paid feature, not needed at current traffic volume.
- **Tiered Cache** — same — wait until $25/mo CF spend is well-justified.
- **Cache Reserve** — only relevant for VERY large cacheable objects, not our case.
