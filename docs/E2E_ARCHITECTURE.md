# E2E architecture — how the suite seeds itself and runs

> Companion to [docs/TEST_POLICY.md](TEST_POLICY.md) (the rules) and [e2e/QASE-RUNNER.md](../e2e/QASE-RUNNER.md) (the Qase reporter setup). This doc explains the **mechanics** — where the data comes from, who creates it, where it lives, who cleans it up.

## The big picture

```
┌─────────────────┐    triggers    ┌──────────────────────┐
│  /e2e (skill)   │ ──────────────▶│ e2e-qase.yml         │
│  or 02:30/14:30 │                │ (GitHub Actions)     │
│  UTC cron       │                │                      │
└─────────────────┘                └─────────┬────────────┘
                                             │
                              ┌──────────────┴───────────────┐
                              │                              │
                              ▼                              ▼
                     ┌─────────────────┐          ┌──────────────────────┐
                     │ Playwright      │  HTTP    │ Browser pages        │
                     │ APIRequestContext│ ──────▶ │ (mobile / chromium)  │
                     │ (test setup)    │          │ (assertions)         │
                     └─────────┬───────┘          └──────────┬───────────┘
                               │                             │
                               │   real REST calls           │ real REST calls
                               └─────────────┬───────────────┘
                                             ▼
                                ┌────────────────────────────┐
                                │  Deployed Supabase         │
                                │  saxcbebqxgatiktsebxw      │
                                │  • edge functions          │
                                │  • Postgres (real RLS)     │
                                └────────────────────────────┘
                                             │
                                  03:15 UTC  │ purge
                                             ▼
                                 ┌──────────────────────────┐
                                 │ pg_cron e2e_user_purge   │
                                 │ DELETE users WHERE       │
                                 │  display_name LIKE       │
                                 │  'e2e-%' AND >7d old     │
                                 └──────────────────────────┘
```

## Rule #1 — no stubs

[docs/TEST_POLICY.md](TEST_POLICY.md) §"E2E preconditions are real" bans stubbing setup. **Every actor and every row a test needs is created via real REST calls to the deployed Supabase.** The only carve-out is forcing a specific HTTP error response in the spec body (tagged `@stub-error`).

**Why:** stubbed setup masks backend drift — a broken migration, an RLS regression, a transform throw, an edge-fn 500. Those are exactly what E2E should catch. If our setup helpers stop working, that itself is a signal: the API contract changed.

## How a test seeds itself — `e2e/helpers-api.ts`

[e2e/helpers-api.ts](../e2e/helpers-api.ts) is the single source of truth for setup primitives. ~24 exported functions, each one a thin wrapper around a real `POST`/`PATCH` call to `https://saxcbebqxgatiktsebxw.supabase.co/functions/v1/...`.

### The seeding alphabet

| Helper | Calls | What it creates |
|---|---|---|
| `mintUser(role)` | `POST /auth/request-otp` → `POST /auth/verify-otp { otp: '12345' }` | A real `auth.users` row + access/refresh tokens. The dev `/auth` accepts OTP `12345` for any phone. |
| `mintDriver({ adminToken, kyc })` | `mintUser('driver')` → `POST /drivers` → optional `PATCH /drivers/:id/kyc` | Driver profile, optionally KYC-approved. |
| `mintAgent({ adminToken, kyc })` | `mintUser('trip_manager')` → `POST /agents` → optional `PATCH /agents/:id/kyc` | Agent profile. |
| `mintAdmin()` | `mintUser('admin')` | Self-signup as admin — works because `/auth` is a dev placeholder. |
| `mintVehicle(driverToken)` | `POST /vehicles` | Required — without one, verified-driver home redirects to "Add your vehicle". |
| `postTrip(agentToken)` | `POST /trips` | Real trip row with real city UUIDs. |
| `applyToTrip`, `assignDriver`, `acceptTrip`, `startTrip`, `completeTrip`, `cancelTrip` | the matching endpoints | Walks a trip through its lifecycle states. |
| `setKyc`, `setWalletBalance`, `drainWallet` | `PATCH /drivers/:id/kyc`, `POST /admin/wallet/set-balance` | Admin-side state nudges (require an `adminToken`). |
| `getCities`, `getCarTypes` | `GET /admin/cities`, `GET /admin/car-types` | Fetch lookup-table UUIDs at test time — no hardcoded IDs. |
| `loginAs(page, user)` | writes `tk_access_token` + `tk_refresh_token` to `localStorage` | Bypasses the OTP UI to drop the browser into an authed session. |

When adding a new helper: keep it real-API. If you find yourself reaching for `page.route` to stub a precondition, you're violating the policy — go fix the helper instead.

## The uniqueness trick (why parallel-safe)

Every test mints fresh actors. Collisions are prevented by name:

```ts
// e2e/helpers-api.ts
export function uniquePhone(): string {
  const tail = Date.now().toString().slice(-6);
  const rnd = Math.floor(100 + Math.random() * 900);
  return `+91990${tail}${rnd}`;      // +91 990 XXXXXX YYY — 9 unique tail digits
}
export function uniqueName(role: string): string {
  return `e2e-${role}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}
```

Two consequences:

1. **Parallel-safe by construction.** Two tests minting drivers at the same millisecond still get different phones (random tail). No global lock needed.
2. **Everything is taggable.** Every E2E-created row carries an `e2e-…` prefix that the purge cron can scan for.

## Cleanup — the nightly sweep

[supabase/migrations/054_e2e_user_purge.sql](../supabase/migrations/054_e2e_user_purge.sql) installs a pg_cron job:

```sql
select cron.schedule(
  'e2e_user_purge',
  '15 3 * * *',                                      -- 03:15 UTC daily
  $$select public.e2e_purge_old_users();$$
);
```

The function deletes `users WHERE display_name LIKE 'e2e-%' AND created_at < now() - interval '7 days'`. FK cascades clean up `drivers`, `agents`, `vehicles`, `trips`, `trip_acceptances`, `cash_wallets`, `notifications`, etc.

- **Why 7 days?** Long enough to inspect a failing nightly run before its rows disappear.
- **Why 03:15 UTC?** Off-peak, 45 min after the 02:30 nightly E2E run — keeps that morning's freshly-created rows alive for investigation.

## What a real spec looks like

[e2e/driver-apply.spec.ts](../e2e/driver-apply.spec.ts) — a complete test:

```ts
test('approved driver sees an open trip in the feed', async ({ page, request }) => {
  const admin  = await mintAdmin(request);
  const agent  = await mintAgent(request, { adminToken: admin.token, kyc: 'approved' });
  const { tripId } = await postTrip(request, agent.token);
  const driver = await mintDriver(request, { adminToken: admin.token, kyc: 'approved' });
  await mintVehicle(request, driver.token);
  await loginAs(page, driver);

  await page.goto('/trips');                                    // ← browser
  await expect(page.getByRole('heading', { name: /open trips/i })).toBeVisible();
  await page.goto(`/trips/${tripId}`);
  await expect(page).toHaveURL(new RegExp(`/trips/${tripId}$`));
});
```

5 real API calls minting 4 real DB rows → then 2 browser navigations asserting the UI sees them. The data exists in Supabase the same way a real user's data does — same RLS, same triggers, same edge-fn code paths.

## Two contexts per test — `request` and `page`

[playwright.config.ts](../playwright.config.ts):

- **`request` fixture** — the `APIRequestContext`. Used by helpers for setup. Pure HTTP, no browser. Fast (no rendering overhead).
- **`page` fixture** — a real browser tab (Chromium or iPhone 14 Pro Max viewport). Used by the test body to assert the UI.

The dev server (`npm run dev -- --port 4399`) is booted by the config so the browser has something to load; its `/api/*` proxy forwards to the deployed Supabase. So **two writers, one DB** — the setup helpers AND the browser both write to the same real backend.

## Where the data lives

| Tier | Project | Used for |
|---|---|---|
| Dev / QA | `saxcbebqxgatiktsebxw.supabase.co` | All E2E runs (cloud + any local dev runs) |
| Prod | (separate project, not yet provisioned) | Never touched by tests |

Today there is **one Supabase project for both dev and E2E**. The `e2e-*` naming + 7-day purge is the only thing keeping real dev data and test data from getting mixed.

The env var `PLAYWRIGHT_API_BASE` is plumbed through so we can point CI at a dedicated `tripking-e2e` project the day we provision one — code change zero, env change only.

## How the suite is triggered

| Trigger | Where | What runs |
|---|---|---|
| Schedule — `02:30 UTC` (08:00 IST) | `.github/workflows/e2e-qase.yml` | Full suite, posts to Qase, auto-creates Defects on failure |
| Schedule — `14:30 UTC` (20:00 IST) | same | Full suite again — 12h gap so regressions are caught same-day |
| `/e2e full` or `/e2e smoke` (skill) | dispatches `e2e-qase.yml` via the github MCP | Same workflow with `scope` input — `smoke` greps `J(1|3|5|6|7|13)` |
| Manual click — Actions tab | same workflow | Pick `scope` + `project` from the form |
| Per-PR | **not configured** — see "Known gaps" | — |

Failed cloud runs auto-create Qase Defects which the `webhook-qase` (or `cron-qase-poll` fallback) edge function mirrors into the `bug_reports` table → visible in `/administration/bugs` within ~5 min.

## Two known gaps

1. **No per-test isolation.** All tests write to the same DB. The `e2e-*` prefix means they don't *collide* but they do share rate-limiters and triggers. J2's intermittent flake (Supabase auth rate-limit on rapid mints) is the visible symptom.
2. **Tests can leave half-state on failure.** If `mintAgent` succeeds but `mintDriver` fails, the agent row stays until the 7-day purge. Not a correctness problem (the next test mints its own); it's a noise problem for `/administration/*` dashboards on dev.

Both have known fixes (a dedicated `tripking-e2e` Supabase project, transactional test fixtures via a Postgres SAVEPOINT helper) but nothing's blocked on them today.

## When adding a new spec

1. Mint actors via `helpers-api.ts` — never inline `page.route` for setup.
2. Add a `qase('Jxx')` annotation if it's a critical journey, then run `node scripts/qase-import-journeys.cjs` to register the case in Qase.
3. Keep the test under 60s wall clock (helpers + assertions). Specs that need 20+ API calls (referral accrual loops, e.g.) belong in `scripts/test-*.cjs` smoke tests, not Playwright.
4. If you need a state the helpers can't produce, add a new helper rather than ad-hoc HTTP from the spec body.
