# PII Gating — Handover

This is the operating manual for finishing the anti-disintermediation work. **Step 1 is done** (migrations applied, shared helper merged). **Steps 2–5 remain.** Pick this up cold by reading top-to-bottom; everything you need is here or linked.

## Why this exists

An agent searching drivers (or a driver browsing trips) currently sees the other side's name and phone before any platform commitment. So they call off-platform and the platform earns nothing. The fix gates name / phone / email / profile photo behind a **platform action that proves both sides have committed** — applying to a trip (or accepting an invitation from a vacancy). Pre-reveal, both sides see a stable opaque handle (`A3E5A6E`-style, 7 chars) plus trust signals (rating, verified, trips completed, vehicle, city). All redaction is server-side — the client can't be trusted.

Full design rationale: `C:\Users\ravee\.claude\plans\clcikgn-the-trip-card-crystalline-snowflake.md`.

## Status — what's already merged on `main`

| Commit | What |
|---|---|
| `006dd1d` | Step 1: migrations 022 + 023, `_shared/pii.ts`, 12 Deno unit tests |
| `609519a` | Fix: schema-qualified `extensions.gen_random_bytes` + corrected handle-length comment |

Both migrations are **applied to prod** (`saxcbebqxgatiktsebxw`). All existing `public.users` rows already have a `display_handle`. Verify with:

```bash
node scripts/db.cjs "select id, role, display_handle from public.users limit 5;"
```

## Available primitives (already on disk — use these, don't re-invent)

In `supabase/functions/_shared/pii.ts`:

| Symbol | Use |
|---|---|
| `stripPhones(text)` | Replace `\b[6-9]\d{9}\b` (Indian mobile) with `[contact hidden]` on read. Idempotent, null-safe. |
| `assertNoPhones(text, field)` | Throw `PhoneInTextError` (has `.field`) on write. Catch in the endpoint, convert to `fail('VALIDATION', …, 400)`. |
| `revealCache(db)` → `{ canRevealDriverUser, canRevealAgentUser }` | Per-request memoized predicates. Call once at handler top, reuse for every row. Self + admin are short-circuited in JS; the DB roundtrip only happens for the real predicate via SQL `can_reveal_driver` / `can_reveal_agent`. |
| `redactDriver(row, reveal)` / `redactAgent(row, reveal)` | Strip `full_name`, `phone`, `email`, `profile_photo_url` when `reveal=false`. Non-mutating. Always preserves `display_handle`. |
| `logPiiReveal(db, ev)` | Fire-and-forget INSERT into `pii_access_log`. Skips self-views. Errors swallowed by design. |

SQL predicates (defined in migration 022, callable via `db.rpc(...)`):

- `public.can_reveal_driver(p_viewer uuid, p_driver_user uuid)` — true if self / admin / agent has an acceptance row from this driver / trip is assigned-or-later to this driver.
- `public.can_reveal_agent(p_viewer uuid, p_agent_user uuid)` — true if self / admin / driver has applied to one of this agent's trips.

DB-side audit table: `public.pii_access_log(viewer_user_id, target_user_id, surface, trip_id, created_at)`, admin-read RLS only.

DB-side new (unwired): `public.vacancy_invitations(vacancy_id, trip_id, invited_by_user_id, driver_id, status, message, expires_at, decided_at)`. Status ∈ `pending|accepted|declined|expired`. RLS lets driver read theirs + agent read what they sent. `notifications.type` accepts 3 new values (`trip_invitation`, `invitation_accepted`, `invitation_declined`).

## Important caveat — read this before touching `trips/index.ts`

The header comment of `supabase/functions/trips/index.ts` (lines 1–38) claims `redactTrip` already gates `posted_by_phone` per viewer relationship. **Verify this in code before assuming it's a bug**. The original Explore-agent scan flagged it as an unconditional leak, but the file's own docstring contradicts that. First check `redactTrip` against today's spec (self / admin / poster / assigned driver / applicant). If it's already correct, the only change needed in step 2 for trips is:

- Note-field scrubbing (`stripPhones` on read; `assertNoPhones` on write) for `driver_instructions`, `luggage_notes`, `special_requests`, `decision_note`, `cancel_reason`, `applicant_message`.
- Adding `display_handle` to the response shape (join `public.users` via `posted_by_user_id` and pull it).
- If you find the leak is real after all: gate `posted_by_phone` / `posted_by_name` through `canRevealAgentUser(viewerUserId, posterUserId)`.

## Step 2 — backend redaction (the bulk of the work)

For each edge function below: at the top of the read handler, build `const reveal = revealCache(db);`. For each row joined to a driver/agent, `await reveal.canRevealDriverUser(viewerUserId, row.user_id)`; pass the result to `redactDriver(row, ok)`. On a true reveal, `logPiiReveal(db, { viewer_user_id, target_user_id, surface, trip_id })`. Always include `display_handle` in the SELECT (join `public.users u on u.id = driver.user_id`).

### Files to touch

| File | What to change |
|---|---|
| `supabase/functions/drivers/index.ts` | Apply `redactDriver` to the list (`GET /drivers`) + detail (`GET /drivers/:id`) responses. Driver's own profile via `/drivers/me` always full. Admin always full. |
| `supabase/functions/agents/index.ts` | Symmetric: `redactAgent` on list + detail. |
| `supabase/functions/vacancies/index.ts` | Strip `driver.full_name`/`phone`/`email`/`profile_photo_url` from the list response (a vacancy never reveals — vacancies always pre-reveal in this design); expose `driver.display_handle`. `stripPhones(notes)` on read; `assertNoPhones(notes)` on write. |
| `supabase/functions/trips/index.ts` | (a) confirm `redactTrip` agrees with the spec; fix if not. (b) `stripPhones` on the note/reason fields listed above on read; `assertNoPhones` on the same fields on write. (c) Add `posted_by_handle` to every trip response (join `public.users.display_handle` via `posted_by_user_id`). (d) Same for `assigned_driver_handle` when populated. |
| `supabase/functions/reviews/index.ts` | `stripPhones(body)` on read; `assertNoPhones(body)` on write. Reviewer rendered by `display_handle` on public reads (reviewer name only when the predicate says reveal). |

### Pattern to follow

```ts
import { revealCache, redactDriver, logPiiReveal, stripPhones, assertNoPhones, PhoneInTextError } from '../_shared/pii.ts';

// inside the handler:
const viewerUserId = jwt.sub;
const reveal = revealCache(db);

// per row:
const can = await reveal.canRevealDriverUser(viewerUserId, row.user_id);
const driver = redactDriver(row, can);
if (can) await logPiiReveal(db, { viewer_user_id: viewerUserId, target_user_id: row.user_id, surface: 'GET /drivers' });

// for write fields:
try {
  assertNoPhones(body.notes, 'notes');
} catch (e) {
  if (e instanceof PhoneInTextError) return fail('VALIDATION', e.message, 400);
  throw e;
}
```

### Deploy + smoke test for step 2

After each edge-function edit:

```bash
npx supabase functions deploy drivers agents vacancies trips reviews
```

Then write `scripts/test-pii-redaction.cjs` (new) — mirror an existing `scripts/test-*.cjs`. Assertions:

1. Sign in as agent A (`POST /auth/verify-otp { phone:'9000000001', otp:'12345', role:'admin' }` won't apply — keep `role:'trip_manager'`).
2. `GET /vacancies` — assert each `driver.full_name === undefined`, `driver.display_handle` matches `/^A[0-9A-F]{6}$/`.
3. Sign in as driver D, `GET /trips` — assert `posted_by_name`/`posted_by_phone` are undefined for trips D hasn't applied to.
4. D applies to one of A's trips (`POST /trips/:id/applicants`).
5. Re-fetch — assert `posted_by_name`/`posted_by_phone` now present on that trip.
6. Symmetric: A fetches `/trips/:id/applicants`, the new applicant row carries `driver.full_name`.
7. Phone-in-notes write returns 400 with `error.code === 'VALIDATION'`.
8. Pre-existing bad data is stripped on read (seed a vacancy with a phone in `notes` via service-role insert, then GET → `[contact hidden]`).

`node scripts/test-pii-redaction.cjs` should print 8/8 pass.

Commit: `feat(pii): server-side redaction across drivers/agents/vacancies/trips/reviews (step 2 of 5)`

## Step 3 — vacancy invitations

New file `supabase/functions/vacancy-invitations/index.ts`. Routes:

- `GET /vacancy-invitations` — `?role=driver` returns mine-received, `?role=agent` returns mine-sent, default both. Admin sees all.
- `POST /vacancy-invitations` — body `{ vacancy_id, trip_id, message? }`. Agent must own the trip, trip must be `open` or `has_applicants`, vacancy driver must be `is_active` + KYC-approved. INSERTs the row, fires a `trip_invitation` notification to the driver.
- `PATCH /vacancy-invitations/:id` — body `{ status: 'accepted'|'declined' }`. Driver-only on their own row; admin too. On `accepted`: INSERT a `trip_acceptances` row (status `applied`) — that's the reveal gate. Fire `invitation_accepted` / `invitation_declined` notification to the agent.

Rate-limit POST (per-user, 20 / 10 min). `withTiming`. Add to `public/docs/openapi.yaml` + `.json`.

Smoke test: `scripts/test-vacancy-invitations.cjs` — agent invites, driver accepts, both sides now see full info (re-runs the reveal assertions from step 2's smoke).

Deploy: `npx supabase functions deploy vacancy-invitations`.

Commit: `feat(pii): vacancy-invitations edge function (step 3 of 5)`

## Step 4 — frontend types + transforms

| File | Change |
|---|---|
| `src/types/driver.ts` | Add `DriverPublic` (no `fullName`/`phone`/`email`/`profilePhotoUrl`; adds `displayHandle: string`). Keep `Driver` for the revealed shape (its `fullName`/`phone` stay required there). Same split → `AgentPublic` / `Agent`. Export both from `@/types`. |
| `src/types/vacancy.ts` | `Vacancy.driver: DriverPublic`. |
| `src/types/trip.ts` | Add `Trip.postedByHandle: string`; `Trip.postedByName`/`postedByPhone` stay optional; `Trip.assignedDriverHandle?: string`. |
| `src/lib/api/transforms/driver.ts` | `transformDriverPublic(row)` + `transformDriver(row)`. The public variant **does not throw** on missing name/phone (intentional absence, not a backend bug). Mirror the `HandTransformError` pattern but treat name/phone as optional for the public shape. |
| `src/lib/api/transforms/agent.ts` | Same split. |
| `src/lib/api/transforms/vacancy.ts` | Use `transformDriverPublic`. |
| `src/lib/api/transforms/trip.ts` | Pull `posted_by_handle` (required) and optional `posted_by_name`/`posted_by_phone`. Same for assigned driver. |
| `src/lib/api/transforms/__tests__/*` | Tests for both variants — public variant tolerates missing name; reveals are honored. |
| `src/lib/api/services/vacancyInvitations.ts` | NEW — list / create / patch. |
| `src/hooks/useVacancyInvitations.ts` | NEW — queries + mutations; invalidates `['vacancies']` and `['notifications']`. |

Commit: `feat(pii): split DriverPublic/AgentPublic + transforms + invitations hook (step 4 of 5)`

## Step 5 — frontend UI

| File | Change |
|---|---|
| `src/components/driver/DriverIdentity.tsx` | NEW — single source of truth: renders handle + initials avatar from the handle when public; renders fullName + photo when the prop is `Driver` (revealed). |
| `src/components/agent/AgentIdentity.tsx` | NEW — symmetric. |
| `src/pages/VacanciesPage.tsx` | Replace `driver.fullName` (line 39) with `<DriverIdentity driver={v.driver} />`; remove photo. Add **Invite to trip** button — opens a dialog listing the agent's open trips, calls `useVacancyInvitations().create`. |
| `src/pages/TripDetailPage.tsx` | "Posted by" block uses `<AgentIdentity>`; name/phone only when the response carries them. |
| `src/pages/TripFeedPage.tsx` | Verify the "Posted by a driver/agent" badge stays handle-only. |
| `src/pages/DriverProfilePage.tsx` | If viewed by a non-revealed viewer, render handle + signals + vehicles (no plate); component must not crash on missing name/phone (server drives the shape). |
| `src/pages/ApplicantReviewPage.tsx` | Past the gate — full info; verify no changes needed. |
| `src/pages/NotificationsPage.tsx` | Add accept/decline buttons for `trip_invitation` notifications, calling `useVacancyInvitations().patch`. |

Playwright: `e2e/pii-gating.spec.ts` — REST stubbed; verifies UI never renders a field absent from the response, and that the **Invite to trip** flow flips the response shape post-acceptance.

Update `docs/CONTINUE_HERE.md` to mark Phase 6 hardening item done.

Commit: `feat(pii): UI — DriverIdentity/AgentIdentity + Invite to trip flow (step 5 of 5)`

## Gotchas learned in step 1

1. **`pgcrypto` lives in `extensions`, not `public`.** Set `search_path = public, extensions, pg_catalog` in any function that calls `gen_random_bytes`. Naked calls fail with PG error 42883 via `scripts/db.cjs`.
2. **Deno's flow analyzer is more aggressive than Node's.** A counter mutated inside a closure but only read at the top scope gets narrowed to its initial literal. Workaround in `pii.test.ts`: route the read through a function (`const count = () => arr.length`) so the narrower can't see through it.
3. **The `@ts-expect-error` on Deno-resolved imports is for the *app's* tsc** (which compiles `src/`), not Deno's own checker — Deno will mark it as unused. The shared `_shared/pii.ts` imports a type-only via the supabase-js URL and Deno is happy; the app's tsc doesn't compile `supabase/functions/**` so it doesn't see this file either. No `@ts-expect-error` needed in `pii.ts` (verified).
4. **The `scripts/db.cjs` script returns the raw 201 envelope.** A successful `--file` run prints `[201]` then `[]`. That's success — there's no body for DDL. Don't be confused.

## How to start the next session

Open a fresh chat in this repo and paste:

> Continue the PII-gating plan. Step 1 is done (commits `006dd1d` + `609519a`, migrations 022/023 applied). Read `docs/PII_GATING_HANDOVER.md` and `~/.claude/plans/clcikgn-the-trip-card-crystalline-snowflake.md`, then start **step 2** — backend redaction. Verify whether `trips/index.ts` `redactTrip` already gates `posted_by_phone` before changing it. Pause after step 2 for review.

That's it — the new session has everything it needs.
