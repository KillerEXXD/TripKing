# Dispatch Implementation Plan & Spec — Platform Algorithm Toggle ("I'm Online" Auto-Dispatch vs Manual)

> **Authoritative spec.** Supersedes the earlier draft. Confirmed with the owner via a requirements Q&A on 2026-05-21. Tour explainer (owner-reviewed visual): `KillerEXXD/TripKing-tour` → `/prototype/dispatch`.

The platform runs **one of two dispatch algorithms at a time**, chosen by a single **Admin toggle**:

- **Auto-dispatch** (the launch default) — drivers go **"I'm Online"** (pure presence + GPS); a posted trip is auto-offered to the nearest online drivers in global-token order, 60 s each, walking the queue, widening + retrying on exhaustion. **No applicants, no manual picking.**
- **Manual** (today's behaviour) — drivers post **"I'm vacant"** vacancies and/or browse + **apply**; the agent **picks** an applicant. Exactly the current flow.

The driver's availability UI and the agent's trip surfaces **swap based on the active algorithm.** This is a **full re-architecture** behind a unified abstraction — not a parallel bolt-on.

---

## 0. Decisions (locked)

| # | Decision | Choice |
|---|---|---|
| 1 | Toggle scope | **Global only.** One platform switch; everyone uses the selected algorithm. |
| 2 | Launch default | **Auto** from the start. |
| 3 | Refactor depth | **Unified `DriverAvailability` + `DispatchStrategy` abstraction**; Manual & Auto are two strategies behind one interface. No duplication. |
| 4 | 60 s advancement | **DB-authoritative deadline + Realtime/on-read advance + 1-min `pg_cron` safety net**, `FOR UPDATE SKIP LOCKED`. |
| 5 | Offer delivery | **Realtime (in-app) + Push.** Provider = **FCM**, behind a provider-agnostic push interface. |
| 6 | Driver runtime | **PWA now, native-ready later** — presence/heartbeat/push abstracted so a native wrapper can add background GPS + FCM without a rewrite. |
| 7 | Apply in Auto | **Removed.** The timed offer is the only path; the agent sees live dispatch status, not applicants. Apply/vacancy exist only in Manual. |
| 8 | Live queue depth | **Dispatch events realtime** (offers, status, missed, notifications). The driver's "X of N nearby" is **best-effort** (~10 s poll / on focus), not pushed per join/leave. |
| 9 | Toggle flip behaviour | **Drain gracefully** — new trips use the new mode; in-flight trips/offers/vacancies finish in their original mode; admin sees a live "still draining: N" count + confirm. |
| 10 | Complete → re-join | **Auto re-online with a fresh token at the drop location**; driver can tap Offline. |
| 11 | Unfilled fallback | **Cooldown + auto-retry.** Exhausting the radius enters a `waiting` state; auto-retry after a configurable cooldown (~2 min), up to max retries; then mark **Unfilled** + notify the agent, who can **Re-broadcast** or cancel. (Best logical approach: drivers are busy → re-scan in a few minutes as drivers free up / come online.) |

**Inviolable (CLAUDE.md §0):** no business logic/state in the browser; everything server-side; services → transforms → hooks; **Realtime is a signal, not a source** (PR #324 carve-out — payloads ignored, only `invalidateQueries`); tests in the same commit; OpenAPI + smoke per edge-fn change.

---

## 1. The unified abstraction (the heart of the refactor)

Two seams, each with one interface and two implementations selected by `app_settings.dispatch_algorithm`:

### 1a. `DriverAvailability` (how a driver signals they can work)
- **Auto → Presence**: `driver_presence` row, GPS heartbeat, global token. UI = **`<OnlineToggle>`**.
- **Manual → Vacancy**: existing `vacancies` + browse/apply. UI = the current **PostVacancy / browse** screens.
- One hook **`useDriverAvailability()`** reads the platform algorithm and renders the right surface; one driver page, two bodies.

### 1b. `DispatchStrategy` (how a posted trip reaches a driver)
A server-side interface (shared module `supabase/functions/_shared/dispatch/`):
```ts
interface DispatchStrategy {
  onTripPosted(trip): Promise<void>;       // auto: start_dispatch();  manual: invite nearest + open for applicants
  onTripCancelled(trip): Promise<void>;    // release holds / offers / invites
  findCandidates(trip, radiusKm): …;       // auto: online_drivers_in_radius (token order); manual: vacancy/alert match
}
```
`POST /trips` resolves the active strategy from `app_settings` (with the trip's frozen `dispatch_mode` for drain) and delegates. **Auto and Manual converge at `trips.assigned_*` + `trip_acceptances(status='accepted')`**, so `/start`, `/complete`, `/cancel`, OTP, live tracking, payout/commission, reviews are **unchanged for both**.

> Each trip **freezes the algorithm it was posted under** in `trips.dispatch_mode` (set at POST from the then-current `app_settings.dispatch_algorithm`). That is what makes "drain gracefully" work: the strategy is chosen per trip from its frozen mode, never re-read mid-flight.

---

## 2. Real-time architecture (building on PR #324)

PR #324 gave us `src/lib/realtime.ts` (one lazy transport client, `isRealtimeConfigured()` no-op fallback), the **`CHANNELS` registry** in `src/hooks/useRealtimeSubscriptions.ts` ("a live surface = one row"), token-sync via `apiClient.onTokenChange`, and migration `063_realtime_publication.sql` (publication + `REPLICA IDENTITY FULL` on `trips`/`trip_acceptances`/`vacancies`/`notifications`). **Signal-not-source** is preserved: every dispatch surface still refetches through the REST/transform layer.

**Dispatch plugs in as new `CHANNELS` rows + publication additions:**

| Surface | Table → channel | Invalidates | Notes |
|---|---|---|---|
| Driver incoming offer | `trip_offers` (RLS: offered-driver/poster/admin) | `['offeredTrips']`, `['trip', tripId]` | Sub-second offer arrival; countdown is client-side off `offer_deadline_at`. RLS scopes to the offered driver (no filter needed, like `trip_acceptances`). |
| Agent live dispatch status | `trips` (already live, `posted_by_user_id` filter) | `['trip', id]`, `['trips']` | `dispatch_status`/`current_offer_*` changes already push to the posting agent — `<DispatchStatusPanel>` updates live **for free**. |
| Unfilled / offer notifications | `notifications` (already live) | `['notifications']` | New `trip_unfilled` / `trip_offer` types land live. |

`driver_presence` is **not** added to the publication (best-effort position per decision #8 → light poll), keeping event volume down. New migration adds `trip_offers` to `supabase_realtime` + `REPLICA IDENTITY FULL`.

**Offer-advance loop** (decision #4): deadline in DB → on expiry, the next viewer read (driver poll ~3 s, agent realtime-invalidated refetch) OR the 1-min cron calls `advance_dispatch` → it updates `trips`/`trip_offers` → Realtime pushes → clients refetch. With an active driver/agent watching, advancement is effectively sub-second; the cron only covers the no-viewer tail.

---

## 3. Data model (migrations 064 → 070; 063 is taken by Realtime)

- **064 — `app_settings` toggle + tunables** (behaviour-neutral):
  `dispatch_algorithm text not null default 'auto' check (in ('auto','manual'))`; plus `dispatch_offer_seconds` (60), `dispatch_offline_grace_seconds` (180), `dispatch_initial_radius_km` (3), `dispatch_radius_widen_km` (10), `dispatch_max_passes` (2), `dispatch_retry_cooldown_seconds` (120), `dispatch_max_retries` (3), `dispatch_heartbeat_stale_seconds` (90). All admin-editable + audit-logged.
- **065 — `create sequence driver_token_seq`.**
- **066 — `driver_presence`** (one row/driver): `is_online`, `token bigint`, `online_since`, `last_heartbeat_at`, `current_lat/lng`, `current_city_id`, `went_offline_at`, `grace_expires_at`, `vehicle_id`, `busy_trip_id`, generated `geog` (mirror `drivers.geog` from 011), `update_updated_at` trigger. Indexes: `(token) where is_online`, `(grace_expires_at) where not null`, GiST `(geog)`, `(busy_trip_id) where not null`. RLS: owner-or-admin; never exposed raw to other drivers.
- **067 — `trips` dispatch columns** (additive, mirror 030): `dispatch_mode text default 'auto' check(in('auto','manual'))` (frozen at POST), `dispatch_status text check(in('searching','offering','widening','waiting','filled','unfilled'))`, `current_offer_driver_id`, `current_offer_token bigint`, `offer_deadline_at`, `current_radius_km`, `pass_number int default 0`, `retry_count int default 0`, `next_retry_at timestamptz`. Partial index on active dispatch statuses.
- **068 — `trip_offers`** (offer log; drives Missed list + one-live-offer rule) + add to `supabase_realtime` + `replica identity full`. Cols: `trip_id`, `driver_id`, `token_at_offer`, `pass_number`, `offered_at`, `deadline_at`, `status check(in('offered','accepted','declined','missed','superseded'))`, `responded_at`, `unique(trip_id,driver_id,pass_number)`. Indexes: `(trip_id,pass_number)`, `(driver_id,status)`, `(driver_id) where status='offered'`. RLS: offered-driver/poster/admin SELECT; writes service-only.
- **069 — dispatch engine** (RPCs + cron, §4).
- **070 — push + notification types**: `device_tokens` (`user_id`, `token`, `platform`, `created_at`, `last_seen_at`, unique on token) for FCM; extend `notifications.type` CHECK with `trip_offer`, `trip_unfilled`.

`ANALYZE` after each.

---

## 4. Server logic — RPCs (migration 069, `security definer`)

| RPC | Purpose |
|---|---|
| `driver_go_online(driver, vehicle, lat, lng)` | Grace-resume (keep token if `grace_expires_at > now()`) else fresh `nextval('driver_token_seq')`. Gate `is_active` + KYC `approved`. **No-op/blocked when `dispatch_algorithm='manual'`.** |
| `driver_heartbeat(driver, lat, lng)` | Refresh heartbeat + GPS + nearest city; also write `drivers.current_lat/lng/current_location_at` (keeps live-tracking + `drivers_in_radius()` working). |
| `driver_go_offline(driver)` | `is_online=false`, set `grace_expires_at = now()+grace`. Token retained. |
| `online_drivers_in_radius(lat,lng,radius_m)` | `is_online AND fresh heartbeat AND grace not active AND busy_trip_id is null AND st_dwithin(...)`, **ordered by `token` asc**. |
| `start_dispatch(trip)` | `dispatch_status='searching'`, `current_radius_km = dispatch_initial_radius_km`, then `advance_dispatch`. |
| `advance_dispatch(trip)` | **Engine.** `FOR UPDATE SKIP LOCKED`. Expire current offer → `missed`. Pick next online driver by token in radius **with no live offer on any trip** & not yet offered this pass → `trip_offers(offered)` + `current_offer_*` + `offer_deadline_at = now()+offer_seconds`, status `offering`. No candidate → widen radius, `pass_number++`, `widening`. Passes exhausted → enter `waiting`, set `next_retry_at = now()+retry_cooldown`, `retry_count++`. `retry_count > max_retries` → `unfilled` + `trip_unfilled` notification. |
| `dispatch_retry_due()` | Cron: for trips in `waiting` with `next_retry_at < now()`, reset radius + `pass_number` and `advance_dispatch` (the auto-retry). |
| `expire_offline_grace()` | Cron: `is_online=false` + `token=null` for `grace_expires_at < now()`; flip `is_online=false` (→grace) for stale heartbeats. |
| `dispatch_sweep()` | Cron: `advance_dispatch` for trips in `searching/offering/widening` (no-viewer safety net). |

Crons (mirror 031 guard): `dispatch_sweep`, `dispatch_retry_due`, `expire_offline_grace` — each `* * * * *`.

**Edge-fn handlers** (call SQL):
- `POST /drivers/online|offline|heartbeat`, `GET /drivers/presence` (in `functions/drivers`).
- `POST /trips/:id/offer-accept` — validate caller==`current_offer_driver_id` && not expired → `trip_offers.accepted` + `trip_acceptances(accepted)` + `trips.assigned_*` + `dispatch_status='filled'` + OTP (reuse `/accept`) + `driver_presence.busy_trip_id=trip`. Superseded → `409`.
- `POST /trips/:id/offer-decline` — `trip_offers.declined` + `advance_dispatch`; no token change.
- `POST /trips/:id/rebroadcast` (poster/admin) — restart dispatch (radius 0, retry_count 0), only for `unfilled` auto trips.
- Extend `/complete` & `/cancel`: clear `busy_trip_id`; on `/complete` → **auto re-online with a fresh token at the drop GPS** (calls `driver_go_online` server-side with the completion location).
- `POST /trips` kickoff: freeze `dispatch_mode` from `app_settings.dispatch_algorithm`; delegate to the resolved `DispatchStrategy` (auto → `start_dispatch`; manual → existing invite + applicants). **`KYC_REQUIRED`/rate-limit gates unchanged.**
- `GET /trips`: opportunistic `advance_dispatch` before shaping; expose `dispatch_*` + computed `dispatch_offer_index`/`dispatch_candidate_count`; `?offered=me` (live offer) + Missed list (`trip_offers` `missed`/`declined`).

---

## 5. Push (FCM, provider-abstracted) — decision #5/#6

- **Client**: a `usePush()` hook + a `firebase-messaging-sw.js` service worker; request permission when a driver first goes Online; register the FCM token → `POST /devices` (`device_tokens`). Abstracted behind a `PushProvider` interface so a native FCM/APNs path swaps in later.
- **Server**: a `_shared/push` sender (FCM HTTP v1 with a service-account key in function secrets). Fired alongside the Realtime/notification write on **new offer** (`trip_offer`) and **unfilled** (`trip_unfilled`). Realtime remains the in-app fast path; push covers backgrounded/locked drivers within the 60 s window.
- **Prereq PR**: Firebase project + `VITE_FIREBASE_*` (Vercel) + `FCM_SERVICE_ACCOUNT` (function secret). Until set, push is a no-op (like `isRealtimeConfigured()`), app still works via Realtime.

---

## 6. Frontend (unified, mirrors hudr-pwa layering)

- **Platform algorithm**: `useDispatchAlgorithm()` (reads a small public `GET /config` / `app_settings` projection; `STALE.master`; invalidated by the admin toggle + a `referenceDataVersion`). Drives every swap below.
- **Types** (`src/types/`): `presence.ts` (`DriverPresence` — **no `token` exposed**, `PresenceStatus='online'|'grace'|'offline'`), `tripOffer.ts`; extend `Trip` (`dispatchMode`, `dispatchStatus`, `currentOfferDriverId?`, `offerDeadlineAt?`, `currentRadiusKm?`, `passNumber?`, `retryCount?`, computed `dispatchOfferIndex?`/`dispatchCandidateCount?`); `PostTripInput` drops any mode field (frozen server-side from platform setting).
- **Transforms/services/hooks**: `presence` + `tripOffer` transforms (strict); `presence.ts` service (`goOnline/goOffline/sendHeartbeat/getPresence`) + `devices.ts`; `usePresence`, `useHeartbeat` (watchPosition ~30 s foreground, tab-hidden pause, permission-denied handling), `useIncomingOffer` (Realtime-invalidated; ~3 s poll fallback), `useOfferAccept/useOfferDecline`, `useOfferedTrips` (Missed), `usePush`.
- **`CHANNELS` registry**: add the `trip_offers` row (§2). One-line additions.
- **UI swaps (driven by `useDispatchAlgorithm()`):**
  - Driver availability page → **Auto: `<OnlineToggle>`** (3-state badge + grace countdown + GPS/permission prompts); **Manual: existing PostVacancy/browse**.
  - Trip detail (agent) → **Auto: `<DispatchStatusPanel>`** ("Offering to driver 3 of 8 — 42 s", "Widening…", "Waiting — retry in 1:30", "Unfilled · Re-broadcast"); **Manual: existing `<ApplicantsList>`**.
  - Trip card → `<DispatchBadge>` ("Finding driver…"/"Waiting"/"Unfilled"/"Filled") in Auto.
  - `<IncomingOfferModal>` (driver) — 60 s ring (tour's `AcceptRing` is the reference) + Accept/Decline.
  - Driver "Missed Trips" tab (Auto) replaces the vacancy "My Available" tab.
- **Caching**: presence ~10 s; offered-trips ~3 s + Realtime; dispatching trips ~3-4 s + Realtime. Workbox: presence/offer → NetworkFirst.

---

## 7. Admin toggle + drain (decisions #1/#9)

- `/administration/config` → a **Dispatch** section: the **algorithm toggle** (Auto / Manual) + the 8 tunables, all audit-logged via `admin_audit_log`. `PUT /admin/app-settings`.
- **Flip = drain**: new trips freeze the new mode; in-flight (`searching/offering/widening/waiting` trips, live `trip_offers`, active `vacancies`) finish in their original mode. The toggle UI shows a **confirm dialog with a live "still in old mode: N trips / M offers / K vacancies" count** and a banner until the drain completes. No forced cancellation.
- Switching **to Manual**: new drivers see the vacancy UI; presence rows stop being offered (existing online drivers drain). Switching **to Auto**: new drivers see `<OnlineToggle>`; open Manual trips finish via applicants.

---

## 8. Tests (same commit; `docs/TEST_POLICY.md`)

- **Unit**: transforms throw-on-missing (`presence`, `tripOffer`); `usePresence`/`useIncomingOffer`/`useDispatchAlgorithm` (`renderHook`); grace countdown + "X of N" formatting; the strategy router (auto vs manual selection + frozen-mode drain).
- **Component/integration** (+`axe`): `<OnlineToggle>` 3-state, `<IncomingOfferModal>` 60 s expiry→advance, `<DispatchStatusPanel>` states, the availability-page swap by algorithm.
- **Realtime**: extend PR #324's subscription-mapping tests with the `trip_offers` row (INSERT/UPDATE id-scoping → `['offeredTrips']`), no-op when unconfigured.
- **Contract/smoke**: `scripts/test-dispatch.cjs` — go-online ascending tokens; auto post → lowest-token offer; lapse → advance + missed; accept → assigned + OTP + busy; exhaust → waiting → auto-retry → unfilled + notification; grace expiry → token cleared; complete → auto re-online new token; **toggle flip drains** (old trip stays manual, new trip auto).
- **E2E** (Playwright, real-API mints): driver online → offer (Realtime) → accept → complete → re-join; agent posts → live status → filled; **two-session Realtime** (offer appears <2 s, no refresh) per the PR #324 QA card.
- Husky gate: `tsc --noEmit` + `test:coverage` + `check-tests-required.cjs` + `build`.

---

## 9. PR sequence (PR-sized; pause for review)

1. **Schema only** (064-068, behaviour-neutral). Migration smoke.
2. **Unified availability seam + Admin toggle** — `app_settings.dispatch_algorithm`, `useDispatchAlgorithm()`, admin Dispatch section, the `DispatchStrategy` interface with Manual delegating to today's code (no behaviour change yet; Auto = stub). Proves the seam.
3. **Presence backend + `<OnlineToggle>`** — drivers go online (3-state grace), heartbeat, `driver_presence`. `scripts/test-presence.cjs`.
4. **Dispatch engine** — `start/advance/retry/sweep/expire` RPCs + crons, AutoStrategy on `POST /trips`, offer-accept/decline, on-read advancement, busy/auto-re-join. `scripts/test-dispatch.cjs` + OpenAPI + k6.
5. **Realtime + driver offer UX** — `trip_offers` publication + `CHANNELS` row, `<IncomingOfferModal>`, `useIncomingOffer`, Missed Trips tab.
6. **Agent live status** — `<DispatchStatusPanel>`, `<DispatchBadge>`, `rebroadcast`, drain UI.
7. **Push (FCM)** — `device_tokens`, SW, `usePush`, server sender; offer + unfilled pushes.
8. **Flip default to Auto + retire/guard Manual-only UI** (vacancy screens become Manual-only). Drain hardening.

---

## 10. Verification

- **Migrations** `064-070` via `scripts/db.cjs`; confirm `dispatch_algorithm`, `driver_token_seq`, `driver_presence`, `trip_offers` (+ in `supabase_realtime`), dispatch columns, `device_tokens`; `ANALYZE`.
- **Presence/Dispatch/Drain/Re-join/Unfilled-retry**: per §8 smoke + the existing `/smokeall`.
- **Realtime two-session** (after Vercel `VITE_SUPABASE_*` are set — already required by PR #324): driver online in A, agent posts in B → offer modal in A < 2 s, status panel in B live; block WS → polling still advances.
- **Push**: with Firebase env set, backgrounded driver gets the offer push within the window.
- **Gate**: `typecheck` + `test:run` + `build` + `scripts/test-dispatch.cjs` green.

---

## 11. Prerequisites & open items

- **Vercel env** `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` must be set for Realtime (PR #324's pending step) — dispatch's live feel depends on it; without it everything still works on polling.
- **Firebase/FCM** project + web config + service-account secret (PR 7). Provider-abstracted, so non-blocking for PRs 1-6.
- **iOS web push** only works for installed PWAs (16.4+); native wrapper (decision #6) is the long-term answer — layer is abstracted for it.
- **Background GPS** on web is foreground-only; grace timeout (3 min) is the cushion. Native wrapper later for true background presence.
- **`notifications.type`** gains `trip_offer` + `trip_unfilled` (migration 070).

*Memory spec: `project-online-token-dispatch.md`. This doc is the build plan of record.*
