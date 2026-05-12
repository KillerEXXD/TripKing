# Trip King

Inter-city cab & trip marketplace PWA for India. One phone-registered account: a user can post a trip, post their own availability ("Vacant"), apply for trips, and (if an admin) administer the platform.

> **This repo is the development platform.** It was forked from the **DriverMahal** prototype (`C:\Apps\DriverMahal`, deployed at driver-mahal.vercel.app). DriverMahal stays frozen as the throwaway sandbox; all real development happens here.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | React 18 + TypeScript (strict) + Vite 5 |
| Styling | Tailwind v4 + shadcn-style primitives (Radix) |
| Routing | react-router-dom v7 |
| Server data | @tanstack/react-query v5 |
| Client state | Zustand v5 |
| Forms | react-hook-form + Zod |
| i18n | i18next + react-i18next *(present in deps; only partially wired — see TODO #5)* |
| PWA | vite-plugin-pwa + Workbox |
| Backend SDK | @supabase/supabase-js *(not yet wired; data layer still returns mocks)* |
| Errors / analytics | @sentry/react · posthog-js |
| Testing | Vitest + Testing Library + Playwright *(installed; no tests yet — see TODO #4)* |
| Hosting | Vercel — deployed at **https://trip-king.vercel.app** (prod build resolves the API via `VITE_API_BASE_URL`, which must point at the Supabase functions base since there's no dev `/api` proxy in prod) |

---

## Folder structure

```
src/
  App.tsx            # router + providers
  main.tsx           # Vite entry (referenced by index.html)
  index.css          # Tailwind v4 + design tokens

  features/          # one folder per product area — the screens live here
    home/            # DriverHomePage (the hub)
    auth/            # SplashPage, AuthPage (phone-OTP), OnboardingPage
    trips/           # TripFeedPage, TripDetailPage, PostTripPage
    my-activity/     # MyActivityPage (tabs: Trips / Applications / Vacancies)
    assigned-trips/  # AssignedTripDetailPage
    manage-trips/    # PostedTripsPage, ApplicantReviewPage   (manager side)
    vacancies/       # VacanciesPage, PostVacancyPage
    alerts/          # AlertsPage, CreateAlertPage, AlertDetailPage
    profile/         # ProfilePage, DriverProfilePage
    passenger/       # PassengerPage (public OTP portal)
    admin/           # AdminDashboardPage + KYC / Drivers / Vehicles / Translations
    marketing/       # ForAgentsPage, WebsitePage (landing pages)

  components/
    ui/              # shadcn-style primitives (button, card, input, badge, avatar)
    common/          # InstallAppCard, TripNotFound, BackButton, …
    location/        # LocationSearchPanel
    website/         # marketing-site components

  stores/            # Zustand stores (auth, trip overlays, executions, applications, …)
  hooks/             # useTrips, useDrivers, useVacancies, useGoBack, usePwaInstall, …
  contexts/          # AuthContext, LanguageContext
  lib/
    api/
      client.ts      # HTTP client
      services/      # trips / drivers / vacancies / locations  ← the data-layer seam
    utils.ts         # cn(), formatters, haversine
    tripDefaults.ts  # bata / instructions / extras / payout-math helpers
    alertMatcher.ts
    share/tripShare.ts
  data/              # mockData.ts (+ kyc / translations fixtures) — prototype data
  types/             # index.ts — all shared TS types
  config/            # api.ts
```

**Rules to keep:**
- Path alias `@/*` → `src/*`. Use `@/...` imports, not relative `../../`.
- A screen lives in `features/<area>/`; shared building blocks live in `components/`, `lib/`, `hooks/`, `stores/`, `contexts/`.
- Data access goes **page → hook → `lib/api/services/*`**. (Today the services return mocks; see TODO #1.)
- TypeScript strict; `noUnusedLocals` / `noUnusedParameters` on.

---

## Getting started

```bash
npm install
npm run dev          # http://localhost:3002  (phone reg → OTP 12345 → name → home)
npm run build        # tsc -b && vite build
npm test             # vitest (no tests yet)
npm run lint
```

This is a localStorage-only prototype today — no backend. Sign in via the phone-OTP flow (demo OTP **`12345`**), name yourself, and you land on the home hub with every flow available.

---

## Production-readiness punch list

These are the things to do before/while building real features (in priority order):

1. **Make the data layer real.** Pages still import `@/data/mockData` directly in places (`mockDrivers.find(d => d.userId === user.id)`, `mockManagers`, `mockCities`, `mockAcceptances`). Goal: every data read goes through `lib/api/services/*`; `mockData` is used *only* inside a mock implementation behind those services. Then "go live" = implement the services against the Supabase API.
2. **Collapse the prototype state.** Several Zustand stores are prototype hacks — especially `tripStateStore` + `applyOverlay(trip, overlays)` (faking assignment / OTP / privacy on top of immutable mock trips), plus `tripExecutionStore`, `myApplicationsStore`, `userPostedTripsStore`. In production those are server data; rebuild them as TanStack Query mutations. Likely survivors: `useAuthStore` (token) + `LanguageContext`. Don't carry `applyOverlay` forward.
3. **Decide the auth/role model.** `AuthContext` currently fakes a `User` with `role: 'admin'` and a hardcoded `id: 'u-driver-1'`. Decide: one role per user, or all-capabilities (current demo behaviour)? This affects the backend schema. `me`-data (driver/manager profile, vehicles, KYC) should come from a `/me` endpoint, not a mock lookup.
4. **Add tests.** Vitest is installed; there are zero tests. Start with the pure logic: payout math (`tripDefaults` + `PostTripPage`), `alertMatcher`, the OTP / start-trip flow.
5. **Finish (or remove) i18n.** `react-i18next` is in deps but the only translations are ~12 strings in `LanguageContext`. Either move to proper namespaced i18n JSON files (the 5 core screens at minimum: home, trip feed, trip detail, apply, my-trips — Tamil + Hindi), or remove the language picker so it doesn't over-promise.
6. **Clean up legacy routes.** The router has accreted redirects (`/admin/* → /administration/*`, `/driver/profile → /profile`, `/driver/my-applications → ?tab=`, `/login → /auth`, `/driver` & `/manager` → `/home`). Settle on the canonical URL scheme and delete the cruft. The `/driver/*` / `/manager/*` prefixes are vestigial now that roles are collapsed.
7. **Move stores into their feature folders** (e.g. `useAuthStore` → `features/auth/`, `tripStateStore` → `features/trips/`) once the import churn is worth it.
8. **Per-app config.** This was copied from DriverMahal — review `vite.config.ts` (manifest, `api.drivermahal.in` workbox patterns), `vercel.json`, `.env.example`, and the `driver-mahal.vercel.app` fallback URL in `lib/share/tripShare.ts`. *(Done: separate GitHub repo `KillerEXXD/TripKing` + Vercel project — deployed at https://trip-king.vercel.app. Make sure the Vercel project has `VITE_API_BASE_URL` set to `https://saxcbebqxgatiktsebxw.supabase.co/functions/v1` — the prod build has no `/api` proxy.)*

---

## Docs

- `docs/DRIVERMAHAL_REQUIREMENTS.md` — full requirements (data model, flows, phases, security, compliance). Rename to `TRIPKING_REQUIREMENTS.md` when convenient.
- `docs/drivermahal-flows.html` — visual operational flow doc.

## License

Private — all rights reserved.
