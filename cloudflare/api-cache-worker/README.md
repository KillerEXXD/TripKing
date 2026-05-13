# tripking-api-proxy — Cloudflare Worker

This Worker fronts `api.tripkingapp.com` and proxies to the Supabase Edge Functions at
`saxcbebqxgatiktsebxw.supabase.co`. It exists to solve two problems at once:

1. **CNAME-cross-user (Cloudflare error 1014).** Supabase's edge runs on Cloudflare under
   their account; a direct CNAME from this zone to a Supabase project is rejected by
   Cloudflare's shared edge with a 403. The Worker traps the request on our zone before
   the CNAME hop and re-fetches Supabase server-side with the correct Host.
2. **Edge caching.** Phase 3 of the caching strategy (see `docs/CACHE_BASELINE.md` and
   `docs/CLOUDFLARE_CACHE_RULES.md`). The Worker honours the `Cache-Control` headers
   origin emits (Phase 2 commit `4a56b2a`): public responses are cached at Cloudflare's
   edge via the Cache API; anything `private` (or with an Authorization header that isn't
   the anon Bearer) is passed through.

The decision logic is pure and unit-tested in `src/__tests__/`; run from the repo root:

```
npx vitest run cloudflare/api-cache-worker/src/__tests__/
```

The pre-push Husky gate also runs them.

---

## One-time setup

1. **Install wrangler.** From this directory:
   ```
   npm install
   ```
2. **Authenticate.** `npx wrangler login` opens a browser, signs you into the Cloudflare
   account that owns `tripkingapp.com`, and stores the token in your OS keychain.
3. **Set the Supabase anon key secret.** The Worker needs it to inject `apikey` /
   `Authorization` headers for anonymous callers (Supabase's edge gateway requires them).
   Take the value from `.env.development`'s `VITE_SUPABASE_ANON_KEY` and run:
   ```
   npm run secret:set-anon
   # paste the anon key when prompted; press Enter
   ```

---

## Deploy

```
npm run deploy
```

This publishes `src/worker.js` to Cloudflare and binds the route
`api.tripkingapp.com/*` per `wrangler.toml`. Re-deploy any time `src/**` changes.

### After the first deploy: flip DNS

Workers Routes require the matching DNS record to be **proxied** (orange cloud).
Currently `api` is DNS-only (grey). In the Cloudflare dashboard:

> DNS → Records → `api` row → **Edit** → toggle **Proxy status** to **Proxied** → Save.

Within ~30 s, the route attaches and requests start flowing through the Worker.

---

## Verify

```
curl -sI https://api.tripkingapp.com/functions/v1/admin/car-types
# Expect: 200, server: cloudflare, X-Cache-Tier: worker:MISS (first call) or worker:HIT (subsequent)
# Cache-Control echoed from origin (public, max-age=900, ...)

curl -sI -H "Authorization: Bearer <user-jwt>" https://api.tripkingapp.com/functions/v1/drivers/me
# Expect: 200, X-Cache-Tier: worker:BYPASS, Cache-Control: private, ...
```

Then re-run the full smoke suite against the new base:

```
ADMIN_API_BASE=https://api.tripkingapp.com/functions/v1 \
  node scripts/test-admin-config.cjs
# (repeat for each scripts/test-*.cjs)
```

---

## Tail logs

```
npm run tail
```

Shows every request the Worker handles, with X-Cache-Tier and the HTTP status.
Useful for confirming hit rate after Cache Rules go live.

---

## How invalidation works

`scripts/cloudflare-purge.cjs` (already in the repo root) hits
`POST /zones/<id>/purge_cache` with `CLOUDFLARE_PURGE_TOKEN`. That purges responses from
the Cache API too — `caches.default` is the same edge cache. When Phase-4 mutation
hooks fire (admin writes, trip writes, etc.), they call this script with the URL list.

---

## Troubleshooting

- **Still getting 403 `Error 1014`?** The `api` row in DNS is still grey-cloud. Flip
  to orange. The Worker route doesn't attach without it.
- **502 PROXY_ERROR JSON envelope.** The Worker reached the catch block — origin is
  unreachable, or the request body couldn't be forwarded. `wrangler tail` to see the
  stack. Most often: a deploy in progress on Supabase.
- **Cache hits aren't showing.** Cache API only stores when origin emits
  `Cache-Control: public, max-age=…`. The 5 endpoints wired in Phase 2 do; everything
  else stays at `worker:DYNAMIC` and is fetched fresh every time. That's expected.
- **CORS preflight failing.** Compare `Access-Control-Allow-Headers` here vs
  `supabase/functions/_shared/cors.ts`. They must stay in sync — keep `apikey`,
  `authorization`, `content-type`, `x-client-info` in both lists.
