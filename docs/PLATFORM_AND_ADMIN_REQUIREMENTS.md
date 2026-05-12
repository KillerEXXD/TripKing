# TripKing (DriverMahal) — Development Platform & Administration Requirements

**Audience:** the development team building the production application.
**Status:** v1 — hand-off document. Read end-to-end before writing code.
**Reference implementation:** `hudr-pwa` (`c:\Apps\hudr-workspace\hudr-pwa`). We deliberately mirror its architecture so the two products share patterns, conventions and (eventually) infrastructure.

---

## 0. TL;DR — the rules

1. **The frontend never touches the database directly.** Everything goes through a versioned **REST API** (`https://api.tripking.in` or whatever domain we settle on), exactly like hudr-pwa goes through `https://api.hudr.ai`. No Supabase/Postgres clients in the browser.
2. **One singleton API client.** Auth headers, token refresh, error wrapping, retries and observability live in one place (`src/lib/api/client.ts`).
3. **Services → transforms → domain types.** API speaks `snake_case`; the app speaks `camelCase`. Transforms are the only place that bridge is crossed, and they validate strictly (throw on missing required fields rather than defaulting).
4. **TanStack React Query** for all server state. `staleTime` is chosen per resource — immutable data is `Infinity`, live data is ~30 s. Mutations do optimistic updates and invalidate.
5. **TypeScript strict mode, no exceptions.** `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch` on. `tsc --noEmit` and the test suite gate every commit.
6. **Master data (lookup tables) is admin-configurable; workflow states are not.** Section 7 lists exactly which is which.

---

## 1. Product context (one paragraph)

TripKing is a two-sided marketplace for outstation cab trips in India. **Agents** (a.k.a. trip managers) post commercial trips; **drivers** browse and apply, get picked, run the trip with an OTP handshake, and get paid. Drivers can also post a trip they can't run themselves (acting as the agent for that one ride). **Admins** manage KYC, vehicle eligibility, translations, and — the subject of Section 7 — all the platform's reference data. The prototype in this repo demonstrates the flows with mock data and `localStorage`; production replaces every mock with the REST API described below.

---

## 2. Target architecture

```
┌──────────────────────────┐        HTTPS / JSON         ┌─────────────────────────┐
│  Web/PWA  (React + TS)   │  ───────────────────────▶   │   REST API                │
│  - React Query           │   X-API-Key (public)        │   api.tripking.in         │
│  - apiClient singleton   │   Bearer token (auth)       │   (Edge Functions / Node) │
│  - services + transforms │  ◀───────────────────────   │                           │
└──────────────────────────┘                              └────────────┬────────────┘
                                                                        │ SQL
                                                          ┌─────────────▼────────────┐
                                                          │  PostgreSQL (Supabase)     │
                                                          │  - RLS on every table      │
                                                          │  - lookup tables (Sec. 7)  │
                                                          └────────────────────────────┘
```

- **Why a REST API in front of the DB** (same reasoning as hudr-pwa): a single, testable contract; the same API serves the web app, any future native app and any partner; the DB can move or shard without touching clients; RLS + API key gating is the security boundary.
- **Backend runtime:** Supabase Edge Functions (Deno) are fine for v1, matching hudr-pwa. If we outgrow them, the contract stays; only the implementation moves.
- **No business logic in the browser.** Fare/payout/commission maths, eligibility derivation, OTP generation, trip-state transitions — all server-side. The browser renders what the API returns.

---

## 3. Repository & folder structure (the standard)

Mirror hudr-pwa. New repo layout:

```
src/
├── assets/                 # static images, icons, sounds, fonts
├── components/
│   ├── ui/                 # design-system primitives (button, input, select, dialog, badge, card, tabs, …)
│   ├── feedback/           # LoadingSkeleton, ErrorState, EmptyState, ErrorBoundary
│   ├── form/               # composed form controls (LabeledInput, FormField, …)
│   ├── layout/             # AppLayout, AdminLayout, nav bars
│   └── <feature>/          # feature-scoped components (trip/, driver/, agent/, admin/, …)
├── config/
│   └── api.ts              # base-URL resolution (dev proxy vs prod), timeout, retry count
├── contexts/
│   └── AuthContext.tsx     # session, login/logout, token refresh
├── hooks/                  # ONE file per data domain — useTrips.ts, useDrivers.ts, useAdminConfig.ts, …
├── lib/
│   ├── api/
│   │   ├── client.ts       # the singleton ApiClient (see §5.2)
│   │   ├── services/       # one file per resource — trips.ts, drivers.ts, vacancies.ts, admin-config.ts, auth.ts, …
│   │   ├── transforms/     # snake_case → camelCase, strict validation (see §5.5)
│   │   └── guards/         # runtime type guards used by transforms
│   ├── utils/              # pure helpers — money.ts, distance.ts, dates.ts, …
│   ├── sentry/             # error reporting wrappers
│   └── constants.ts        # genuine app constants only (NOT business reference data — that's in the DB)
├── pages/                  # one file per route
├── types/
│   ├── index.ts            # barrel — `export * from './trip'` etc.
│   ├── trip.ts             # Trip, TripStatus, TripQueryParams, …
│   ├── driver.ts
│   ├── agent.ts
│   ├── vehicle.ts
│   ├── adminConfig.ts      # the lookup-table domain types (CarType row, FuelType row, …)
│   ├── api.ts              # API envelope types (ApiResponse<T>, PaginationMeta, …)
│   └── ...
├── App.tsx                 # router + QueryClientProvider + providers
├── main.tsx                # bootstrap (Sentry, PostHog, PWA register)
└── version.ts
```

Rules:
- **`src/lib/constants.ts` is for code constants only** (e.g. `MAX_PHOTO_BYTES`, `OTP_LENGTH`). Business reference data — car types, fuel types, cities, tags, default commission % — lives in the **database** and is fetched through the API. The prototype's `src/lib/tripDefaults.ts` and the unions in `src/types/index.ts` are *temporary*; they become DB rows.
- **Barrel exports** for `types/` and `components/ui/`. Import `import type { Trip } from '@/types'`, never deep paths.
- **Path alias `@/` → `src/`** (Vite + tsconfig). Relative `../../` imports are not allowed.
- **One hook file per data domain.** `useTrips.ts` exports `useTrips()`, `useTrip(id)`, `usePostTrip()`, etc. — all the queries/mutations for trips.

---

## 4. Database modelling

### 4.1 Principles
- **PostgreSQL on Supabase.** One schema (`public`) for v1.
- **Use `TEXT` + `CHECK` constraints, never native `ENUM` types** — easier to evolve (this is a documented hudr/TournamentPro rule and we keep it). Example: `status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','has_applicants','assigned','in_progress','completed','cancelled'))`.
- **Surrogate keys:** `id UUID PRIMARY KEY DEFAULT gen_random_uuid()` for everything except lookup tables that have a natural stable code (e.g. `languages.code = 'ta'`).
- **Timestamps:** `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()` with an `update_updated_at` trigger on every mutable table.
- **Soft-disable lookup rows, never hard-delete** once referenced — `is_active BOOLEAN NOT NULL DEFAULT true`. The API returns active rows by default; admin can see all.
- **RLS on every table.** Anonymous (API-key) clients get `SELECT` on public reference/content data; authenticated users get scoped access to their own rows; admins (`users.role IN ('admin','administrator')`) get full access. Follow the `bug_reports` policy pattern from TournamentPro/hudr.
- **`ANALYZE` after creating indexes.** Add indexes for every column you filter/sort on in a list endpoint.

### 4.2 Core entity tables (sketch — refine during build)

| Table | Key columns | Notes |
|---|---|---|
| `users` | `id`, `role` (`driver`\|`trip_manager`\|`admin`), `phone`, `display_name`, `preferred_language` (FK → `languages.code`), `is_active` | one account per phone |
| `drivers` | `id`, `user_id` FK, `full_name`, `home_city_id` FK → `cities`, `current_city_id` FK, `kyc_status` (CHECK), rating columns | |
| `trip_managers` | `id`, `user_id` FK, `full_name`, `business_name`, `business_city_id` FK | a.k.a. agents |
| `vehicles` | `id`, `driver_id` FK, `make_id` FK → `vehicle_makes`, `model_id` FK → `vehicle_models`, `year`, `car_type_id` FK → `car_types`, `seats`, `ac`, `fuel_type_id` FK → `fuel_types`, `registration_number`, doc columns, `insurance_expiry`, `permit_expiry`, `is_primary`, `is_active` | `eligibility_status` is **derived** server-side from `year` vs `app_settings.min_vehicle_year` — do NOT store it |
| `trips` | `id`, `posted_by_user_id` FK, `posted_by_role` (CHECK), `from_city_id` FK, `to_city_id` FK, `pickup_at` TIMESTAMPTZ, `expected_distance_km`, `car_type_id` FK, `seats_required`, `ac_required`, `rate_per_km`, `total_fare`, `commission_pct`, `gst_amount`, `driver_bata`, `extras_paid_by_passenger`, `driver_instructions`, `status` (CHECK), `assigned_driver_id` FK NULL, `assigned_vehicle_id` FK NULL, `passenger_name`, `passenger_phone`, `passenger_count`, `luggage_notes`, `special_requests`, `created_at` | `total_fare`, `driver_payout` etc. computed server-side and persisted for history; never recomputed in the client |
| `trip_acceptances` | `id`, `trip_id` FK, `driver_id` FK, `vehicle_id` FK, `status` (`applied`\|`selected`\|`rejected`\|`withdrawn`\|`expired`), `applicant_quoted_rate_per_km`, `applicant_message`, `applied_at`, `decision_at`, `decision_note` | unique `(trip_id, driver_id)` while active |
| `trip_executions` | `trip_id` FK PK, `started_at`, `completed_at`, `start_odo_url`, `end_odo_url`, `driver_notes`, `passenger_otp` (hashed), `cancelled_at`, `cancel_reason_id` FK → `cancel_reasons` | |
| `vacancies` | `id`, `driver_id` FK, `vehicle_id` FK, `current_city_id` FK, `available_from`, `available_until`, `min_rate_per_km`, `notes`, `status` | "I'm available" posts |
| `alerts` | `id`, `user_id` FK, `name`, `from_city_id` FK, `from_radius_km`, `to_city_id` FK NULL, `to_radius_km`, `min_rate_per_km`, `car_type_ids` UUID[], pickup-window cols, `notify_via` TEXT[], `is_active` | |
| `reviews` | `id`, `trip_id` FK, `rater_user_id` FK, `direction` (`manager_to_driver`\|`driver_to_manager`\|`passenger_to_driver`), `score` 1-5, `comment`, `tag_ids` UUID[], `is_published`, `is_flagged`, `created_at` | tags FK → `review_tags` |
| `notifications` | `id`, `user_id` FK, `type` (CHECK), `title`, `body`, `payload_json`, `is_read`, `created_at` | |

### 4.3 Lookup / master-data tables (the Administration subject — see §7 for the full catalog)

| Table | Columns | Admin can | Notes |
|---|---|---|---|
| `car_types` | `id`, `label`, `sort_order`, `is_active` | add / rename / re-order / disable | e.g. Hatchback, Sedan, SUV, Innova, Tempo Traveller, Mini Bus |
| `fuel_types` | `id`, `label`, `sort_order`, `is_active` | add / rename / disable | Petrol, Diesel, CNG, EV — **add LPG / Indane (LPG)** as the user requested; keep all four existing |
| `vehicle_makes` | `id`, `name`, `sort_order`, `is_active` | add / rename / disable | Maruti Suzuki, Hyundai, Tata, Toyota, Mahindra, Honda, Kia, … |
| `vehicle_models` | `id`, `make_id` FK → `vehicle_makes`, `name`, `default_car_type_id` FK NULL, `default_seats` NULL, `sort_order`, `is_active` | add / rename / disable / re-parent | **models belong to a make** — the make dropdown drives the model dropdown |
| `seat_options` | `value` INT PK, `is_active` | add / disable | 4, 5, 6, 7, 8, 9, 12, 15, … — optionally constrain per car type via a join table `car_type_seat_options(car_type_id, seat_value)` |
| `cities` | `id`, `name`, `state`, `lat` NUMERIC, `lng` NUMERIC, `is_active` | add / edit / disable | the service area; lat/lng power radius matching |
| `languages` | `code` TEXT PK (BCP-47 short), `native_name`, `english_name`, `is_active` | add / rename / disable | en, ta, hi today; admin can add bn, gu, … |
| `review_tags` | `id`, `label`, `category` (`passenger_to_driver`\|`manager_to_driver`\|`driver_to_manager`), `sentiment` (`positive`\|`neutral`\|`negative`), `sort_order`, `is_active` | add / rename / re-categorise / disable | three vocabularies, one table |
| `cancel_reasons` | `id`, `label`, `applies_to` (`agent`\|`driver`\|`both`), `sort_order`, `is_active` | add / rename / disable | replaces the free-text cancel prompt |
| `app_settings` | single-row table (`id = 1` CHECK) with one column per setting | edit | `min_vehicle_year`, `vehicle_expiry_warning_days`, `default_alert_radius_km`, `default_commission_pct`, `default_gst_pct`, `default_driver_bata`, `default_extras_paid_by_passenger`, `default_driver_instructions` |

> **Migration note:** the prototype's hard-coded unions (`CarType`, `FuelType`, `LanguageCode`) and `tripDefaults.ts` map 1:1 onto these tables. The first backend migration seeds them with the current values.

### 4.4 Indexing & performance (carry over the hudr/TP playbook)
- Index every list-endpoint filter/sort column (`trips(status, pickup_at)`, `trips(from_city_id)`, `vacancies(current_city_id, status)`, `vehicles(driver_id)`, `trip_acceptances(trip_id)`, …).
- Trigram indexes (`pg_trgm`) on `drivers.full_name`, `cities.name` for the admin search.
- Add **cached/denormalised columns** where a list endpoint would otherwise scan a child table — e.g. `trips.applicant_count` maintained by a trigger on `trip_acceptances`, `trips.driver_payout` computed on insert/update. (This is exactly the pattern TournamentPro uses for `tournaments.hand_count`.)
- Run `ANALYZE` after every schema change. Keep an eye on `pg_stat_statements` for slow queries.

---

## 5. The REST API & how the client uses it

### 5.1 Conventions
- **Base URL:** `https://api.tripking.in`. The frontend reads `import.meta.env.VITE_API_BASE_URL`; in dev a Vite proxy maps `/api/*` to the real host (mirrors hudr-pwa's `vite.config.ts`).
- **Auth:**
  - Public/browse endpoints: `X-API-Key: <VITE_TRIPKING_API_KEY>`.
  - Authenticated endpoints: `Authorization: Bearer <accessToken>`.
  - Token pair from `POST /auth/login` → `{ access_token, refresh_token, user }`; `access_token` short-lived (~1 h), `refresh_token` long-lived (~30 d); both in `localStorage`. On a `401`, the client transparently calls `POST /auth/refresh` once (with a mutex so concurrent 401s share one refresh) and retries; on refresh failure it clears tokens and bounces to sign-in.
- **Resource naming:** plural nouns, kebab-case for multi-word — `/trips`, `/trip-acceptances`, `/vacancies`, `/drivers`, `/admin/car-types`, `/admin/app-settings`. Sub-resources via path (`/trips/{id}/applicants`) or query (`/trip-acceptances?trip_id=…`) — be consistent within a resource.
- **Verbs:** `GET` list/read, `POST` create, `PUT`/`PATCH` update, `DELETE` remove (or for lookup rows, prefer `PATCH {is_active:false}` over hard delete).
- **Query params (lists):** `?page=`, `?limit=`, `?sort=`, plus resource-specific filters (`?status=`, `?from_city_id=`). Server caps `limit`.
- **Response envelope** (same shape hudr-pwa uses):
  ```jsonc
  {
    "success": true,
    "data": [ /* … */ ],
    "meta": { "page": 1, "limit": 20, "total": 137, "pages": 7 },   // lists only
    "error": null
  }
  // on error:
  { "success": false, "data": null, "error": { "code": "NOT_FOUND", "message": "Trip not found" } }
  ```
- **HTTP status codes are meaningful:** 200/201 ok, 400 validation, 401 unauthenticated, 403 forbidden, 404 not found, 409 conflict, 422 semantic validation, 429 rate limited, 5xx server. The client wraps non-2xx into `ApiError(message, status, body)`.
- **Wire format is `snake_case`.** Domain types are `camelCase`. Transforms bridge it (§5.5).
- **Every endpoint is documented in OpenAPI** (`public/docs/openapi.yaml` + `.json`, served as Swagger UI) and updated **in the same PR** as the endpoint change. Edge functions get `withTiming()` performance instrumentation and a k6 load-test entry — same checklist TournamentPro uses for new edge functions.

### 5.2 The API client (`src/lib/api/client.ts`)
A single `ApiClient` class, exported as the `apiClient` singleton — copy hudr-pwa's almost verbatim:
- `get/post/put/patch/delete<T>(endpoint, …)` returning `Promise<ApiResponse<T>>`.
- Injects `X-API-Key` for public endpoints, `Authorization: Bearer` for authed ones.
- 401 → single-flight token refresh → retry.
- Errors → `ApiError`; 5xx and unexpected 4xx (not 401/404) → Sentry breadcrumb + capture; slow responses (>2 s) → PostHog event.
- `RETRY_ATTEMPTS = 3` for idempotent GETs only; `TIMEOUT = 30_000`.

### 5.3 Services (`src/lib/api/services/*.ts`)
Thin functions over `apiClient`, one file per resource, **verb-noun camelCase**:
```ts
// src/lib/api/services/trips.ts
export const getTrips = (params?: TripsQueryParams) =>
  apiClient.get<ApiTrip[]>('/trips', params).then(r => (r.data ?? []).map(transformTrip));
export const getTrip = (id: string) =>
  apiClient.get<ApiTrip>(`/trips/${id}`).then(r => transformTrip(r.data!));
export const postTrip = (input: PostTripInput) =>
  apiClient.post<ApiTrip>('/trips', toApiTripInput(input)).then(r => transformTrip(r.data!));
export const assignDriver = (tripId: string, acceptanceId: string) =>
  apiClient.post<ApiTrip>(`/trips/${tripId}/assign`, { acceptance_id: acceptanceId }).then(r => transformTrip(r.data!));
```
```ts
// src/lib/api/services/admin-config.ts  — the Administration master-data API
export const getCarTypes      = (opts?: { includeInactive?: boolean }) => apiClient.get<ApiCarType[]>('/admin/car-types', opts).then(r => (r.data ?? []).map(transformLookup));
export const createCarType    = (input: LookupInput) => apiClient.post<ApiCarType>('/admin/car-types', toApiLookup(input)).then(r => transformLookup(r.data!));
export const updateCarType    = (id: string, patch: Partial<LookupInput>) => apiClient.patch<ApiCarType>(`/admin/car-types/${id}`, toApiLookup(patch)).then(r => transformLookup(r.data!));
export const setCarTypeActive = (id: string, active: boolean) => apiClient.patch<ApiCarType>(`/admin/car-types/${id}`, { is_active: active }).then(r => transformLookup(r.data!));
// …same shape for fuel-types, vehicle-makes, vehicle-models, cities, languages, review-tags, cancel-reasons, seat-options
export const getAppSettings   = () => apiClient.get<ApiAppSettings>('/admin/app-settings').then(r => transformAppSettings(r.data!));
export const updateAppSettings = (patch: Partial<AppSettingsInput>) => apiClient.put<ApiAppSettings>('/admin/app-settings', toApiAppSettings(patch)).then(r => transformAppSettings(r.data!));
```

### 5.4 Hooks (`src/hooks/*.ts`) — React Query
One file per domain. Queries + mutations together. Example:
```ts
// src/hooks/useAdminConfig.ts
export function useCarTypes(opts?: { includeInactive?: boolean }) {
  return useQuery({ queryKey: ['admin', 'car-types', opts], queryFn: () => getCarTypes(opts), staleTime: 5 * 60_000 });
}
export function useCreateCarType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createCarType,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'car-types'] }),
  });
}
```
- **Query keys** are arrays, hierarchical, params-inclusive: `['trips', params]`, `['trip', id]`, `['admin', 'car-types']`.
- **Mutations**: optimistic update where it improves UX (e.g. toggling a favourite, re-ordering a list), always `invalidateQueries` on settle.
- **`enabled`** to guard on missing ids.

### 5.5 Transforms (`src/lib/api/transforms/*.ts`) — the strict-validation pattern
Transforms convert `snake_case` API payloads to `camelCase` domain types **and refuse to fabricate data**. Copy hudr-pwa's `HandTransformError` pattern:
```ts
export type TripTransformErrorCode = 'MISSING_FROM_CITY' | 'MISSING_FARE' | 'MISSING_STATUS' | 'BAD_PICKUP_DATE';
export class TripTransformError extends Error {
  constructor(message: string, public code: TripTransformErrorCode, public context: Record<string, unknown> = {}) {
    super(message); this.name = 'TripTransformError';
  }
}
export function transformTrip(api: ApiTrip): Trip {
  if (!api.from_city) throw new TripTransformError('Trip has no from_city', 'MISSING_FROM_CITY', { trip_id: api.id });
  if (api.total_fare == null) throw new TripTransformError('Trip has no total_fare', 'MISSING_FARE', { trip_id: api.id });
  // …
  return {
    id: api.id,
    fromCity: transformCity(api.from_city),
    toCity: transformCity(api.to_city),
    pickupAt: api.pickup_at,
    totalFare: api.total_fare,
    driverPayout: api.driver_payout,           // server-computed; never recomputed here
    status: api.status,
    // …
  };
}
```
- **Never compute money/state in a transform or component.** If the API didn't send `driver_payout` / `applicant_count` / `eligibility_status`, that's a backend bug — file it and fix the API, don't add a "fallback calculation" in the client (this is a hard rule we inherit from hudr-pwa's hand replayer).
- **Direction is one-way** in transforms; for writes, mirror helpers (`toApiTripInput`) convert `camelCase` → `snake_case`.

### 5.6 Auth flow (`src/contexts/AuthContext.tsx`)
- `useAuth()` → `{ user, isAuthenticated, isLoading, login, register, logout }`.
- On mount: if a stored `access_token` is expired, attempt refresh; success restores the session, failure clears tokens.
- `<ProtectedRoute>` wraps authed routes; `<AdminRoute>` additionally requires `user.role === 'admin'` and 403s otherwise (**the prototype has no admin guard — production must add one**).
- Phone-OTP login: `POST /auth/request-otp { phone }` → `POST /auth/verify-otp { phone, otp }` → token pair. (The prototype fakes this; production uses a real SMS provider.)

---

## 6. Caching strategy

Three layers, same as hudr-pwa:

### 6.1 React Query (in-memory, the primary one)
`QueryClient` `defaultOptions`:
```ts
queries: { staleTime: 5 * 60_000, gcTime: 30 * 60_000, refetchOnWindowFocus: false, retry: 1 }
```
Per-resource `staleTime` overrides:
| Data | `staleTime` | Why |
|---|---|---|
| Completed trips, finished reviews | `Infinity` | immutable |
| Open/`has_applicants` trip lists, vacancy feed, applicant lists | `30_000` | live; agents and drivers act on freshness |
| Admin master data (car types, cities, tags, settings, …) | `5 * 60_000` | changes rarely; invalidate on the admin mutation |
| Driver profile, agent profile, analytics | `60_000` | |
- Mutations `invalidateQueries` the affected keys (and any list that includes the entity).
- Use `queryClient.prefetchQuery` on hover/route-enter for detail pages.

### 6.2 Service worker (offline / network resilience — `vite-plugin-pwa` + Workbox)
- `/api/trips`, `/api/vacancies`, `/api/trip-acceptances`, `/api/trips/*/applicants` → **NetworkFirst** (always try fresh; fall back to cache offline).
- Other `/api/*` (incl. `/admin/*`) → **StaleWhileRevalidate**.
- Static assets/JS/CSS → **StaleWhileRevalidate**; images → **CacheFirst**.
- `registerType: 'autoUpdate'`, `skipWaiting + clientsClaim`.

### 6.3 Server / CDN
- Edge functions set `Cache-Control` headers on genuinely public, slow-changing responses (e.g. `/admin/car-types` could be `public, max-age=60`). Mutations bust it. Don't cache anything user-scoped or auth-dependent at the CDN.
- Hashed asset filenames get `Cache-Control: public, max-age=31536000, immutable` (already in `vercel.json`).

---

## 7. Administration — master-data catalog (the configurable types)

This is the heart of the Administration module. **Everything below is admin-editable** (add / rename / re-order / soft-disable; cities and settings also edit fields). Each is a DB table (§4.3) with a `/admin/*` REST resource (§5.3) and an admin UI screen.

### 7.1 Vehicle taxonomy

| # | Type | Table | Fields per row | Seed values | Used by |
|---|---|---|---|---|---|
| 1 | **Car types** | `car_types` | `label`, `sort_order`, `is_active` | Hatchback · Sedan · SUV · Innova · Tempo Traveller · Mini Bus | vehicle registration, trip posting (`car_type_id` required), trip feed filter, vacancy matching, alerts (`car_type_ids[]`) |
| 2 | **Fuel types** | `fuel_types` | `label`, `sort_order`, `is_active` | Petrol · Diesel · CNG · EV — **+ LPG (Indane)** | vehicle registration; future regulatory filters |
| 3 | **Vehicle makes** | `vehicle_makes` | `name`, `sort_order`, `is_active` | Maruti Suzuki · Hyundai · Tata · Toyota · Mahindra · Honda · Kia · Renault · MG · Ford (legacy) | vehicle registration (parent of models) |
| 4 | **Vehicle models** | `vehicle_models` | `make_id` (FK), `name`, `default_car_type_id` (FK, optional), `default_seats` (optional), `sort_order`, `is_active` | e.g. Maruti → Dzire, Swift, Ertiga; Toyota → Innova Crysta, Etios; Hyundai → Aura, Xcent; Honda → Amaze, City; Mahindra → Marazzo, Bolero | vehicle registration — **model dropdown is filtered by selected make**; selecting a model can pre-fill car type & seats |
| 5 | **Seat options** | `seat_options` | `value` (INT), `is_active`; optional `car_type_seat_options` join | 4 · 5 · 6 · 7 · 8 · 9 · 12 · 15 | vehicle registration, trip `seats_required`, matching |

### 7.2 Geography

| # | Type | Table | Fields per row | Seed values | Used by |
|---|---|---|---|---|---|
| 6 | **Cities (service area)** | `cities` | `name`, `state`, `lat`, `lng`, `is_active` | Vellore · Chennai · Pondicherry · Bangalore · Tirupati · Salem · Coimbatore (extend) | home/current/business city, trip `from`/`to`, vacancy origin & destinations, alert geofences. **lat/lng are mandatory** — radius matching depends on them. |

### 7.3 Localisation

| # | Type | Table | Fields per row | Seed values | Used by |
|---|---|---|---|---|---|
| 7 | **Languages** | `languages` | `code` (PK), `native_name`, `english_name`, `is_active` | en (English) · ta (தமிழ் / Tamil) · hi (हिन्दी / Hindi) | user `preferred_language`, the language switcher, the translation-coverage admin screen |

### 7.4 Vocabularies (controlled tag/picklist sets)

| # | Type | Table | Fields per row | Seed values | Used by |
|---|---|---|---|---|---|
| 8 | **Review tags — passenger → driver** | `review_tags` (`category='passenger_to_driver'`) | `label`, `sentiment` (positive/neutral/negative), `sort_order`, `is_active` | Punctual · Clean car · Polite · Safe driver · Knew the route · (neg) Late · Rude · Reckless | passenger review form; aggregated onto `drivers.top_tags`, shown on driver profile |
| 9 | **Review tags — agent → driver** | `review_tags` (`category='manager_to_driver'`) | same | Punctual · No no-shows · Reachable · Reliable · Professional · (neg) Cancelled · Unreachable | agent's post-trip rating of a driver; aggregated onto `drivers.manager_top_tags` |
| 10 | **Review tags — driver → agent** | `review_tags` (`category='driver_to_manager'`) | same | Pays on time · Clear instructions · Fair bata · Easy to reach · (neg) Late payment · Vague details | driver's rating of an agent; aggregated onto `trip_managers.top_tags` |
| 11 | **Cancellation reasons** | `cancel_reasons` | `label`, `applies_to` (agent/driver/both), `sort_order`, `is_active` | (agent) Passenger cancelled · Trip no longer needed · No suitable applicants · Posted by mistake · (driver) Vehicle breakdown · Personal emergency · Double-booked · (both) Weather/road closure · Fare dispute | replaces the free-text `prompt()` on trip cancel; feeds the agent-analytics "most cancelled routes" |

### 7.5 Platform settings (single-row config)

| # | Setting | Column | Default | Effect |
|---|---|---|---|---|
| 12 | Minimum vehicle year | `app_settings.min_vehicle_year` | 2015 | a vehicle older than this is `expired` (derived `eligibility_status`); blocks new registrations |
| 13 | Vehicle expiry warning window | `app_settings.vehicle_expiry_warning_days` | 90 | when to start warning the driver (90/30/7-day notifications) |
| 14 | Default alert radius (km) | `app_settings.default_alert_radius_km` | 25 | pre-fills the radius on a new alert |
| 15 | Default commission % | `app_settings.default_commission_pct` | 10 | pre-fills the Post-a-trip form |
| 16 | Default GST | `app_settings.default_gst_pct` | 5 (₹ flat or %? — decide and document) | pre-fills the Post-a-trip form |
| 17 | Default driver bata (₹) | `app_settings.default_driver_bata` | 300 | pre-fills the Post-a-trip form |
| 18 | Default "extras paid by passenger" | `app_settings.default_extras_paid_by_passenger` | true | pre-fills the Post-a-trip form |
| 19 | Default driver instructions | `app_settings.default_driver_instructions` | (multi-line template) | pre-fills the Post-a-trip form's instructions textarea |

### 7.6 What is NOT admin-configurable (system enums — fixed in code + a `CHECK` constraint)

Document these so the dev team doesn't accidentally build CRUD for them:

| Enum | Values | Why fixed |
|---|---|---|
| `users.role` | `driver` · `trip_manager` · `admin` | wired into auth, RLS, routing |
| `trips.status` | `open` · `has_applicants` · `assigned` · `in_progress` · `completed` · `cancelled` | a state machine with server-side transition rules |
| `trip_acceptances.status` | `applied` · `selected` · `rejected` · `withdrawn` · `expired` | application lifecycle |
| vehicle `eligibility_status` (derived, not stored) | `eligible` · `expiring_soon` · `expired` | computed from `year` vs `min_vehicle_year` |
| `kyc_status` | `pending` · `docs_submitted` · `video_pending` · `approved` · `rejected` · `resubmit_required` | KYC workflow states |
| `notifications.type` | `alert_match` · `kyc_status_change` · `trip_assigned` · `trip_cancelled` · `trip_completed` · `review_received` | each maps to a code path that builds the payload |
| `reviews.direction` | `passenger_to_driver` · `manager_to_driver` · `driver_to_manager` | |
| `vacancies.status`, `alerts` notify channels | … | system |

If we ever need a configurable workflow state, that's a bigger design change — not a v1 lookup table.

### 7.7 Admin module — screens & endpoints

- **`/administration`** — dashboard hub. Add a **"Reference data"** (or "Configuration") tile alongside the existing KYC / Drivers / Vehicles / Translations tiles, with a sub-count ("12 lists · last edited 2 d ago").
- **`/administration/config`** — the master-data manager. Layout: a left rail (or top tabs on mobile) listing the lists — *General settings · Car types · Fuel types · Vehicle makes & models · Seat options · Cities · Languages · Review tags · Cancellation reasons*. Each list:
  - a sortable table of rows (drag handle for `sort_order`),
  - inline **edit** (or a small **Dialog** form for multi-field rows: cities, models, languages),
  - **Add** button → form,
  - **Active** toggle (soft-disable; greyed-out rows still shown to admin),
  - **Delete** only if unreferenced (the API returns 409 with a count if it's in use; the UI then offers "disable instead").
  - For **Vehicle makes & models**: a master-detail — pick a make on the left, manage its models on the right; deleting a make with models is blocked.
  - For **General settings**: a plain form (the 8 `app_settings` fields) with Save/Reset and validation (e.g. `min_vehicle_year` ≥ 2000, `commission_pct` 0–30).
- **Endpoints:** `GET/POST /admin/<list>`, `PATCH/DELETE /admin/<list>/{id}`, `GET/PUT /admin/app-settings`, `PATCH /admin/<list>/reorder` (array of ids). All require `role=admin`. All log an audit row (`admin_audit_log(actor_user_id, action, entity, entity_id, before_json, after_json, created_at)` — add this table).
- **Every change is invalidation-aware:** an admin edit invalidates the corresponding `['admin', '<list>']` query *and* any consumer query that embeds the value (e.g. editing a city invalidates trip lists). Simplest: bump a `referenceDataVersion` query the public endpoints echo, and have clients key public queries on it — or just accept a short `staleTime` on the public lookup endpoints.

---

## 8. Frontend coding standards (the "highly optimised" part)

- **TypeScript strict** (`strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `noImplicitReturns`). No `any` — use `unknown` + a type guard. No non-null `!` except right after a guard.
- **Components:** function components, typed props interface, named export + default export. `React.memo()` for expensive list rows / tables / charts. Co-locate sub-components in the same file until they're reused, then promote to `components/<feature>/`.
- **Hooks:** `useXxx`, return a single value or a typed object (`UseXxxReturn`). One data-domain hook file per resource. No data fetching in components — always via a hook.
- **State:** server state → React Query; ephemeral UI state → `useState`; cross-component client state → Zustand (one store per concern, persisted only when it must survive reload). Don't put server data in Zustand.
- **No business logic in the browser** — see §5.5.
- **Loading/empty/error are first-class:** every data view renders a `LoadingSkeleton` while pending, an `ErrorState` ("Couldn't load …" + retry) on error, an `EmptyState` when the list is empty. **Partial loading** — refreshing a section refreshes only that section, never the whole page (carry over the TournamentPro rule), with a themed inline overlay.
- **Performance:** code-split by route (`React.lazy`); split vendor chunks (react / react-query / radix / charts) in Vite; lazy-load images; debounce search inputs (300 ms); virtualise lists > ~100 rows; never `useMemo`/`useCallback` reflexively — only where it measurably matters.
- **Accessibility:** semantic HTML, `aria-*` on dialogs (`role="dialog" aria-modal`), focus trap + Escape + body-scroll-lock on modals (the prototype's `ShareTripModal` is the pattern), `aria-label` on icon-only buttons, keyboard-operable everything.
- **Styling:** Tailwind; design tokens via CSS variables; no inline magic numbers — use the `ui/` primitives.
- **Errors & observability:** wrap the app in `<ErrorBoundary>`; Sentry on render errors and on API failures (skip 401/404 as user errors); PostHog for product analytics + slow-API + rage-clicks.
- **Tests (vitest + Testing Library):** required for every new hook, utility, service and bug fix; `__tests__/` folder beside the source; a regression test that would have caught the bug. `tsc --noEmit` + `npm run test:run` + `npm run build` are the pre-push gate (Husky).
- **i18n from day one:** all user-facing strings via `t('key')`; never concatenate translated fragments; the `languages` lookup table drives the available locales.
- **PWA:** `vite-plugin-pwa`, the Workbox config in §6.2, `safe-area-inset-*` padding for notched phones, "Add to Home Screen" affordance.
- **Commit discipline:** one logical change per commit; review `git diff --stat` before committing; never bundle an unrelated "improvement"; conventional-ish commit messages (`feat:`, `fix:`, `refactor:`, `chore:`).
- **OpenAPI is part of the PR:** any edge-function change updates `public/docs/openapi.yaml` + `.json` and adds a k6 load-test entry + a `scripts/test-*.cjs` smoke test (the TournamentPro "new edge function" checklist).

---

## 9. Delivery phases (suggested)

1. **Foundations:** repo scaffold (the §3 layout), `apiClient`, `AuthContext`, React Query setup, Sentry/PostHog, PWA, CI (tsc + tests + build), Supabase project + RLS skeleton.
2. **Reference data backend + Admin module:** the §4.3 lookup tables + `/admin/*` endpoints + the `/administration/config` UI + `admin_audit_log`. Migrate the prototype's hard-coded unions/defaults into seed data. *(This is the slice the current request is about.)*
3. **Core marketplace:** drivers, agents, vehicles (using the FK lookups), trips (post / browse / apply / assign / OTP / execute), vacancies, alerts, reviews — replacing every mock.
4. **Admin operations:** KYC queue + video, vehicle eligibility, translation manager (wired to `languages`), reviews moderation.
5. **Analytics:** agent analytics, admin dashboards — server-computed.
6. **Hardening:** load tests, perf pass, a11y audit, security review (RLS coverage, rate limits, admin guards).

---

## 10. Definition of done (per feature)

- API endpoint + OpenAPI doc + RLS policy + indexes + `ANALYZE`.
- Service + transform (with strict validation) + hook + tests.
- UI with loading / empty / error states + a11y.
- `tsc --noEmit`, `npm run test:run`, `npm run build` all green.
- Mock data path removed (no `import … from '@/data/mockData'` in production code).
- For admin/master-data changes: audit-logged, cache invalidation wired, consumers updated.

---

*This document describes the production target. The current repo is a clickable prototype: it demonstrates the flows and (as of this document) the Administration → Reference-data UI, but it stores everything in `localStorage` via Zustand stores and hard-coded `mockData`. Treat the prototype as the UX spec; treat this document as the engineering spec.*
