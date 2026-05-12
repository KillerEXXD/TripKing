# TripKing — handoff: where we are & what to do next

> **Read this first when resuming.** Companion to `CLAUDE.md` (working rules) and `docs/PLATFORM_AND_ADMIN_REQUIREMENTS.md` (the engineering spec). `CLAUDE.md`'s "Delivery phases — status" section mirrors this. UX reference: the prototype at `C:\Apps\DriverMahal\src\pages\*` (ignore its mock/localStorage data layer — production is the REST API + Postgres).

---

## State (everything below is committed & pushed — `origin/main`)

**Phase 1 ✅** — scaffold (Vite `@/`+PWA+vendor chunks, tsconfig strict, ESLint, Vitest, Husky pre-push); `apiClient` singleton (401-refresh, `ApiError`, retry, Sentry/PostHog hooks); `AuthContext` + `<ProtectedRoute>`/`<AdminRoute>`; `QueryClient` (`STALE` tiers) + router + providers + Sentry/PostHog bootstrap; migration 001 (reference-data tables, seeded per §7); `/website` + `/for-agents` marketing pages; `/signin` rebuilt to match the prototype's `/auth`.

**Phase 2 ✅** — admin-config data layer + the full `/administration/config` UI (9 sections incl. makes↔models master-detail + the app-settings form) + the `/admin/*` edge function (`supabase/functions/admin`, `withTiming`, `X-Admin-Key` stopgap auth, audit logging, 409-if-referenced) **deployed** + OpenAPI + `scripts/test-admin-config.cjs` (8/8 ✓).

**Phase 3 — backend ✅** —
- Migrations 002 & 003 applied (23 tables): `users` (1:1 `auth.users` + `handle_new_user` + `is_admin()`); `drivers`/`trip_managers`/`vehicles` via the FK lookups; `trips`/`trip_acceptances`/`trip_executions` with the `driver_payout` & `applicant_count` triggers; `vacancies`+`vacancy_destinations`/`alerts`/`reviews`/`notifications`; admin-write RLS on the migration-001 tables.
- The complete typed **data layer for all 10 resources** (`auth`, `admin-config`, `trips`, `drivers`/`agents`, `vehicles`, `vacancies`, `alerts`, `reviews`, `notifications`): `src/types/*`, strict throw-on-missing `src/lib/api/transforms/*` (+ `toApi*` writers), `src/lib/api/services/*` over `apiClient`, React Query `src/hooks/use*` (queries + mutations with invalidation), transform tests — **102 tests passing**.
- **Edge functions deployed & smoke-verified:** `/admin` (8/8), `/auth` (phone-OTP, dev-OTP `123456`, real Supabase sessions via synthetic-email users — 7/7), `/trips` (full lifecycle: post / browse with joins / apply / withdraw / reject / assign+OTP-gen / start+OTP-verify / complete / cancel — 8/8), `/notifications` (list / mark-read / mark-all — 6/6), `/vehicles` (CRUD + derived `eligibility_status` — 6/6), `/drivers` + `/agents` (profiles + "create my profile" + location; idempotent profile-create syncs `users.role` — 22/22, commit `eccde0e`), `/vacancies` (browse with filters + joins / post with destinations / cancel — 22/22), `/alerts` (owner-scoped saved-search CRUD — 21/21). OpenAPI (`public/docs/openapi.{yaml,json}`) covers all of them.
- Dev wiring: `vite.config.ts`'s `/api` proxy → `https://saxcbebqxgatiktsebxw.supabase.co/functions/v1`; the frontend services call resource-prefixed paths (`/auth/*`, `/admin/*`, `/trips/*`, `/notifications/*`, `/vehicles/*`) which route straight to those functions.

---

## Running two sessions in parallel — lane ownership

The remaining work is split into two **conflict-free lanes** so two Claude sessions can run concurrently. Each session opens its own handoff doc and **only ever edits files in its lane**:

| Lane | Entry doc | Owns (the only paths it touches) | Scope |
|---|---|---|---|
| **A — backend** | **`docs/CONTINUE_HERE_BACKEND.md`** | `supabase/**` (functions, `config.toml`, migrations) · `public/docs/openapi.yaml`+`.json` · `scripts/test-*.cjs`+`scripts/db.cjs` · `tests/load/**` | the remaining edge functions (✅ `/drivers`+`/agents`+`/vacancies`+`/alerts` done → next `/reviews`), then Phase-4/5 backend endpoints |
| **B — frontend** | **`docs/CONTINUE_HERE_FRONTEND.md`** | `src/**` (pages, components, hooks, lib, types, `AppRoutes.tsx`, `index.css`, `__tests__`) | the ~15 Phase-3 screens on the existing hooks, then Phase-4/5 UIs |

No file appears in both lanes (`package.json`/lockfile is in *neither* — adding a dep needs the user). `CLAUDE.md` and the `CONTINUE_HERE*.md` docs are shared but append-only, each session in its own section.

**The one cross-lane contract:** the `POST /drivers` / `POST /agents` "create my profile" route — backend implements it (commit 1), frontend consumes it via a new `createMyDriverProfile`/`createMyAgentProfile` in `src/lib/api/services/drivers.ts`+`src/hooks/useDrivers.ts`. Shape: `{ full_name, role:'driver'|'trip_manager', home_city_id, … }`. Neither side changes it without updating both lane docs.

**Push protocol (both sessions):** `git pull --rebase origin main` **immediately before** every `git push origin main`. Disjoint lanes ⇒ the rebase always replays cleanly. A rebase conflict ⇒ a lane was crossed — stop, fix the boundary, don't force. Edge-function changes don't affect the `tsc/test/build` pre-push gate (`supabase/`, `public/docs/`, `scripts/`, `tests/load/` are outside the app build), so the lanes never break each other's gate.

> The rest of this doc is the full map for both lanes. If you're a parallel session, your lane doc above is the focused view — read it first; come back here only for the per-resource notes (which it copies anyway).

---

## NEXT STEP → the **`/reviews` edge function** (✅ `/drivers` + `/agents` + `/vacancies` + `/alerts` shipped)

Then: **`/reviews`** → then the **screens** → then **Phases 4–6**. *(Running in parallel? See the lane split above — backend = `docs/CONTINUE_HERE_BACKEND.md`, frontend = `docs/CONTINUE_HERE_FRONTEND.md`.)*

### The recipe (every remaining edge function — mirror `supabase/functions/trips/index.ts`)

1. **`supabase/functions/<name>/index.ts`** — Deno; `serve(withTiming('<name>', async (req) => { … }))`; handle `corsPreflight`; parse the path with `url.pathname.match(/\/<name>(?:\/(.+))?$/)` → routes at the function root (`GET /` = list, `GET /:id`, `POST /:id/<action>`, etc.); for authed routes read the Bearer token (`req.headers.get('authorization')?.slice(7)`), validate via `db.auth.getUser(token)` → `auth.uid()`, look up the caller's `users.role` (+ `drivers.id` if relevant), and **enforce the same ownership rules the RLS policies in migrations 002/003 encode** (owner / poster / assigned-driver / `role==='admin'`); writes go through the **service-role client** (`serviceClient()` from `../_shared/supabase.ts` — it reads the auto-injected `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`); use joined `select(...)` strings that match the frontend transforms (e.g. `'*, from_city:cities!from_city_id(*), to_city:cities!to_city_id(*), car_type:car_types(label)'`); map Postgres errors with a `pgFail` helper (`23505`→`CONFLICT` 409, `23503`→`IN_USE` 409, `23502`/`23514`/`22P02`→`VALIDATION` 422, else `DB_ERROR` 400). Use `ok(data)` / `fail(code, message, status)` from `../_shared/cors.ts`. Reuse `../_shared/{cors,timing,supabase}.ts`.
2. **`supabase/config.toml`** — add `[functions.<name>]` then `verify_jwt = false` (the function does its own auth; the gateway gate is off).
3. **OpenAPI** — append the paths to `public/docs/openapi.yaml` (compact one-line `post: { tags: […], summary: …, … }` style) **and** to `public/docs/openapi.json` (a small `node -e "const p=JSON.parse(…); Object.assign(p.paths,{…}); p.tags=p.tags.concat([…]); fs.writeFileSync(…)"` script, like the trips/auth/notifications/vehicles appends). Add a tag for the resource.
4. **`scripts/test-<name>.cjs`** — Node smoke test mirroring `scripts/test-vehicles.cjs`: read `<NAME>_API_BASE` (skip cleanly + `exit 0` if unset); get a token via `POST /auth/auth/request-otp` then `POST /auth/auth/verify-otp { phone, otp:'123456', display_name, role }`; exercise the routes (a public read → 200+array, a write without auth → 401, a `404` case, a `403` case where applicable); `process.exit(1)` on any failed check.
5. **Deploy & smoke:** `npx supabase functions deploy <name> --project-ref saxcbebqxgatiktsebxw --no-verify-jwt` then `<NAME>_API_BASE=https://saxcbebqxgatiktsebxw.supabase.co/functions/v1 node scripts/test-<name>.cjs`.
6. **Commit & push:** `feat(<name>): …` (one logical change; review `git diff --stat`) → `git push origin main` (the Husky pre-push runs `tsc --noEmit` + `npm run test:run` + `npm run build` — all must be green; secret-scanning will block any literal `sb_secret_…` so never commit one).

### Per-resource notes

- **`/drivers` (+`/agents`)** — `GET /drivers ?current_city_id=&kyc_status=` (public; joins `home_city`/`current_city`/`vehicles`(summary)), `GET /drivers/:id`, `PATCH /drivers/:id` (owner or admin — `full_name`/`email`/`home_city_id`/`current_city_id`/`profile_photo_url`), `PATCH /drivers/:id/location` (owner — `current_city_id`/`current_lat`/`current_lng`/`current_location_at`). Same for `/agents` (= `trip_managers`): `GET /agents/:id`, `PATCH /agents/:id`. Frontend service: `src/lib/api/services/drivers.ts` (already calls `/drivers`, `/drivers/:id`, `/drivers/:id/location`, `/agents/:id`); transform: `src/lib/api/transforms/driver.ts`. **Also add a "create my driver/agent profile" route** — `POST /drivers { full_name, role:'driver', home_city_id, … }` (driver_id auto, user_id = caller) — so a fresh sign-in can become a driver/agent; the `verify-otp` flow only creates the `users` row. (This unblocks the `/trips` apply→assign→start path and the `/vehicles` POST path in their smoke tests.)
- **`/vacancies`** — `GET /vacancies ?current_city_id=&destination_city_id=&status=&driver_id=` (public; joins `driver`(summary)+`vehicle`(summary)+`current_city`+`destination_cities` via the `vacancy_destinations` junction — return them as `destination_cities: [...]` or `vacancy_destinations: [{city:{...}}]`; the transform accepts both), `GET /vacancies/:id`, `POST /vacancies` (driver — body incl. `destination_city_ids: string[]` → insert the vacancy then the junction rows), `POST /vacancies/:id/cancel` (owning driver). Service: `services/vacancies.ts`; transform: `transforms/vacancy.ts`.
- **`/alerts`** — owner-scoped: `GET /alerts` (the caller's), `GET /alerts/:id`, `POST /alerts`, `PATCH /alerts/:id` (incl. `is_active`/`paused_at`), `DELETE /alerts/:id`. `notify_via` is a `text[]` constrained to `{push,sms,email,in_app}`; `car_type_ids` is a `uuid[]`. Service: `services/alerts.ts`; transform: `transforms/alert.ts`.
- **`/reviews`** — `GET /reviews ?trip_id=&ratee_user_id=&direction=` (published readable by all; parties see their own — for the simple version: return `is_published` rows + the caller's own when authed), `POST /reviews` (the rater — `rater_user_id = auth.uid()`; `direction`/`score 1-5`/`comment`/`tag_ids`; unique `(trip_id, direction)`; should ideally check `trip.status='completed'`), `POST /reviews/:id/report` (any authed user — set `is_flagged`+`flag_reason`). Anonymous passenger reviews (`rater_user_id` null) are out of scope for this function — they'd come via a passenger-portal edge function later. Service: `services/reviews.ts`; transforms: `transforms/review.ts` (`transformReview` + `transformNotification`).

---

## Then → Phase 3 screens (the hooks are all in place; match `C:\Apps\DriverMahal\src\pages\*`)

Onboarding/KYC after sign-in (name → role → docs → vehicle) + port `InstallAppCard` + the passenger portal (`/passenger`); then **driver home → agent home → trip feed → trip detail → post trip → post vacancy → applicant review → posted trips → assigned trip + OTP-start → public driver profile → alerts list/create**. Each: build on the existing `useTrips`/`useDrivers`/`useVacancies`/`useAlerts`/`useReviews`/`useNotifications`/`useAdminConfig` hooks; render `<LoadingSkeleton>`/`<ErrorState>`/`<EmptyState>` (`@/components/feedback`) on every data view; add a route test or RTL test per screen; lazy-route in `src/AppRoutes.tsx`. Also flesh out any `src/index.css` `@theme` token gaps the `components/ui/*` primitives reference.

## Then → Phase 4 / 5 / 6

- **Phase 4** — admin ops: KYC queue + video-call console, vehicle-eligibility dashboard, translation manager (wired to the `languages` lookup), reviews-moderation queue.
- **Phase 5** — agent analytics + admin dashboards (server-computed).
- **Phase 6** — load tests (k6, per the `tests/load/*` checklist if added), perf pass, a11y audit, RLS-coverage + rate-limit security review.

---

## Known TODOs / gotchas

- **`X-Admin-Key` is a stopgap** — the `/admin/*` function gates *mutations* on the `ADMIN_API_KEY` env secret (in `.env.development` + set as a Supabase function secret). The `apiClient` doesn't send it, so the `/administration/config` UI's writes 403 until this is replaced with a real `role=admin` Bearer check (Phase 6). Reads (public) work.
- **dev-OTP** — `/auth` is in dev mode: `request-otp` returns the code, `verify-otp` accepts `123456` (or any 6-digit). Real SMS provider + an `auth_otps` table is Phase 6.
- **No driver/agent profiles on sign-in** — `verify-otp` creates the `users` row only; there's no driver/agent profile until the `/drivers`/`/agents` function adds a "create my profile" route (see above). Until then the `/trips` apply→assign and `/vehicles` POST paths can't be smoke-tested end-to-end.
- **Edge-function routing** — function `<name>` is reachable at `…/functions/v1/<name>/…`; routes live at the function root (`GET /` = list, `GET /:id`, …). The `auth` function additionally matches the *last* path segment, so `/auth/me` and `/me` both resolve. (An `api.tripking.in` gateway would map `/<name>/*` → the `<name>` function later.)
- **`supabase/` is outside the app build** — `tsc --noEmit` / ESLint / `vite build` ignore it, so edge-function changes don't affect the `tsc/test/build` gate; verification for them is the `scripts/test-<name>.cjs` smoke against the deployed function.

## Keys & access (full details in `CLAUDE.md`)

Supabase project `tripking` ref `saxcbebqxgatiktsebxw`. The Supabase CLI access token (Windows Credential Manager — used by `node scripts/db.cjs` for SQL and `npx supabase functions deploy`), the service-role secret key + legacy `service_role` JWT (in `.env.development`; `CLAUDE.md` has the redacted reference + how to re-fetch), the anon/publishable key, the DB password, the `ADMIN_API_KEY` — all present and confirmed working (5 edge functions deployed, 3 migrations applied this far). `node scripts/db.cjs "<SQL>"` runs SQL via the Management API.
