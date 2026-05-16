# Cloudflare Cache Rules — TripKing API (Phase 3)

**Zone:** `tripkingapp.com` (Free plan, set up 2026-05-13)
**Proxied origin:** `api.tripkingapp.com` → `saxcbebqxgatiktsebxw.supabase.co`
**Current state:** orange-cloud, **NO Cache Rule enabled yet** — Cloudflare is TLS + DDoS shield only.

This doc is the policy the Cache Rules must implement. Two read-only constraints govern
everything below; **do not deviate without re-reading [CACHE_BASELINE.md](CACHE_BASELINE.md) §4**.

---

## The two hard rules

1. **Origin says `private` → bypass Cloudflare.** Every cached endpoint already emits the
   right `Cache-Control` (Phase 2, commit 4a56b2a). Cloudflare must respect `private` and
   **not** serve it from the shared cache, otherwise we leak personalised payloads.
2. **Authorization in the cache key, or split routes.** Default Cloudflare keys ignore
   `Authorization`. Any endpoint where the response payload *can* vary by auth header must
   either:
   - Use a Cache Rule that adds `Authorization` to the cache key (Cloudflare → Caching →
     Cache Rules → "Custom cache key" → headers → `Authorization`), or
   - Be split into two distinct routes (`/admin/...` for admin-only payload, `/...` for the
     public one). **Prefer route-split.** It's unambiguous; it survives Cloudflare config
     changes.

---

## Per-endpoint policy

### Cache (public, CDN-friendly)

| Endpoint                            | Match                                      | TTL  | Notes |
|-------------------------------------|--------------------------------------------|------|-------|
| `GET /functions/v1/admin/<list>`    | path starts with `/functions/v1/admin/`   | 900s | Reference data; identical for everyone. **Exclude** `/admin/places`, `/admin/users` (admin-only) — those should match a "no cache" rule first. |
| `GET /functions/v1/admin/app-settings` | exact                                   | 900s | Singleton. |
| `GET /functions/v1/vacancies` (list) | exact                                    | 30s  | LIVE board. Public, byte-identical for all callers. |
| `GET /functions/v1/vacancies/<id>`  | path                                       | 30s  | Single vacancy. |
| `GET /functions/v1/places/search`   | path + query                               | 300s | Already cached at origin (`okCached`); CDN echoes that. |

### Bypass (private / per-user / per-viewer)

| Endpoint                            | Match                                      | Reason |
|-------------------------------------|--------------------------------------------|--------|
| `GET /functions/v1/trips`            | any path under `/trips`                   | Varies-by-viewer (PII redaction). |
| `GET /functions/v1/drivers/*`        | any                                       | `/me` is per-user; `/<id>` may include admin-only fields. |
| `GET /functions/v1/agents/*`         | any                                       | Same as drivers. |
| `GET /functions/v1/analytics/*`      | any                                       | Admin-only or per-user. |
| `GET /functions/v1/auth/*`           | any                                       | `/me` is per-user; `/request-otp` consumes rate limits — must hit origin. |
| `GET /functions/v1/notifications/*`  | any                                       | Personal inbox. |
| `GET /functions/v1/alerts/*`         | any                                       | Personal saved searches. |
| `GET /functions/v1/reviews*`         | any                                       | Visibility varies by viewer. |
| `GET /functions/v1/vehicles/*`       | any                                       | Owner/admin-only fields when privileged. |
| `GET /functions/v1/video-verifications/*` | any                                  | KYC data. |

### Never cache

- All `POST`, `PATCH`, `PUT`, `DELETE` requests on any path.
- Anything with a `Set-Cookie` response header (Cloudflare strips this if it caches; we'd
  rather it never tries).
- `/auth/*` of any verb (rate-limit-protected; cached responses skip the limiter).

---

## Suggested Cache Rule order (top → bottom)

Cloudflare evaluates rules in order; first match wins.

1. **Bypass auth + admin paths.** Match: URI path is one of `/functions/v1/auth/*`,
   `/functions/v1/admin/places*`, `/functions/v1/admin/users*`. Action: Bypass cache.
2. **Cache public reference data.** Match: method is `GET` AND path matches
   `/functions/v1/admin/*` (after rule 1 strips the admin-only sub-paths) OR
   `/functions/v1/admin/app-settings`. Action: Eligible for cache; TTL 900s; respect origin
   Cache-Control.
3. **Cache vacancies + places.** Match: `GET /functions/v1/vacancies*` OR
   `GET /functions/v1/places/search*`. Action: Eligible; respect origin Cache-Control.
4. **Bypass everything else under `/functions/v1/`.** Match: everything else. Action:
   Bypass cache.

If we want a single belt-and-braces rule, add a final "no cache" catch-all so accidental
new endpoints don't get cached by default.

---

## Headers Cloudflare must pass through

- `X-Cache` (origin → client) — already set by `tagCacheHit` for observability; do not strip.
- `ETag` / `If-None-Match` — Phase 2C will wire these; CF should respect them.
- `Authorization` (client → origin) — required for every non-public endpoint to work.
- `cf-cache-status` (CF → client) — Cloudflare adds this automatically; the client just
  reads it. (Phase 4 will combine the two values into `api_metrics.cache_status`.)

---

## Purge

Cache invalidation goes via the Cloudflare REST API (see `scripts/cloudflare-purge.cjs`):

```
POST https://api.cloudflare.com/client/v4/zones/<ZONE_ID>/purge_cache
Authorization: Bearer <CLOUDFLARE_PURGE_TOKEN>
Content-Type: application/json
{ "files": ["https://api.tripkingapp.com/functions/v1/admin/car-types", ...] }
```

Or purge by tag / prefix once we're on a paid plan; on Free, list URLs explicitly.

**Secrets to set as Supabase function secrets** (not yet — for Phase 4):
- `CLOUDFLARE_PURGE_TOKEN` (scope: Zone.Cache Purge only)
- `CLOUDFLARE_ZONE_ID`

Then mutation handlers (admin writes, trip writes, vacancy writes) will call
`purgeCloudflare(urls)` next to their `cacheDeletePattern(...)` / `sharedCacheInvalidateType(...)`
calls.

---

## When to actually enable the rules

Pre-flight checklist (do in this order):

1. ✅ Origin emits `Cache-Control` on every cached endpoint (Phase 2, done).
2. ✅ Origin emits `X-Cache: memory|shared|miss` (Phase 1, done).
3. ⬜ `api_metrics.cache_status` column lands (Phase 4).
4. ⬜ Vercel `VITE_API_BASE_URL` flipped to `https://api.tripkingapp.com/functions/v1`,
   smoke tests re-run against it, deploy is healthy.
5. ⬜ Cloudflare → SSL/TLS → **Full (strict)** confirmed.
6. ⬜ Add rules 1–4 above; start with **TTL 30s** on everything to bound blast radius.
7. ⬜ Watch `api_metrics` for 24 h. Confirm `cf_hit` counts climb on the public endpoints
   and stay zero on the bypassed ones.
8. ⬜ Bump TTLs to the per-endpoint values in §"Per-endpoint policy" above.

---

## Smoke tests after enabling

```
# Same URL, two callers — anon vs authed — must yield different payloads.
curl -s https://api.tripkingapp.com/functions/v1/admin/car-types        | jq '.success'
curl -s -H "Authorization: Bearer $TOK" \
       https://api.tripkingapp.com/functions/v1/drivers/me              | jq '.data.id'
curl -sI https://api.tripkingapp.com/functions/v1/admin/car-types       | grep -i 'cf-cache-status\|x-cache'
curl -sI -H "Authorization: Bearer $TOK" \
       https://api.tripkingapp.com/functions/v1/trips?status=open      | grep -i 'cf-cache-status\|cache-control'
```

Expected:
- `/admin/car-types` → `cf-cache-status: HIT` on the 2nd call, `Cache-Control: public, max-age=900, …`
- `/drivers/me` → `cf-cache-status: BYPASS` or `DYNAMIC`, `Cache-Control: private, …`
- `/trips?status=open` → `cf-cache-status: BYPASS`, `Cache-Control: private, …`

If a private response ever comes back with `cf-cache-status: HIT`, **roll back the Cache Rule
immediately** — the PII trap fired.

---

## Apex zone — `tripkingapp.com` (browser app)

> **Sibling to the API policy above.** The API rules govern `api.tripkingapp.com` (orange-cloud, Supabase origin). This section governs the apex + `www` (currently **grey-cloud, Vercel origin**). They share the same Cloudflare zone but otherwise don't interact.
>
> **Trigger:** 2026-05-16 — a deploy left a wedged service-worker on a user's browser. The SW served an old `index.html` whose vendor-chunk hashes (`vendor-posthog-BgFCir7_.js` etc.) no longer existed on Vercel → MIME-type errors on 6 chunks. The fix was client-side (Unregister SW + clear site data), but the incident exposed that we have no written cache contract for the apex. This section is that contract.

### Current state

- **Apex + `www`:** grey-cloud (DNS-only). All caching is Vercel + browser + PWA service worker. Cloudflare isn't involved.
- **Vercel edge:** auto-serves long `Cache-Control` on hashed `/assets/*`, short TTL on `/index.html`.
- **PWA:** `vite-plugin-pwa`, `registerType: 'autoUpdate'`, `skipWaiting`, `clientsClaim`. The SW precaches `index.html` + the assets manifest at install. **The SW is the most likely source of "stale page" incidents** — when it gets wedged, Cloudflare can't help (grey-cloud).

The grey-cloud-everywhere posture is fine for traffic levels today. Going orange + adding Cache Rules buys us:
- a single chokepoint where we can purge stale content during an incident,
- a short edge TTL on `index.html` that bounds SW-wedge blast radius,
- explicit control over what gets cached and for how long (vs trusting Vercel's defaults).

### Recommended Cache Rules — order matters

In Cloudflare → Caching → Cache Rules, create in this order (first match wins):

#### Rule A — service worker + manifest → **bypass cache**

| Field | Value |
|---|---|
| **When** | URI path matches `/sw.js` OR `/workbox-*.js` OR `/manifest.json` OR `/registerSW.js` |
| **Then** | Bypass cache |
| **Browser TTL** | Override origin → No-store |

These MUST always be fresh — they are the update channel. If they get cached at the edge or in the browser, you cannot push a new SW; the next user is stuck on the old one forever. **This is the exact failure mode the 2026-05-16 incident hit.**

#### Rule B — `/assets/*` → cache forever

| Field | Value |
|---|---|
| **When** | URI path starts with `/assets/` |
| **Then** | Eligible for cache |
| **Edge TTL** | Override origin → **1 year** |
| **Browser TTL** | Override origin → **1 year** |
| **Cache-Control header** | Add `public, max-age=31536000, immutable` |

Hashed filenames are content-addressable — a different file gets a different name, so caching forever is safe. `immutable` tells the browser not to revalidate.

#### Rule C — `/` and `/index.html` → short edge TTL, no browser cache

| Field | Value |
|---|---|
| **When** | URI path is `/` OR ends with `/index.html` |
| **Then** | Eligible for cache |
| **Edge TTL** | Override origin → **60 seconds** |
| **Browser TTL** | Override origin → No-store |
| **Cache-Control header** | Add `public, max-age=0, must-revalidate` |

60s at the edge lets a deploy reach all users within a minute without thundering-herd against Vercel. No browser cache means the PWA's SW will re-check `index.html` on every navigation (cheap because the edge serves it).

#### Rule D — fall through

Everything else (favicon, robots.txt, anything else under apex) passes through unmodified. No rule needed.

### Apex purge — what to purge on each Vercel deploy

When Vercel finishes a build:

```bash
node scripts/cloudflare-purge.cjs \
  https://tripkingapp.com/ \
  https://tripkingapp.com/index.html \
  https://tripkingapp.com/sw.js \
  https://tripkingapp.com/manifest.json \
  https://tripkingapp.com/registerSW.js
# Optional but cheap: also purge any /workbox-*.js — list filenames at the time of deploy
```

**`/assets/*` does NOT need purging** — content hashes change with every build, so old hashed files just stop being referenced. They expire from cache naturally at their 1-year TTL but never serve as a stale answer to the new HTML.

Wire this into Vercel's "Deployment ready" hook — or, since the post-deploy hook is a paid feature, run it manually from a deploy script (`npm run deploy:purge`) after merging to `main`.

### Rollout checklist (apex)

1. Add the 4 rules in Cloudflare dashboard with **toggle OFF** on each.
2. Flip apex + `www` DNS records to orange-cloud.
3. `curl -sI https://tripkingapp.com/` — confirm `cf-cache-status` header appears. Expect `MISS` first, `HIT` on a 2nd call within 60s.
4. Toggle Rule A (SW bypass) **on**. Open in a fresh incognito → DevTools → Application → confirm SW registers and serves correctly.
5. Toggle Rule B (`/assets/*` cache-forever) **on**. `curl -sI https://tripkingapp.com/assets/<a current chunk>` → expect `cache-control: public, max-age=31536000, immutable`.
6. Toggle Rule C (`index.html` short TTL) **on**. Deploy a no-op change to TripKing main → wait 60s + manual purge → confirm new build reaches a fresh browser.
7. Update memory file `project-cloudflare-tripkingapp-com.md` from "No Cache Rule yet" → "Apex Cache Rules live (A–D)".

### What we are NOT doing on the apex

- **Caching `/passenger/{otp}` deep-links.** The OTP is in the path; CF would happily cache different OTPs separately, but a stale cache could leak a completed-trip card to someone who already used the link. Leave uncached (no rule matches it → falls through to "not eligible for cache" since the path doesn't start with `/assets/`).
- **Caching anything served with `Set-Cookie` or `Authorization`.** CF respects `Cache-Control: private` by default; the rules above are explicit only on what to cache.
- **Cache-Reserve / Tiered Cache / Workers.** Not needed at our scale.

### Why grey-cloud is still a defensible default

If we delay flipping to orange:
- The 2026-05-16 incident is a once-off SW wedge, fixable client-side in 30 seconds.
- Vercel's caching is already good (`/assets/*` is `immutable`, `index.html` is short TTL).
- Grey-cloud means Cloudflare can't break anything we don't control.

Going orange is **proactive hygiene**, not an urgent fix. The trigger to flip is the moment we have:
- multiple users hitting wedged SWs in a single deploy (real incident, not just a developer's stuck tab), or
- a need to globally purge a piece of content during a security/legal event.

Until then, the API rules above ship first; the apex rules sit in this doc as the executable plan.
