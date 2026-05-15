# RFC — Cloudflare Cache Rule for `api.tripkingapp.com`

**Status:** draft — awaiting sign-off
**Tracks:** item 2 of [issue #114](https://github.com/KillerEXXD/TripKing/issues/114)
**Depends on:** PR #126 (PII / public-scope build-time gate) — already merged

---

## Why

`api.tripkingapp.com` is orange-clouded but has **no Cache Rule**. Cloudflare today:

- ✅ Honors `Cache-Control: max-age=N` from the origin.
- ❌ Ignores `s-maxage` and `stale-while-revalidate` (we send both in [`_shared/httpCache.ts`](../supabase/functions/_shared/httpCache.ts) — decorative without a Rule).
- ❌ Bypasses everything carrying `Authorization:` or `Set-Cookie:` (correct default — most of our routes are authed).

So even the few routes we explicitly mark `scope: 'public'` (vacancies list/item, admin lookups) are cached only as long as the short origin `max-age`, and the SWR window we asked for never kicks in. **Item 1 of #114 (shared-tier promotion across `/trips`, `/vacancies`, etc.) lifts hit rate inside Supabase. This RFC is the next ceiling — push the cache out to the CF edge for routes that are genuinely public.**

## Goals & non-goals

**Goals**
- Define which routes are CF-cacheable, with explicit Edge TTL and SWR.
- Make the rule auditable: every route is classified `public-safe` / `authed-private` / `credential-based`.
- Roll out safely — staged, with rollback steps that don't require code changes.

**Non-goals**
- Caching authed routes at the edge (Cloudflare default-bypass for `Authorization:` is correct; we keep it).
- Tiered (regional) cache, Argo, Workers, or any paid CF feature. Plain Cache Rule on the Free/Pro plan.

## Route inventory (the part to argue with)

Full audit lives in the [PR #114 audit body](https://github.com/KillerEXXD/TripKing/issues/114) — abridged classification here.

### Class A — **public-safe**, propose adding to the CF Cache Rule

These are anonymous reads, no per-user PII, no `Authorization:` header. Already gated by [`scripts/check-pii-public-scope.cjs`](../scripts/check-pii-public-scope.cjs) (PR #126).

| Route | Origin TTL today | Proposed Edge TTL | Proposed SWR | Notes |
|---|---:|---:|---:|---|
| `GET /admin/<list>` (car-types, cities, languages, vehicle-makes, …) | 900s public | **900s** | **3600s** | Reference data; bumped by `admin:*` invalidation. Highest ROI. |
| `GET /admin/app-settings` | 900s public | **900s** | **3600s** | Singleton config. |
| `GET /vacancies` (list, with filters) | 30s public | **60s** | **300s** | Driver PII stripped via `redactDriver`. Geo cache-keys rounded to 3dp. |
| `GET /vacancies/:id` | 30s public | **60s** | **300s** | Same redaction. |
| `GET /places/search` | sends `Cache-Control: public` | **3600s** | **86400s** | Geocoded results — immutable for our purposes. |

### Class B — **public-safe but currently no `scope:'public'`**, propose promoting first

Each carries some PII in the row shape but is redacted before serialization. The promotion to `scope:'public'` is a code change in a follow-up PR, after which it joins Class A. **Not part of the initial CF Cache Rule.**

| Route | Why not yet |
|---|---|
| `GET /agents`, `GET /agents/:id` | Anonymous read but KYC fields revealed only to owner/admin. Need a redaction audit. |
| `GET /drivers`, `GET /drivers/:id` | Same — name/phone/photo stripped for anon, but the redaction lives in the row builder, not a wrapper. |
| `GET /vehicles`, `GET /vehicles/:id` | Anonymous; carry derived `eligibility_status`. Probably safe but unaudited. |

### Class C — **authed-private**, bypass at CF (default behavior, no rule change needed)

Everything carrying `Authorization:` already bypasses CF. Listed for completeness.

- `GET /me`, `GET /agents/me`, `GET /drivers/me`
- `GET /alerts`, `GET /alerts/:id`
- `GET /notifications`
- `GET /trips`, `GET /trips/:id`, `GET /trips/applied`, `GET /trips/:id/applicants`
- `GET /reviews`, `GET /reviews/:id` (visibility-OR includes own/admin)
- `GET /analytics/*`
- `GET /video-verifications/*`
- `GET /bug-reports/*`
- `GET /admin/users`, `GET /admin/users/:id`

### Class D — **credential-based**, explicit bypass

- `GET /trips/by-otp/:otp` — the OTP IS the credential; caching would let one passenger see another's trip if the cache key collided. **Explicit `Cache-Bypass` in the rule.**

## Proposed Cache Rule (single rule, ordered top→bottom)

```
# Rule 1 — explicit bypass for OTP-credentialed reads
IF  (http.request.uri.path matches "^/functions/v1/trips/by-otp/")
THEN Cache eligibility: Bypass cache

# Rule 2 — explicit bypass for ANY request carrying Authorization (defensive; CF default already does this)
IF  (any(http.request.headers["authorization"][*] != ""))
THEN Cache eligibility: Bypass cache

# Rule 3 — cache the public-safe Class A routes
IF  (http.request.method eq "GET"
     and (
       http.request.uri.path matches "^/functions/v1/admin/(car-types|fuel-types|vehicle-makes|vehicle-models|seat-options|cities|languages|review-tags|cancel-reasons|app-settings|places)(/|\?|$)"
       or http.request.uri.path matches "^/functions/v1/vacancies(/[a-f0-9-]+)?(\?|$)"
       or http.request.uri.path eq "/functions/v1/places/search"
     ))
THEN
  Cache eligibility: Eligible
  Edge TTL: respect origin Cache-Control max-age, but cap at 3600s for /admin/* and 60s for /vacancies and 3600s for /places/search
  Browser TTL: respect origin
  Cache key: include query string (varies per filter combo)
  Stale-while-revalidate: 300s for /vacancies, 3600s for /admin/*, 86400s for /places/search
```

(Exact UI clicks on the CF dashboard: *Rules → Cache Rules → Create rule*. Field mapping documented in the rollout plan below.)

## Risks

1. **Filter-combo cache key explosion on `/vacancies`.** Geo coords are already rounded to 3dp (≈110 m) in [`vacancies/index.ts`](../supabase/functions/vacancies/index.ts), capping unique keys. Acceptable.
2. **A future PR adds a public-scoped route that leaks PII.** Mitigated by [`scripts/check-pii-public-scope.cjs`](../scripts/check-pii-public-scope.cjs) — pre-push gate fails the build.
3. **Stale admin lookup data after a `PATCH /admin/<list>/...`.** The 900s edge TTL is the floor. We already call `cloudflarePurge` on admin writes (see `_shared/cloudflarePurge.ts`); after this rule lands we audit the purge URL list to make sure all 9 admin lists are covered. **Open action — verify before flip.**
4. **`Vary: Accept-Encoding` interplay.** CF normalises Accept-Encoding; should be a non-issue. Sanity-check with `curl -H 'Accept-Encoding: gzip'` vs `identity` post-rollout.

## Rollout

Sequence:
1. **(Now)** This RFC merged — design recorded.
2. **(Operator step — dashboard)** Apply Rule 1 (`by-otp` bypass) first, alone. Lowest risk, no behavior change. Confirm `/trips/by-otp/...` still returns fresh data.
3. **(Operator step)** Apply Rule 2 (defensive `Authorization` bypass).
4. **(Operator step)** Apply Rule 3 limited to `/admin/<list>` and `/admin/app-settings` only. Watch CF cache hit metrics for 24h.
5. **(Operator step)** Extend Rule 3 to `/vacancies` and `/places/search`.
6. **(Code follow-up)** Audit and promote Class B routes (agents/drivers/vehicles) one by one — each is a separate PR that switches `scope:'private'` → `scope:'public'`, passes the PII gate, then operator extends the CF rule.

Each step is independently reversible by disabling the rule in the CF dashboard. No code rollback needed at any step.

## Validation

After each rollout step:

```bash
# Confirm public route is edge-cached:
curl -sD- "https://api.tripkingapp.com/functions/v1/admin/cities" | grep -i 'cf-cache-status\|cache-control\|age:'
# Expect: cf-cache-status: HIT (after 2nd request)

# Confirm authed route bypasses (Class C):
curl -sD- "https://api.tripkingapp.com/functions/v1/notifications" -H "Authorization: Bearer ..." | grep -i cf-cache-status
# Expect: cf-cache-status: BYPASS or DYNAMIC

# Confirm OTP bypass (Rule 1):
curl -sD- "https://api.tripkingapp.com/functions/v1/trips/by-otp/12345" | grep -i cf-cache-status
# Expect: cf-cache-status: BYPASS
```

Also re-run the existing measurement query 24h after step 4 to confirm the shared-tier hit rate (item 1 of #114) doesn't degrade — the inner cache should still serve isolates that miss the edge:

```bash
node scripts/db.cjs "SELECT cache_status, COUNT(*) FROM api_metrics WHERE endpoint IN ('admin','vacancies','places') AND created_at > now() - interval '24 hours' GROUP BY endpoint, cache_status"
```

## Open questions for sign-off

1. Are the proposed Edge TTLs (`900s` admin, `60s` vacancies, `3600s` places) acceptable? Conservative defaults — could push higher once stable.
2. Do we want to ship the Class B audit + promotion as part of this work, or split as a follow-up RFC? Default plan: follow-up.
3. CF Pro lets us purge-by-prefix and use Tiered Cache. Worth upgrading or stay on Free? Default plan: Free; revisit if hit rate plateaus low.

## Approval

- [ ] Cache TTLs OK
- [ ] Class A route list complete
- [ ] Rollout sequence acceptable
- [ ] Owner confirmed for the dashboard steps

Once these are ticked, implementation = three operator clicks + one follow-up PR to add the `cloudflarePurge` URL audit.
