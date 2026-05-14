# Trip Types + Waypoints + Multi-Day Trips — Implementation Plan

Branch: `feat/trip-types`. Worktree: `c:\Apps\TripKing-trip-types`. Target merge: PR into `main` after Phase 6 ships green.

## Product spec (recap)

- **Three types**: `one_way` (A→B), `round_trip` (A→…→A), `multi_way` (A→B→C→D…).
- **Stops are orthogonal** — any type can have intermediate waypoints. A round trip with stops is just `[A, stop, B, stop, A]`.
- **Multi-day** — a trip carries `pickup_at` (start) AND `expected_end_at` (end). The driver is committed for the entire span. `driver_bata` becomes per-day.
- **All pricing server-side.** Total fare = sum of leg distances × rate + per-day bata × days + wait charges − commission − GST.

## Data model

A trip = an ordered list of waypoints connected by legs.

```
trip_waypoints (
  id, trip_id, seq, city_id?, place_id?,
  arrive_at?,        -- expected arrival (NULL on seq=0; trip.pickup_at is the origin time)
  wait_minutes,      -- 0 for terminal-only, hours/days for overnight stops
  is_destination,    -- agent's marker (vs a transit waypoint)
  notes
)
```

The trip's `from_city_id` / `to_city_id` / `from_place_id` / `to_place_id` / `expected_end_at` are denormalized from the first + last waypoint via a trigger.

## Phase 1 — DB schema (THIS COMMIT)

**Migration 024** (`supabase/migrations/024_trip_types_and_waypoints.sql`):
1. `ALTER TABLE trips ADD COLUMN trip_type text NOT NULL DEFAULT 'one_way'` + CHECK in (`one_way`, `round_trip`, `multi_way`).
2. `ALTER TABLE trips ADD COLUMN expected_end_at timestamptz NULL` + CHECK `> pickup_at`.
3. `ALTER TABLE trips RENAME COLUMN driver_bata TO driver_bata_per_day` (semantics already per-day in admin config — just renaming the column to match).
4. `CREATE TABLE public.trip_waypoints (...)` with `UNIQUE(trip_id, seq)` and a `(city_id IS NOT NULL OR place_id IS NOT NULL)` CHECK.
5. Indexes: `(trip_id, seq)`, `(city_id)`, `(place_id)`.
6. **Trigger** `trip_waypoints_mirror_trip()` on `trip_waypoints` (AFTER INSERT/UPDATE/DELETE): recomputes `trips.from_*`, `trips.to_*`, `trips.expected_end_at` for the affected `trip_id` from the min/max-seq rows. Idempotent.
7. **Backfill**: for every existing `trips` row, insert 2 waypoint rows (seq=0 = from_*, seq=1 = to_*); `arrive_at = pickup_at` (best estimate), `wait_minutes = 0`. Set `expected_end_at = pickup_at + interval '1 day'` as a safe default. `trip_type = 'one_way'` (already the default).
8. **Per-day bata semantics**: update `driver_payout` trigger to multiply `driver_bata_per_day` by `ceil(extract(epoch from (expected_end_at - pickup_at)) / 86400)`. Existing rows: `expected_end_at` is `pickup_at + 1 day` so the multiplier is 1 — payouts unchanged.
9. `app_settings` adds: `wait_rate_per_min` (default 5 ₹/min), `max_trip_duration_days` (default 14).
10. RLS: `trip_waypoints` reads = anyone who can read the parent trip; writes = poster/admin only (a function that delegates to `trips` ownership).

**Verify Phase 1:**
- `node scripts/db.cjs "select count(*) from trip_waypoints"` — should equal `2 × count(trips)`.
- `node scripts/db.cjs "select trip_type, count(*) from trips group by trip_type"` — all rows `one_way`.
- `node scripts/db.cjs "select id, from_city_id, expected_end_at from trips limit 5"` — populated.

**Commit:** `feat(trips): migration 024 — trip_type + waypoints + multi-day duration`

---

## Phase 2 — Edge function (trips)

**File:** `supabase/functions/trips/index.ts`.

1. `POST /trips` accepts:
   ```ts
   {
     trip_type: 'one_way' | 'round_trip' | 'multi_way',
     waypoints: Array<{ city_id?, place_id?, arrive_at?, wait_minutes?, is_destination?, notes? }>,
     pickup_at: timestamptz,
     expected_end_at?: timestamptz,   // server computes if omitted (last waypoint arrive_at + wait)
     rate_per_km, driver_bata_per_day, ... (today's other inputs minus from_*/to_*)
   }
   ```
   The legacy `from_city_id` / `to_city_id` / `from_place_id` / `to_place_id` are still accepted for back-compat — when present (and `waypoints` is absent), the server synthesizes a 2-waypoint array under `trip_type='one_way'`.

2. Validation (returns `422 VALIDATION` on fail):
   - `waypoints.length >= 2`
   - `arrive_at` monotonically increases along `seq`
   - `expected_end_at > pickup_at`, ≤ `pickup_at + max_trip_duration_days`
   - Shape per type: `round_trip` last waypoint's city/place == first; `multi_way` last ≠ first AND >= 3 waypoints; `one_way` last ≠ first.
   - Every `city_id` / `place_id` exists (FK-check via DB; surface 422).
   - Phone-scrubbing on `notes` via `assertNoPhones` (step-2 hygiene).

3. Server-side fare computation (a new SQL fn `compute_trip_pricing(p_trip_id uuid)`):
   - `total_distance_km = sum(leg distances)` — leg distance = haversine(consecutive waypoint coords) — or use the existing `expected_distance_km` body input as an override for v1 (agents type the distance).
   - `wait_charge = sum(wait_minutes × wait_rate_per_min)` over waypoints.
   - `days = ceil(span / 1 day)`.
   - `driver_payout = (total_distance_km × rate_per_km) + wait_charge + (driver_bata_per_day × days) − (fare × commission_pct/100) − gst_amount`.
   - The trigger already-on-trips-row recomputes on every `trips` UPDATE; new trigger on `trip_waypoints` calls the same fn after waypoint mutations.

4. `GET /trips` and `GET /trips/:id` join waypoints:
   ```
   waypoints:trip_waypoints!trip_id(seq, city:cities(*), place:places(*), arrive_at, wait_minutes, is_destination, notes)
   ```
   Ordered by `seq`. PII redaction unchanged (waypoints carry only public route data).

5. OpenAPI `public/docs/openapi.{yaml,json}` updated.

6. `scripts/test-trip-types.cjs` — new smoke covering:
   - POST a one_way trip with 1 stop → 200, 3 waypoints in DB, expected_end_at populated
   - POST a round_trip → 200, last waypoint == first city
   - POST a multi_way → 200, ordered correctly
   - POST with bad shape per type → 422
   - POST with non-monotonic arrive_at → 422
   - POST with span > max_trip_duration_days → 422
   - GET /trips/:id returns waypoints in seq order
   - Legacy POST (no waypoints, just from/to) still 200 → synthesized one_way

**Verify Phase 2:** `npx supabase functions deploy trips --project-ref … && node scripts/test-trip-types.cjs` — 100% pass.

**Commit:** `feat(trips): edge function — accept waypoints + trip_type + expected_end_at`

---

## Phase 3 — Client types + transforms

**Files:**
- `src/types/trip.ts` — add `TripType`, `Waypoint`, `WaypointInput`, `Trip.tripType`, `Trip.waypoints`, `Trip.expectedEndAt`; rename `Trip.driverBata` → `Trip.driverBataPerDay`; `PostTripInput.waypoints?`/`tripType`/`expectedEndAt`/`driverBataPerDay`.
- `src/lib/api/transforms/trip.ts` — `transformWaypoint`, pull array onto `Trip`; `toApiPostTrip` writes `trip_type` + `waypoints` (snake-case fields).
- All transform/page tests adjusted. New `__tests__/waypoint.test.ts`.

**Verify Phase 3:** `npx tsc --noEmit && npm run test:run` — all green.

**Commit:** `feat(trips): client types + transforms for waypoints + trip_type + per-day bata`

---

## Phase 4 — PostTripPage rebuild

**Files:**
- `src/pages/PostTripPage.tsx` — restructured:
  - Segment control at top: `One-way · Round-trip · Multi-stop`
  - `<TripStartEnd>` block: trip starts (datetime), trip ends (auto, editable)
  - `<WaypointEditor>` (new): drag-to-reorder rows, each with `[city/place picker] [arrive at] [wait minutes] [notes]`. Add-stop / remove-stop buttons. Validates per-type (round-trip pins first==last in UI; multi-way requires ≥3).
  - Bata field labels as `Driver bata per day` with live `× N days = ₹X total` preview.
- `src/components/trip/WaypointEditor.tsx` — the new component.
- `src/components/trip/TripTypeTabs.tsx` — small segment control.

**Verify Phase 4:** unit tests on `<WaypointEditor>` + form integration test on `PostTripPage`. Manual: `npm run dev` → post a multi-day round-trip with one intermediate stop → trip detail page renders the route chain correctly.

**Commit:** `feat(trips): UI — three-tab trip-type picker + waypoint editor + per-day bata`

---

## Phase 5 — Read-side UI + matching

**Files:**
- `src/components/trip/TripCard.tsx` (or wherever) — type badge (`One-way` / `🔁 Round trip · 3 days` / `Multi-stop · 4 destinations`), route chain (`CHN → VLR → CHN`), duration chip.
- `src/pages/TripDetailPage.tsx` — "Trip span" row, route chain rendered as an ordered list with arrival times, "Day N of M" indicator while `in_progress`.
- `src/pages/TripFeedPage.tsx` — verify badge fits.
- `src/components/trip/TripTracking.tsx` (live map) — "Day N of M" overlay.
- Backend SQL: `match_alerts_for_trip` / `match_alerts_for_vacancy` updated to check the full span against vacancy `available_from`/`available_until`. (One-line each.)
- Invite-to-trip dialog (already shipped) — gate by full-span availability when a vacancy is in view.

**Verify Phase 5:** test-trip-types smoke + test-vacancies smoke + manual.

**Commit:** `feat(trips): read-side UI for route chain, duration, multi-day; full-span vacancy matching`

---

## Phase 6 — E2E + ship

**Files:**
- `e2e/trip-types.spec.ts` — REST stubbed; agent posts each of the three types, driver browses, route chain renders correctly.
- `docs/CONTINUE_HERE.md` — note feature shipped, link to plan.
- `docs/PLATFORM_AND_ADMIN_REQUIREMENTS.md` — update §"Trip" model.
- `public/docs/openapi.{yaml,json}` — final pass.

**Verify Phase 6:** `npm run test:run` + `npm run test:e2e` + all smokes pass + manual round-trip end-to-end.

**Commit:** `feat(trips): e2e coverage + docs`

Then: open PR from `feat/trip-types` → `main`. Squash-merge after review.

---

## Out of scope (defer to v2)

- Per-waypoint progress tracking on the live map (currently just trip-level `in_progress`).
- Per-waypoint OTPs (one OTP per trip is simpler; revisit if mis-handoffs occur).
- "Trip passes through city X" search filter.
- Different fare-share per leg (mixed passengers picking up/dropping off along the way).
- Haversine-based auto-distance — v1 keeps the agent-typed `expected_distance_km` as authoritative; auto-compute is a follow-up.

## Risks + mitigations

- **Renaming `driver_bata` → `driver_bata_per_day`** is a breaking change. Mitigation: rename happens in migration 024 + every code reference flips in Phase 3's transforms commit (one PR). The OpenAPI ships in the same commit, so no version skew.
- **Backfill correctness**: if any existing trip has `pickup_at` in the future and we default `expected_end_at = pickup_at + 1 day`, we may be wrong by hours. Mitigation: the field is editable post-creation via `PATCH /trips/:id`; we'll surface a "review trip end time" prompt on the trip-manager home for trips posted before this feature launched.
- **Live functions in prod**: this is multi-day work. Don't merge `feat/trip-types` until all 6 phases are green; until then, prod runs the legacy single-leg flow undisturbed.
