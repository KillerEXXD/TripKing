# TripKing — Session B (frontend lane): Phase-3 screens

> **This is the entry point for the *frontend* parallel session.** Companion to `docs/CONTINUE_HERE.md` (the shared map — read its "Running two sessions in parallel — lane ownership" section first), `CLAUDE.md` (working rules — §8 "Frontend coding standards" especially), and `docs/PLATFORM_AND_ADMIN_REQUIREMENTS.md` (the spec). The *backend* session works from `docs/CONTINUE_HERE_BACKEND.md` — you do not need to read it. **UX reference:** the clickable prototype at `C:\Apps\DriverMahal\src\pages\*` (and https://driver-mahal.vercel.app) — match its screens and flows, but **ignore its data layer** (mock data + `localStorage` + Zustand stores are prototype-only; production is the REST API + Postgres via the hooks already in this repo).

## Your lane (the only paths you touch)

`src/**` — `src/pages/`, `src/components/`, `src/hooks/`, `src/lib/`, `src/types/`, `src/AppRoutes.tsx`, `src/index.css`, `src/__tests__/` and every `__tests__/` folder under `src/`. Plus your own section/bullet in `CLAUDE.md` / `docs/CONTINUE_HERE*.md`.

**Never touch `supabase/**`, `public/docs/openapi.*`, `scripts/`, `tests/load/`** — that's the backend lane. The only cross-lane contract is the `POST /drivers` / `POST /agents` "create my profile" route the backend session ships first; you consume it via a new `createMyDriverProfile` / `createMyAgentProfile` in `src/lib/api/services/drivers.ts` + `src/hooks/useDrivers.ts` (both in *your* lane) — its request shape is `{ full_name, role:'driver'|'trip_manager', home_city_id, … }` (see `docs/CONTINUE_HERE_BACKEND.md` for the canonical definition); don't change that shape without updating both docs and pinging the other session.

Push protocol: `git pull --rebase origin main` **immediately before** every `git push origin main`. Disjoint lanes ⇒ the rebase always replays cleanly. A rebase conflict ⇒ you crossed lanes — stop, fix the boundary, don't force.

## State (already done, pushed)

Scaffold + `apiClient` singleton + `AuthContext`/`<ProtectedRoute>`/`<AdminRoute>` + `QueryClient` + router + Sentry/PostHog/PWA bootstrap (Phase 1). The `/administration/config` admin UI (9 sections) + `/website` + `/for-agents` + `/signin` rebuilt to the prototype's `/auth` (Phase 2). **The full data layer for all 10 resources is in place** — `src/types/*`, strict throw-on-missing `src/lib/api/transforms/*` (+ `toApi*` writers), `src/lib/api/services/*` over `apiClient`, React Query `src/hooks/use*` (queries + mutations with invalidation), transform tests (102 passing). Hooks present: `useAdminConfig`, `useTrips`, `useDrivers`, `useVacancies`, `useAlerts`, `useReviews`, `useVehicles`, `useNotifications`. `src/AppRoutes.tsx` currently lazy-routes only `/signin`, `/`, `/administration`, `/administration/config`, `/website`, `/for-agents`, `*`. `src/components/feedback` exports `LoadingSkeleton` / `ErrorState` / `EmptyState` / `ErrorBoundary`.

## NEXT STEP → build the Phase-3 screens (on the existing hooks), in the order below. Then Phase-4 / Phase-5 frontend.

### How to build each screen

Build on the existing `useTrips` / `useDrivers` / `useVacancies` / `useAlerts` / `useReviews` / `useNotifications` / `useAdminConfig` hooks (and add query/mutation functions to those hooks + their services as needed — services/hooks/transforms are all in your lane). On **every data view**: render `<LoadingSkeleton>` while pending, `<ErrorState>` (+ retry) on error, `<EmptyState>` when empty (`@/components/feedback`). Match the prototype's `C:\Apps\DriverMahal\src\pages\*` for layout/flow. Add the page as a `React.lazy` route in `src/AppRoutes.tsx` (inside `<ProtectedRoute><AppLayout/></ProtectedRoute>` unless it's public). Add a route test or RTL test (`__tests__/` beside the page) covering the loading/empty/error paths. Flesh out any `src/index.css` `@theme` token gaps the `components/ui/*` primitives reference. Co-locate sub-components in the page file until reused, then promote to `src/components/<feature>/`. Then: `feat(<screen>): …` commit (review `git diff --stat` — must be only `src/`) → `git pull --rebase origin main && git push origin main` (Husky pre-push runs `tsc --noEmit` + `npm run test:run` + `npm run build` — all green; zero ESLint warnings).

### Backend readiness — which screens can be E2E-tested now vs which wait on Session A

| Screen(s) | Backend | Status |
|---|---|---|
| Onboarding/KYC, profile, passenger portal, driver home, agent home, trip feed, trip detail, post trip, applicant review, posted trips, assigned trip + OTP, notifications UI | `/auth`, `/admin`, `/trips`, `/notifications`, `/vehicles` | **deployed now** — fully workable. (Onboarding's `createMyDriverProfile` needs Session A's `POST /drivers`, which it ships first.) |
| Public driver profile | `/drivers` | Session A commit 1 |
| Post vacancy, vacancy feed | `/vacancies` | Session A commit 2 |
| Alerts list / create / detail | `/alerts` | Session A commit 3 |
| Reviews UI (embedded in trip detail / driver profile) | `/reviews` | Session A commit 4 |

You can build a Group-2 screen any time — it'll render `<ErrorState>` until the function deploys, then work — but front-loading Group 1 keeps everything E2E-testable.

### Group 1 — backend live now (do these first, roughly in this order)

1. **Onboarding/KYC after sign-in** — name → role → docs → vehicle. Add `createMyDriverProfile` / `createMyAgentProfile` to `src/lib/api/services/drivers.ts` + `src/hooks/useDrivers.ts` (POST `/drivers` per the contract). Prototype: `OnboardingPage.tsx`.
2. **`InstallAppCard`** — port the prototype's PWA "Add to Home Screen" affordance into `src/components/layout/` (or `feedback/`); render it on home.
3. **Passenger portal** — `/passenger` route. Prototype: `PassengerPage.tsx`.
4. **Driver home** — `DriverHomePage` (on `useTrips` feed + `useDrivers` profile + `useNotifications`).
5. **Agent home** — `AgentHomePage` (on `useTrips` posted-by-me + `useNotifications`).
6. **Trip feed** — `TripFeedPage` (browse open/`has_applicants` trips; `useTrips` with filters).
7. **Trip detail** — `TripDetailPage` (full trip + apply/withdraw for drivers; `useTrips`).
8. **Post trip** — `PostTripPage` (react-hook-form + Zod; `usePostTrip` from `useTrips`; car-type/city dropdowns from `useAdminConfig`).
9. **Applicant review** — `ApplicantReviewPage` (poster's applicant list + select/reject; `useTrips` applicants + `assign`).
10. **Posted trips** — `PostedTripsPage` (the caller's posted trips + statuses).
11. **Assigned trip + OTP-start** — `AssignedTripDetailPage` (assigned driver's view; `start` with OTP-verify, `complete`, `cancel`).
12. **Notifications UI** — list + mark-read + mark-all (on `useNotifications`).
13. **Profile** — `ProfilePage` (the caller's own driver/agent profile + edit; `useDrivers`).

### Group 2 — needs Session A's new functions (build last, or earlier if you like the `<ErrorState>` placeholder)

14. **Public driver profile** — `DriverProfilePage` (← `/drivers` GET; `useDrivers`).
15. **Post vacancy** — `PostVacancyPage` (← `/vacancies` POST with `destination_city_ids: string[]`; `useVacancies`).
16. **Vacancy feed** — `VacanciesPage` (← `/vacancies` GET with filters; `useVacancies`).
17. **Alerts** — `AlertsPage` (list) + `CreateAlertPage` + `AlertDetailPage` (← `/alerts`; `useAlerts`).
18. **Reviews UI** — embed in `TripDetailPage` (after `completed`: post a review) and `DriverProfilePage` (show received reviews) (← `/reviews`; `useReviews`).

### After Phase-3 screens → Phase-4 / Phase-5 frontend (still `src/**` only)

- **Phase 4 frontend** — admin ops UIs on Session A's Phase-4 endpoints: KYC queue + video-call console, vehicle-eligibility dashboard, translation manager (wired to the `languages` lookup), reviews-moderation queue. All under `/administration/*`, `<AdminRoute>`-guarded.
- **Phase 5 frontend** — agent analytics + admin dashboards (server-computed — render the API's numbers, never compute business values client-side).
- **Phase 6 frontend** — a11y audit, perf pass, finish wiring the `apiClient` to send the real admin Bearer once `/admin` drops the `X-Admin-Key` stopgap.

(For Phase 4/5, the response shapes are defined in `public/docs/openapi.yaml` — owned by the backend session; coordinate via that.)

## Reference & rules recap

- **Reference implementation for the API layer:** `hudr-pwa` at `c:\Apps\hudr-workspace\hudr-pwa` — mirror its `src/lib/api/{client,services,transforms,guards}`, React Query patterns, `AuthContext`. "What does hudr-pwa do?"
- **No business logic in the browser** — fares, payouts, eligibility, OTP, trip-state transitions all come from the API; if a field is missing that's a backend bug (tell the backend session), never a client fallback calc.
- **No data fetching in components** — always via a hook. **Tests in the same commit** — every new hook/utility/service/transform/component gets a test; every bug fix a regression test. **One logical change per commit**; conventional messages; review `git diff --stat`.
- **Don't add a dependency without asking the user** (surfaces as a `package.json`/lockfile change — in neither lane).
- Stack & "what's not allowed": see `CLAUDE.md` (React 18 / TS strict / Vite 5 / Tailwind v4 / shadcn-Radix / react-router v7 / React Query v5 / Zustand v5 / RHF+Zod / sonner / recharts / date-fns / idb / Sentry / PostHog / vite-plugin-pwa / Vitest+RTL+Playwright / ESLint v8 zero-warnings + Prettier + Husky).
- Run locally: `npm run dev` (port 3002; `/api/*` proxied to the Supabase functions host). `npm run typecheck` / `npm run test:run` / `npm run build` / `npm run lint`.

## Keys & access

The browser app talks to the REST API (the deployed edge functions via the `/api` Vite proxy), not Supabase directly — `.env.development` has `VITE_API_BASE_URL` / `VITE_TRIPKING_API_KEY`. Full credential reference is in `CLAUDE.md`'s "Supabase project & credentials" section — never ask the user for tokens.
