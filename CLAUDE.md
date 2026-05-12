# TripKing — Claude Instructions

> ⚠️ This file references project credentials (Supabase keys, DB password). Keep the GitHub repo **private**.

**TripKing** is the production build of the outstation-cab marketplace (forked from the **DriverMahal** clickable prototype). Two-sided: **agents** (trip managers) post commercial trips; **drivers** browse, apply, get picked, run the trip with an OTP handshake, get paid. Drivers can also post a trip they can't run themselves. **Admins** manage KYC, vehicle eligibility, translations, and all platform reference data.

- **Resuming work? → `docs/CONTINUE_HERE.md`** — current state (what's done & deployed & pushed), the exact next step, the per-edge-function recipe, the screens & phases roadmap, and the known TODOs/gotchas. Keep it in sync with this file's "Delivery phases — status" section. **Running two sessions in parallel?** The remaining work splits into two conflict-free lanes — **backend** (`supabase/**` + `public/docs/openapi.*` + `scripts/` + `tests/load/`) → `docs/CONTINUE_HERE_BACKEND.md`; **frontend** (`src/**`) → `docs/CONTINUE_HERE_FRONTEND.md`. The lane-ownership table + push protocol (`git pull --rebase` before every push) live in `docs/CONTINUE_HERE.md`'s "Running two sessions in parallel" section. Stay in your lane; never edit a file outside it.
- **Engineering spec — read it first:** `docs/PLATFORM_AND_ADMIN_REQUIREMENTS.md`. It is the source of truth. This file is its distilled working-rules summary; when they disagree, the spec wins. (`docs/DRIVERMAHAL_REQUIREMENTS.md` is the older product-requirements doc; `docs/drivermahal-flows.html` is the flow map.)
- **Reference implementation:** `hudr-pwa` at `c:\Apps\hudr-workspace\hudr-pwa`. Mirror its `src/lib/api/{client,services,transforms,guards}` layer, its React Query patterns, its singleton `apiClient`, its strict transforms, its `AuthContext`, its Vite / PWA / `tsconfig` setup. When in doubt: "what does hudr-pwa do?"
- **UX spec:** the DriverMahal prototype (`c:\Apps\DriverMahal`, https://driver-mahal.vercel.app). Match its screens and flows. **Ignore its data layer** — mock data + `localStorage` + Zustand stores are prototype-only; production uses the REST API + Postgres below.

---

## The 6 rules (§0)

1. **The frontend never touches the database directly.** Everything goes through the versioned REST API (`https://api.tripking.in` or whatever domain we settle on). No Supabase/Postgres client in the browser — exactly like hudr-pwa goes through `https://api.hudr.ai`.
2. **One singleton API client** — `src/lib/api/client.ts`. Auth headers, single-flight 401 refresh, `ApiError` wrapping, retries (idempotent GETs only), Sentry/PostHog observability hooks all live there. Copy hudr-pwa's almost verbatim.
3. **Services → transforms → domain types.** API speaks `snake_case`; the app speaks `camelCase`. Transforms (`src/lib/api/transforms/*`) are the only bridge, and they **throw** on missing required fields — never default/fabricate.
4. **TanStack React Query** for all server state. `staleTime` per resource (table below); immutable data `Infinity`, live data ~30 s. Mutations do optimistic updates where it improves UX and always `invalidateQueries`.
5. **TypeScript strict, no exceptions** — `strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `noImplicitReturns`. No `any` (use `unknown` + a guard). No non-null `!` except right after a guard. `tsc --noEmit` + `npm run test:run` + `npm run build` gate every commit (Husky pre-push).
6. **Master data (lookup tables) is admin-configurable; workflow states are not.** See the split below.

**No business logic in the browser.** Fares, payouts, commission, GST, eligibility, OTP, trip-state transitions — all server-side. If the API didn't send `driver_payout` / `applicant_count` / `eligibility_status`, that's a backend bug to fix in the API, **not** a client-side fallback calculation. (Hard rule, inherited from hudr-pwa's hand replayer.)

---

## Stack (pinned) — and what's not allowed

React 18 · TypeScript 5 (strict) · Vite 5 · Tailwind v4 (`@tailwindcss/vite`) · shadcn/ui on Radix · react-router-dom v7 · `@tanstack/react-query` v5 · Zustand v5 · react-hook-form v7 + Zod v4 · `sonner` · `recharts` v3 · `date-fns` v4 · `idb` v8 · `@sentry/react` + `@sentry/vite-plugin` · `posthog-js` · `vite-plugin-pwa` + `workbox-window` · Vitest v3 + Testing Library + `@playwright/test` · ESLint v8 (zero-warnings) + Prettier + Husky v9. Hosting: Vercel. Backend runtime: Supabase Edge Functions (Deno). Always pick the patterns hudr-pwa already uses.

**Not allowed:** Next.js / RSC / server components · class components (except `<ErrorBoundary>`) · `any` (use `unknown` + a guard) · raw `fetch`/`supabase` in pages or components (go through a service) · default exports as the only export (named export too) · adding a dependency without asking · committing `.env*` · raw `console.log` (use `@/lib/logger`) · business-math/state in the browser · committed commented-out code.

---

## Folder layout (§3)

```
src/
├── assets/
├── components/
│   ├── ui/              # design-system primitives (shadcn / Radix) — barrel-exported
│   ├── feedback/        # LoadingSkeleton, ErrorState, EmptyState, ErrorBoundary
│   ├── form/            # LabeledInput, FormField, …
│   ├── layout/          # AppLayout, AdminLayout, nav bars
│   └── <feature>/       # trip/, driver/, agent/, admin/, vehicle/, alert/, review/, kyc/, …
├── config/api.ts        # base-URL resolution (dev Vite proxy vs prod), timeout, retries
├── contexts/AuthContext.tsx
├── hooks/               # ONE file per data domain — useTrips.ts, useDrivers.ts, useAdminConfig.ts, …
├── lib/
│   ├── api/{client.ts, services/, transforms/, guards/}
│   ├── utils/           # pure helpers — money.ts, distance.ts, dates.ts; cn() in utils.ts
│   ├── sentry/          # error-reporting wrappers
│   └── constants.ts     # code constants ONLY (MAX_PHOTO_BYTES, OTP_LENGTH) — never business data
├── pages/               # one file per route
├── types/               # barrel index.ts; trip.ts, driver.ts, agent.ts, vehicle.ts, adminConfig.ts, api.ts, …
├── App.tsx              # router + QueryClientProvider + providers
├── main.tsx             # Sentry, PostHog, PWA register
└── version.ts
```

- Path alias `@/` → `src/` (Vite + tsconfig). No relative `../../` imports.
- Barrel exports for `types/` and `components/ui/`. Import `import type { Trip } from '@/types'`.
- `src/lib/constants.ts` = code constants only. Car types, fuel types, cities, tags, default commission % etc. are **DB rows fetched via the API** — the prototype's `tripDefaults.ts` and the unions in `types/index.ts` are *temporary*; they become lookup-table rows.
- **One hook file per data domain:** `useTrips.ts` exports `useTrips()`, `useTrip(id)`, `usePostTrip()`, … (all trip queries + mutations together).
- **No data fetching in components — always via a hook.**

---

## API / services / hooks / transforms (§5)

- **Base URL:** `import.meta.env.VITE_API_BASE_URL`; dev uses a Vite proxy `/api/*` → real host (mirror hudr-pwa's `vite.config.ts`).
- **Auth headers:** public/browse → `X-API-Key: <VITE_TRIPKING_API_KEY>`; authed → `Authorization: Bearer <accessToken>`. Token pair from `POST /auth/login` (phone-OTP: `POST /auth/request-otp` → `POST /auth/verify-otp`); access token ~1 h, refresh token ~30 d, both in `localStorage`. 401 → single-flight `POST /auth/refresh` (mutex so concurrent 401s share one refresh) → retry; refresh fail → clear tokens, bounce to sign-in.
- **Resource naming:** plural nouns, kebab-case for multi-word — `/trips`, `/trip-acceptances`, `/vacancies`, `/drivers`, `/admin/car-types`, `/admin/app-settings`. `GET` list/read · `POST` create · `PATCH`/`PUT` update · `DELETE` (or `PATCH {is_active:false}` for lookup rows). Lists take `?page=&limit=&sort=` + resource filters; server caps `limit`.
- **Response envelope:** `{ success, data, meta?, error }`. `meta` = `{ page, limit, total, pages }` on lists. Errors: `{ success:false, data:null, error:{ code, message } }`. Non-2xx → `ApiError(message, status, body)`. HTTP status is meaningful (400 validation · 401 unauth · 403 forbidden · 404 · 409 conflict · 422 semantic · 429 rate-limited · 5xx).
- **Services** (`src/lib/api/services/*.ts`) — thin verb-noun camelCase functions over `apiClient`, one file per resource:
  ```ts
  export const getTrips = (params?: TripsQueryParams) =>
    apiClient.get<ApiTrip[]>('/trips', params).then(r => (r.data ?? []).map(transformTrip));
  export const postTrip = (input: PostTripInput) =>
    apiClient.post<ApiTrip>('/trips', toApiTripInput(input)).then(r => transformTrip(r.data!));
  ```
- **Hooks** (`src/hooks/*.ts`) — queries + mutations together; hierarchical array query keys (`['trips', params]`, `['trip', id]`, `['admin','car-types']`); `enabled` guards on missing ids; mutations `invalidateQueries` on settle (optimistic where it improves UX).
- **Transforms** (`src/lib/api/transforms/*.ts`) — strict, one-way (`snake_case` → `camelCase`); throw `[Resource]TransformError` with a code + context on missing required fields (copy hudr-pwa's `HandTransformError` pattern). Never compute money/state in a transform or component. For writes, mirror helpers (`toApiTripInput`) convert `camelCase` → `snake_case`.
- **Auth context:** `useAuth()` → `{ user, isAuthenticated, isLoading, login, register, logout }`. `<ProtectedRoute>` wraps authed routes; `<AdminRoute>` additionally requires `user.role === 'admin'` and 403s otherwise (**the prototype has no admin guard — production must add one**).

---

## Caching — React Query `staleTime` (§6)

`QueryClient` defaults: `{ staleTime: 5*60_000, gcTime: 30*60_000, refetchOnWindowFocus: false, retry: 1 }`. Per-resource overrides:

| Data | `staleTime` |
|---|---|
| Completed trips, finished reviews (immutable) | `Infinity` |
| Open / `has_applicants` trip lists, vacancy feed, applicant lists (live) | `30_000` |
| Admin master data (car types, cities, tags, settings, …) | `5 * 60_000` |
| Driver profile, agent profile, analytics | `60_000` |

Service worker (Workbox): `/api/trips`, `/api/vacancies`, `/api/trip-acceptances`, `/api/trips/*/applicants` → **NetworkFirst**; other `/api/*` (incl. `/admin/*`) → **StaleWhileRevalidate**; assets/JS/CSS → **StaleWhileRevalidate**; images → **CacheFirst**. `registerType:'autoUpdate'`, `skipWaiting` + `clientsClaim`. Use `queryClient.prefetchQuery` on hover/route-enter for detail pages.

---

## Database (§4) — Postgres on Supabase, behind the API

- One `public` schema. `TEXT` + `CHECK` constraints, **never native `ENUM`**. `id UUID PK DEFAULT gen_random_uuid()` (except lookup tables with a natural code, e.g. `languages.code`). `created_at`/`updated_at TIMESTAMPTZ NOT NULL DEFAULT now()` + an `update_updated_at` trigger on every mutable table.
- **Soft-disable lookup rows** (`is_active BOOLEAN NOT NULL DEFAULT true`), never hard-delete once referenced. API returns active rows by default; admin sees all.
- **RLS on every table** (follow the `bug_reports` policy pattern from TournamentPro/hudr): anon (API-key) → `SELECT` on public reference/content; authed users → their own rows; `users.role='admin'` → full access. `SECURITY DEFINER` helpers for RLS predicates to avoid recursion.
- Index every list-endpoint filter/sort column (`trips(status, pickup_at)`, `vacancies(current_city_id, status)`, `vehicles(driver_id)`, `trip_acceptances(trip_id)`, …); `pg_trgm` trigram indexes on `drivers.full_name`, `cities.name`; cached/denormalised columns where a list would otherwise scan a child table (`trips.applicant_count` via a trigger on `trip_acceptances`, `trips.driver_payout` computed on write — same pattern as `tournaments.hand_count`). `ANALYZE` after every schema change.
- **Vehicle `eligibility_status` is derived server-side** (`year` vs `app_settings.min_vehicle_year`) — never stored.

### Running SQL / migrations — `node scripts/db.cjs`

Migrations live in `supabase/migrations/<NNN|YYYYMMDDHHMMSS>_<name>.sql`. Apply with:
```bash
node scripts/db.cjs "select count(*) from public.cities"
node scripts/db.cjs --file supabase/migrations/001_reference_data.sql
```
It POSTs to the Supabase Management API `POST /v1/projects/{ref}/database/query` (runs SQL *outside* a transaction — DDL, multi-statement files, `VACUUM` all work). 200/201 = success. The personal access token is read at runtime from the Supabase CLI's Windows Credential Manager entry (`Supabase CLI:supabase`, set by `npx supabase login`) via `advapi32.dll CredReadW` — **not stored in this repo**; if missing, run `npx supabase login`. `SUPABASE_ACCESS_TOKEN` env var overrides it. (`db.<ref>.supabase.co` is IPv6-only — don't rely on `supabase db push` / `psql` against it on IPv4-only networks; use `scripts/db.cjs`.)

Edge functions get `withTiming()` performance instrumentation, a k6 load-test entry, and a `scripts/test-*.cjs` smoke test — the TournamentPro "new edge function" checklist.

---

## Administration — master-data vs system-enum split (§7)

**Admin-configurable** — each is a DB lookup table (§4.3) + a `/admin/*` REST resource + a screen in `/administration/config`:

| List | Table | Notes / seed |
|---|---|---|
| Car types | `car_types` | `label, sort_order, is_active`. Seed: Hatchback · Sedan · SUV · Innova · Tempo Traveller · Mini Bus |
| Fuel types | `fuel_types` | Seed: Petrol · Diesel · CNG · EV · **LPG (Indane)** |
| Vehicle makes | `vehicle_makes` | `name, sort_order, is_active`. Seed: Maruti Suzuki · Hyundai · Tata · Toyota · Mahindra · Honda · Kia · Renault · MG · Ford (legacy) |
| Vehicle models | `vehicle_models` | `make_id` FK (model dropdown filtered by make), `default_car_type_id` FK NULL, `default_seats` NULL, `sort_order, is_active`. Seed e.g. Maruti→Dzire/Swift/Ertiga, Toyota→Innova Crysta/Etios, Hyundai→Aura/Xcent, Honda→Amaze/City, Mahindra→Marazzo/Bolero |
| Seat options | `seat_options` | `value` INT PK, `is_active`; optional `car_type_seat_options(car_type_id, seat_value)` join. Seed: 4 5 6 7 8 9 12 15 |
| Cities | `cities` | `name, state, lat NUMERIC, lng NUMERIC, is_active` — **lat/lng mandatory** (radius matching). Seed: Vellore · Chennai · Pondicherry · Bangalore · Tirupati · Salem · Coimbatore |
| Languages | `languages` | `code` TEXT PK, `native_name, english_name, is_active`. Seed: en (English) · ta (தமிழ் / Tamil) · hi (हिन्दी / Hindi) |
| Review tags | `review_tags` | one table; `category` ∈ {`passenger_to_driver`, `manager_to_driver`, `driver_to_manager`}, `sentiment` ∈ {`positive`,`neutral`,`negative`}, `label, sort_order, is_active`. Seed per category (Punctual / Clean car / Polite / Safe driver / … ; Pays on time / Clear instructions / Fair bata / …) |
| Cancellation reasons | `cancel_reasons` | `label, applies_to` ∈ {`agent`,`driver`,`both`}, `sort_order, is_active` — replaces the free-text cancel prompt. Seed per side |
| App settings | `app_settings` | single row (`id=1` CHECK): `min_vehicle_year` (2015) · `vehicle_expiry_warning_days` (90) · `default_alert_radius_km` (25) · `default_commission_pct` (10) · `default_gst_pct` (5) · `default_driver_bata` (300) · `default_extras_paid_by_passenger` (true) · `default_driver_instructions` (multi-line template) |

`/admin/*` endpoints: `GET/POST /admin/<list>`, `PATCH/DELETE /admin/<list>/{id}`, `GET/PUT /admin/app-settings`, `PATCH /admin/<list>/reorder` (array of ids). All require `role=admin`; all write an `admin_audit_log` row (`actor_user_id, action, entity, entity_id, before_json, after_json, created_at`). `DELETE` only if unreferenced — API returns `409` with a use-count, UI offers "disable instead". Every admin mutation invalidates the `['admin','<list>']` query *and* any consumer query embedding the value (or echo a `referenceDataVersion`; or just accept a short `staleTime` on public lookup endpoints).

`/administration/config` UI: left rail / top tabs of lists → each = sortable table (drag handle for `sort_order`), inline edit (Dialog form for multi-field rows: cities, models, languages), Add button, Active toggle (greyed rows still shown to admin), Delete-if-unreferenced. Vehicle makes & models = master-detail (pick a make → manage its models). General settings = plain form with Save/Reset + validation (`min_vehicle_year ≥ 2000`, `commission_pct` 0–30). Match the prototype's `AdminConfigPage`.

**NOT configurable — system enums** (fixed in code + a `CHECK` constraint; do **not** build CRUD):
`users.role` (driver · trip_manager · admin) · `trips.status` (open · has_applicants · assigned · in_progress · completed · cancelled) · `trip_acceptances.status` (applied · selected · rejected · withdrawn · expired) · vehicle `eligibility_status` (derived: eligible · expiring_soon · expired) · `kyc_status` (pending · docs_submitted · video_pending · approved · rejected · resubmit_required) · `notifications.type` (alert_match · kyc_status_change · trip_assigned · trip_cancelled · trip_completed · review_received) · `reviews.direction` (passenger_to_driver · manager_to_driver · driver_to_manager) · `vacancies.status` · alert notify channels.

---

## Frontend coding standards (§8)

- Function components, typed props interface, named + default export. `React.memo()` for expensive list rows / tables / charts. Co-locate sub-components in the same file until reused, then promote to `components/<feature>/`.
- Hooks `useXxx` return a single value or a typed `UseXxxReturn` object. **No data fetching in components — always via a hook.**
- State: server → React Query; ephemeral UI → `useState`; cross-component client → Zustand (one store per concern, persisted only when it must survive reload). **Never put server data in Zustand.**
- **Loading / empty / error are first-class** — every data view renders `<LoadingSkeleton>` while pending, `<ErrorState>` (+ retry) on error, `<EmptyState>` when empty. **Partial loading**: refreshing a section refreshes only that section (themed inline overlay), never the whole page.
- Code-split by route (`React.lazy`); split vendor chunks (react / react-query / radix / charts) in Vite; lazy-load images; debounce search 300 ms; virtualise lists > ~100 rows; no reflexive `useMemo`/`useCallback`.
- a11y: semantic HTML, `aria-*` on dialogs (`role="dialog" aria-modal`), focus trap + Escape + body-scroll-lock on modals (the prototype's `ShareTripModal` is the pattern), `aria-label` on icon-only buttons, keyboard-operable everything.
- `<ErrorBoundary>` around the app; Sentry on render errors + API failures (skip 401/404 as user errors); PostHog for product analytics + slow-API (>2 s) + rage-clicks.
- **Tests at every step — non-negotiable.** Every new hook / utility / service / transform / component gets a test in a `__tests__/` folder beside it, written in the same commit. Every bug fix gets a regression test that would have caught it. Cover the kinds that apply: **unit** (pure logic, transforms-throw-on-missing, hooks via `renderHook`), **component/integration** (Testing Library — render + interact + assert; loading/empty/error paths), **contract/smoke** (`scripts/test-*.cjs` per endpoint), **E2E** (Playwright for the critical journeys). Don't mark a feature done if its tests aren't there. Pre-push gate (Husky): `tsc --noEmit` + `npm run test:run` + `npm run build` — all green or it doesn't push.
- i18n from day one — all user-facing strings via `t('key')`, never concatenate translated fragments; the `languages` lookup table drives available locales. Admin app is English-only at launch.
- PWA: `vite-plugin-pwa`, the Workbox config above, `safe-area-inset-*` padding for notched phones, "Add to Home Screen" affordance.
- **Commit discipline:** one logical change per commit; review `git diff --stat` before committing; never bundle an unrelated "improvement"; conventional commit messages (`feat:`, `fix:`, `refactor:`, `chore:`).
- **OpenAPI is part of the PR:** any edge-function change updates `public/docs/openapi.yaml` + `.json` (served as Swagger UI) and adds a k6 load-test entry + a `scripts/test-*.cjs` smoke test — in the same PR.

---

## What NOT to do

- Don't add a dependency without asking.
- Don't refactor / "improve" unrelated code while fixing a bug or building a feature — separate commit.
- Don't create a new file when an existing one fits; don't duplicate types/utils/components — check first.
- Don't compute fares, payouts, eligibility, or any business value in the client; don't add a "fallback calculation" when the API field is missing — fix the API.
- Don't call `supabase`/`fetch` from a page or component — go through `lib/api/services/*`.
- Don't put server data in Zustand; don't use `useEffect` for derived state — compute during render.
- Don't leave commented-out code, `console.log`, `any`, or a non-null `!` that isn't right after a guard.
- Don't write comments that restate the code; comment the *why* only.
- Don't ship a data view without loading / empty / error states.
- Don't `git push` without an explicit instruction; don't commit to `main` directly; don't bundle unrelated changes in one commit.
- Don't deviate from `docs/PLATFORM_AND_ADMIN_REQUIREMENTS.md` or change the API contract without asking.

> Maintenance: keep this file under ~300 lines (longer = skimmed). Most-violated rules stay near the top. If you catch yourself making the same mistake twice, that's the signal a rule is missing — add it here.

---

## Definition of done — per feature (§10)

1. API endpoint + OpenAPI doc + RLS policy + indexes + `ANALYZE`.
2. Service + transform (strict validation) + hook + tests.
3. UI with loading / empty / error states + a11y.
4. `tsc --noEmit`, `npm run test:run`, `npm run build` all green.
5. Mock-data path removed (no `import … from '@/data/mockData'` in production code).
6. Admin/master-data changes: audit-logged, cache invalidation wired, consumers updated.

---

## Delivery phases (§9) — status

1. ✅ **Foundations** — scaffold, `apiClient`, `AuthContext` + `<ProtectedRoute>`/`<AdminRoute>`, React Query (`STALE` tiers), Sentry/PostHog, PWA, Husky pre-push, migration 001 (reference data, seeded). *(`/website` + `/for-agents` marketing pages also ported.)*
2. ✅ **Reference data backend + Admin module** — the §4.3 lookup tables + `admin_audit_log`; the `/administration/config` UI (9 sections incl. makes↔models master-detail + the app-settings form); the `/admin/*` edge function (`supabase/functions/admin`, `X-Admin-Key` stopgap auth, audit logging, 409-if-referenced) — **deployed live** at `…supabase.co/functions/v1/admin`; `public/docs/openapi.yaml`+`.json`; `scripts/test-admin-config.cjs` (smoke-verified).
3. 🔶 **Core marketplace** — DB: migrations 002 & 003 applied (`users` + `handle_new_user` + `is_admin()`; `drivers`/`trip_managers`/`vehicles` via FK lookups; `trips`/`trip_acceptances`/`trip_executions` with the `driver_payout`/`applicant_count` triggers; `vacancies`+`vacancy_destinations`/`alerts`/`reviews`/`notifications`; admin-write RLS on the migration-001 tables). **Data layer done for all 10 resources** — types + strict transforms + services + React Query hooks + transform tests (`auth`, `admin-config`, `trips`, `drivers`/`agents`, `vehicles`, `vacancies`, `alerts`, `reviews`, `notifications`). `/auth`, `/trips`, `/notifications`, `/vehicles`, `/drivers`+`/agents`, `/vacancies` edge functions deployed + smoke-verified (+ OpenAPI). **TODO — now split into two conflict-free parallel lanes (see `docs/CONTINUE_HERE.md` → "Running two sessions in parallel"):** *backend lane* (`docs/CONTINUE_HERE_BACKEND.md`) — the remaining `/alerts` → `/reviews` edge functions (+ OpenAPI + smoke tests + `config.toml`), then Phase-4/5 backend endpoints; *frontend lane* (`docs/CONTINUE_HERE_FRONTEND.md`) — the ~15 screens (onboarding/KYC, driver/agent home, trip feed/detail, post trip/vacancy, applicant review, posted trips, assigned trip + OTP, profiles, alerts, passenger portal) on the existing hooks, matching the `C:\Apps\DriverMahal` prototype.
4. ⬜ **Admin operations** — KYC queue + video console, vehicle-eligibility dashboard, translation manager (wired to `languages`), reviews moderation.
5. ⬜ **Analytics** — agent analytics, admin dashboards — server-computed.
6. ⬜ **Hardening** — load tests, perf pass, a11y audit, security review (RLS coverage, rate limits, admin guards), replace the `X-Admin-Key` stopgap with a `role=admin` JWT check once `users` has admin rows.

Work in PR-sized commits; pause for review after each.

---

## Supabase project & credentials

| | |
|---|---|
| Project name | `tripking` |
| Project ref | `saxcbebqxgatiktsebxw` |
| URL | `https://saxcbebqxgatiktsebxw.supabase.co` |
| Dashboard | https://supabase.com/dashboard/project/saxcbebqxgatiktsebxw |
| Anon / publishable key | `sb_publishable_PRH2LiqnVjxAN7FYBVVQjA_TOWdFS0U` (legacy anon JWT also available via the dashboard) |
| Service-role / secret key | `sb_secret_<redacted>` — **value lives in `.env.development` as `SUPABASE_SERVICE_ROLE_KEY`** (gitignored), dashboard name `tripking_secret_api_key`; or fetch via `GET /v1/projects/<ref>/api-keys?reveal=true` (Management API) / the dashboard. Bypasses RLS; for admin/seed scripts + edge-function runtime; **never ship to the browser** and never commit the literal value (GitHub push-protection blocks it). Edge functions get `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` auto-injected, so no secret-setting needed there. The legacy `service_role` JWT also works (same place). |
| `ADMIN_API_KEY` (stopgap admin auth for `/admin/*`) | `tk_admin_7cecc2a7400cc67d6553f778432b95449a6f27f56e476547` — in `.env.development`; set as a Supabase function secret for the `admin` edge function. (Replace with a `role=admin` JWT check once `public.users` has admin rows.) |
| Postgres password | `DCCn6OIdwk0ENwzE` |
| Direct Postgres URL (IPv6-only) | `postgresql://postgres:DCCn6OIdwk0ENwzE@db.saxcbebqxgatiktsebxw.supabase.co:5432/postgres` |

App env (`.env.development`, gitignored — template is `.env.example`): the browser app talks to the **REST API**, not Supabase directly — `VITE_API_BASE_URL`, `VITE_TRIPKING_API_KEY` (+ `VITE_USE_MOCK_API` for a local mock during early dev). `VITE_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are for edge functions & migration scripts only. `VITE_SENTRY_DSN`, `VITE_POSTHOG_KEY` / `VITE_POSTHOG_HOST`, `VITE_GOOGLE_MAPS_API_KEY` as those integrations land.

---

## Ask before

- Choosing a backend hosting decision.
- Deviating from `docs/PLATFORM_AND_ADMIN_REQUIREMENTS.md`.
- Anything that changes the API contract.
- Adding any new dependency.

---

## Commands

```bash
npm run dev          # Vite dev server (port 3002); /api/* proxied to the API host
npm run typecheck    # tsc --noEmit
npm run test         # vitest (watch)
npm run test:run     # vitest run (CI / pre-push)
npm run test:coverage
npm run lint         # eslint, zero warnings
npm run build        # tsc && vite build
npm run preview      # serve the production build locally

# DB migrations / ad-hoc SQL (Supabase Management API — see §"Running SQL"):
node scripts/db.cjs "select count(*) from public.cities"
node scripts/db.cjs --file supabase/migrations/001_reference_data.sql

# Edge functions:
npx supabase functions deploy <name>
```

Pre-push (Husky) auto-runs `tsc --noEmit` → `npm run test:run` → `npm run build`; pre-commit runs `tsc --noEmit`.
