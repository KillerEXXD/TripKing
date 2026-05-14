# Trip Assignment & Invite Workflow — Requirements

> **Status:** draft / requirements only. No code, DB, or edge-fn changes in
> this PR. Implementation lands in follow-up PRs once signed off.
>
> **Owner:** Ravee Sundar. **Drafted:** 2026-05-14.

## 1. Why we're changing the flow

Today the assign step is a single hop:

```
agent picks an applicant
  → trip.status = 'accepted' + passenger OTP generated server-side
  → notification fires to the driver
  → driver enters OTP + odometer to start
```

Drivers apply to many trips. When an agent picks one of them, the driver
might already be committed elsewhere — they only find out at OTP time, or
they ghost the trip. The agent has no recourse until pickup. Passenger
trust suffers; agent reputation suffers.

This rework introduces a **two-step handshake** with a server-enforced
acceptance deadline, an explicit decline / re-pick recovery path, and an
**invite flow** that lets the agent reach specific drivers without making
the trip public.

---

## 2. State machine

### Today

```
open  →  has_applicants  →  assigned  →  in_progress  →  completed
                              │
                              └── cancelled
```

### After this rework

```
open
  ↓ (first applicant POSTs)
has_applicants
  ↓ (agent picks one — POST /trips/:id/assign)
selected                                   ← NEW intermediate state
  │   driver gets a notification + Accept / Decline card.
  │   trip carries `acceptance_deadline_at` (now + window minutes).
  │
  ├── driver accepts            → accepted (passenger OTP generated)
  ├── driver declines           → has_applicants (rejoins applicant pool? no — see §5)
  ├── deadline elapses          → has_applicants (auto-expiry job)
  └── agent withdraws selection → has_applicants
                                  ↓ (driver enters OTP + odometer)
                                in_progress  →  completed
                                ↓
                                cancelled  (any state above can cancel)
```

The DB-level `trips.status` column stays a single TEXT + CHECK. The new
states are `selected` and `assigned`. `selected` means "we picked you;
waiting for your accept." `assigned` keeps its current meaning ("driver
locked in, ready to start").

---

## 3. Acceptance window

- Trip creator sets `acceptance_window_minutes` at post-time.
  - **Min:** 5, **Max:** 30. Default: 15. Enforced by DB CHECK.
- On `POST /trips/:id/assign`, the server stamps
  `acceptance_deadline_at = now() + acceptance_window_minutes * '1 minute'`
  and returns it in the response.
- A scheduled job (Supabase `cron`) runs every minute and expires any
  `selected` trip past its deadline:
  - sets status back to `has_applicants`
  - clears `assigned_driver_id`, `assigned_vehicle_id`, `assigned_acceptance_id`
  - emits a `selection_expired` notification to both the driver (FYI) and
    the agent ("driver didn't respond — pick another")
  - leaves the original acceptance row marked `expired`
- The trip-detail UI on both sides shows a **live countdown** ticker
  (client-side, JS, hydrating from `acceptance_deadline_at`).

---

## 4. PII reveal — who sees what, when

The current contract reveals identity on assignment (already). The rework
adds a finer split because the driver now needs to call the agent
**before** committing, and the passenger details should stay hidden until
the driver actually accepts.

| Stage | Trip status | Agent sees of driver | Driver sees of agent | Driver sees of passenger |
|---|---|---|---|---|
| Open / browse | `open` / `has_applicants` | Pre-reveal (handle, rating, vehicle) | Pre-reveal (handle only) | — |
| Applied | `has_applicants` | Pre-reveal (driver still anonymous to the agent until selected) | Pre-reveal | — |
| **Selected** | `selected` | **Full reveal** — name, phone, vehicle photo, ratings | **Full reveal** — name, phone, business name | Hidden |
| Accepted / Assigned | `assigned` | Same as above | Same | **Revealed** — name, phone (unless `hide_passenger_phone`) + OTP visibility rules |
| In progress | `in_progress` | Same | Same | Same |
| Completed | `completed` | Same | Same | Same |

Implementation notes:
- The current `vacancy_invitations` flow already has a "applying reveals
  the driver to the agent" pattern via `revealCache.canRevealAgentUser`
  and `canRevealDriverUser`. Extend it: a `trips` row with
  `status='selected'` and `assigned_driver_id=<driver>` should fall under
  the "mutual reveal" bucket regardless of vacancy_invitation row.
- `POST /trips/:id/assign` server-side will INSERT a `pii_access_log` row
  for the agent → driver reveal AND the driver → agent reveal (when the
  driver next opens the trip).
- `redactTrip` gets a new `'selected'` viewer-relationship branch that
  reveals `assigned_driver` (name / phone / photo) AND `posted_by_name`
  + `posted_by_phone` to the selected driver only.

---

## 5. Decline / withdraw / expiry recovery

When a `selected` trip falls back to `has_applicants` (any of the three
reasons below), the same rules apply:

| Trigger | Endpoint | Effect on `trip_acceptances` |
|---|---|---|
| Driver declines | `POST /trips/:id/decline` | The driver's acceptance row → `declined` (was `selected` momentarily). They're OUT of this trip's pool. Other applicants stay `applied`. |
| Driver lets it expire | cron job | The driver's acceptance row → `expired`. Same — driver is out. |
| Agent withdraws | `POST /trips/:id/cancel-assignment` | Driver's acceptance row → `applied` again (they're still in the pool — the agent changed their mind, not the driver). |

In all three cases:
- `trip.status` → `has_applicants`
- `assigned_*` fields cleared
- `acceptance_deadline_at` cleared
- Notification fires to the affected parties

**Why differentiate driver-decline vs agent-withdraw?** A driver who
declines after being picked is signalling unavailability — taking them out
of the pool keeps the agent from re-picking the same person. An agent
withdrawal is the agent's choice; the driver shouldn't be punished.

**Withdrawal reason** (curated dropdown, optional but encouraged):
- Driver decline: `double_booked` · `vehicle_issue` · `family_emergency` ·
  `route_too_long` · `rate_too_low` · `other`.
- Agent withdrawal: `found_better_driver` · `trip_changed` ·
  `passenger_cancelled` · `driver_unreachable` · `other`.

Reasons feed into per-user trust signals (out of scope for this PR; just
collect them for now).

---

## 6. OTP lifecycle

| Event | OTP exists? | Who sees `passenger_otp` plaintext? | Who sees `passenger_otp_hash`? |
|---|---|---|---|
| Open / has_applicants / selected | No | — | — |
| Driver accepts (status → accepted) | Generated server-side | Trip creator (poster) **only** | Server (used to validate) |
| In progress / completed | Persisted | Trip creator only | Server |

- OTP is a 5-digit numeric (today: `ddddd`). Stays the same.
- On accept, server generates + persists `passenger_otp` + `passenger_otp_hash`.
- Server sends the OTP to the passenger via SMS / WhatsApp (using
  `passenger_phone` — required at post time).
- Server returns the OTP in the trip-detail response **only when the
  viewer is the poster** (or admin). The driver never sees the OTP.
- Driver enters OTP + odometer reading + odometer photo → `POST
  /trips/:id/start`. All three are mandatory (server validates).

This is mostly **already implemented today**; the only change is moving
the OTP generation from `POST /trips/:id/assign` to the new
`POST /trips/:id/accept`.

---

## 7. Invite flow

The agent often has a few "go-to" drivers. Today they have to wait for
those drivers to find the trip in the public feed (or chase them on
WhatsApp). The invite flow shortcuts this.

### Behaviour

- **Agent invites N drivers** (`POST /trips/:id/invites { driver_ids: [...] }`).
  - Server creates one `trip_invitations` row per driver.
  - Notification fires to each invited driver: "Priya Travels invited you
    to a trip — Vellore → Chennai, ₹16/km."
- **Invited driver opens "Invited" tab** in My Trips
  (`GET /trips?invited=me`).
  - The trip appears with an "Invited" status pill.
  - **Pre-reveal exception:** the invited driver can see the agent's full
    name + phone (so they can call to discuss before applying). They do
    NOT see passenger details.
- **Invited driver applies** (existing `POST /trips/:id/applicants`).
  - Their `trip_acceptances` row gets `source='invitation'` for telemetry.
  - At this point the agent sees them as a regular applicant — the
    invitation row is closed.
- **Invited driver declines** (`POST /trips/:id/invites/:invite_id/decline`).
  - The invitation row → `declined`.
  - Agent sees the decline in the invitee list.
- **Agent uninvites** (`DELETE /trips/:id/invites/:invite_id`).
  - The invitation row → `withdrawn`.
  - Driver no longer sees the trip on the Invited tab.

### Open question — public-or-private invite trip?

Two options:
- **Option A (default — public + invites):** the invited trip is still on
  the public feed; invites are just a fast-track. Driver pool is larger,
  agent gets more applicants.
- **Option B (private-on-invite):** the trip is hidden from the public
  feed once invites are sent; only invited drivers + already-applied
  drivers can see it. Better for "I want exactly these 3 to bid."

Default to **Option A** for v1. Option B becomes a per-trip toggle
later.

### Table sketch — `trip_invitations`

Mirrors `vacancy_invitations` shape (migration 023):

```sql
create table public.trip_invitations (
  id              uuid primary key default gen_random_uuid(),
  trip_id         uuid not null references public.trips(id) on delete cascade,
  driver_id       uuid not null references public.drivers(id) on delete cascade,
  invited_by_user_id uuid not null references public.users(id) on delete cascade,
  status          text not null default 'pending'
                  check (status in ('pending', 'applied', 'declined', 'withdrawn', 'expired')),
  declined_reason text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (trip_id, driver_id)
);
create index on public.trip_invitations(driver_id, status);
create index on public.trip_invitations(trip_id);
```

RLS:
- The invited driver can SELECT their own row.
- The trip's poster can SELECT all rows for the trip.
- Admin can SELECT everything.
- Owner-only writes (poster creates / withdraws; driver declines / applies-via).

When the invited driver applies via `POST /trips/:id/applicants`, a trigger
flips the matching invitation row to `status='applied'`.

---

## 8. REST contract

### New endpoints

```
POST  /trips/:id/accept             (selected driver; Bearer)
  body: {}
  200: { ok: true, trip: <updated row, with passenger details now revealed> }
  409: trip is no longer 'selected' (agent withdrew, you declined, expired)

POST  /trips/:id/decline            (selected driver; Bearer)
  body: { reason?: string }
  200: { ok: true }
  409: trip is no longer 'selected'

POST  /trips/:id/cancel-assignment  (poster/admin; Bearer)
  body: { reason?: string }
  200: { ok: true, trip: <updated row, back to has_applicants> }
  409: trip is not in 'selected'/'accepted'

POST  /trips/:id/invites            (poster/admin; Bearer)
  body: { driver_ids: string[] }
  200: { ok: true, created: <invitation rows>, skipped: [...] }
  422: bad driver_ids, KYC not approved, driver is deactivated

GET   /trips/:id/invites            (poster/admin; Bearer)
  200: { ok: true, data: <invitation list with driver summary + status> }

DELETE /trips/:id/invites/:invite_id  (poster/admin; Bearer)
  200: { ok: true }

POST  /trips/:id/invites/:invite_id/decline  (invited driver; Bearer)
  body: { reason?: string }
  200: { ok: true }

GET   /trips?invited=me             (driver; Bearer)
  200: { ok: true, data: <trips this driver was invited to, in any invite status> }
```

### Changed endpoints

```
POST  /trips                        (poster; Bearer)
  body: + acceptance_window_minutes (int 5–30, defaults to 15)
  Stored on the trip row.

POST  /trips/:id/assign             (poster/admin; Bearer)
  body: { acceptance_id }
  Effect changes:
    - trip.status → 'selected' (not 'accepted')
    - acceptance_deadline_at = now() + acceptance_window_minutes * '1 min'
    - DOES NOT generate passenger_otp yet
    - notification 'trip_selected' fires to the driver (push + SMS fallback)
    - mutual PII reveal logged
  200: { ok: true, trip, acceptance_deadline_at }

GET   /trips/:id                    (any; Bearer)
  Response gains:
    - acceptance_deadline_at        (when status='selected')
    - acceptance_window_minutes     (always)
    - driver_acceptance_status      (NULL | pending | accepted | declined | expired)
    - invitee_count                 (poster sees this on the invite picker)
```

### Notifications

New `notifications.type` values:
- `trip_selected` — to the driver: "Priya Travels picked you. Accept within
  N minutes."
- `selection_expired` — to both: "Selection window elapsed."
- `trip_assignment_cancelled` — to the driver: "Agent withdrew the
  assignment. Other applicants still open."
- `trip_invitation` — to the driver: "Priya Travels invited you to a trip."
- `trip_invitation_declined` — to the agent: invited driver said no.

Existing types stay: `trip_assigned` (now fires on accept, not selection),
`trip_cancelled`, `trip_completed`, `kyc_status_change`, `alert_match`,
`review_received`, `account_status_change`.

---

## 9. Migration sketch

```sql
-- Migration NNN — two-step assignment + invites.
alter table public.trips
  add column acceptance_window_minutes int not null default 15
    check (acceptance_window_minutes between 5 and 30),
  add column acceptance_deadline_at timestamptz,
  add column driver_acceptance_status text
    check (driver_acceptance_status in ('pending', 'accepted', 'declined', 'expired'));

-- broaden the status CHECK to allow the new 'selected' state
alter table public.trips drop constraint trips_status_check;
alter table public.trips add constraint trips_status_check
  check (status in ('open', 'has_applicants', 'selected', 'accepted',
                    'in_progress', 'completed', 'cancelled'));

-- trip_invitations table (see §7 sketch above)
create table public.trip_invitations (...);

-- backfill: any existing 'accepted' row keeps that status; driver_acceptance_status
-- defaults to 'accepted' so the migration is non-destructive.
update public.trips
   set driver_acceptance_status = 'accepted'
 where status in ('accepted', 'in_progress', 'completed');

-- cron job: expire stale selections every minute
select cron.schedule(
  'trips_expire_selections',
  '* * * * *',
  $$ select public.expire_stale_selections() $$
);

create or replace function public.expire_stale_selections() returns void as $$
begin
  update public.trips
     set status = 'has_applicants',
         assigned_driver_id = null,
         assigned_vehicle_id = null,
         assigned_acceptance_id = null,
         acceptance_deadline_at = null,
         driver_acceptance_status = 'expired'
   where status = 'selected'
     and acceptance_deadline_at < now();
  -- and emit selection_expired notifications via a separate INSERT...
end;
$$ language plpgsql;
```

---

## 10. UI changes — per role

### Trip creator (agent)

- **Post-a-trip form** (Step 2): new input "Acceptance window for the
  chosen driver" — slider 5 ↔ 30 min, default 15. Hint copy: "After you
  pick a driver, they have this long to Accept. If they don't, the trip
  goes back to applicants."
- **Applicants screen**: same as today (review applicants → pick one) but
  the "Assign" CTA copy becomes "**Select this driver**". On click:
  - status flips to `selected`
  - the screen turns into the new "Selected — awaiting acceptance" view
    with a live countdown + driver's name + phone (tap-to-call) + a
    secondary **"Withdraw selection"** button.
- **Trip detail (selected)**: a big yellow banner — "Waiting for Ravi to
  accept · 14:32 remaining · Call them." If you tap Withdraw, a modal
  asks for an optional reason.
- **Trip detail (assigned)**: same as today, plus the OTP card (already
  exists).
- **Invite picker** (new screen): from the trip detail, a "Invite drivers"
  button opens a list of drivers near the pickup city (existing `/drivers`
  endpoint with `near_lat/near_lng`). Multi-select. Send. The picker
  shows previously-invited drivers + their status.
- **Invitees list** (on the trip detail): below the applicants list, a
  "Invited" subsection — driver handle + status pill (pending / declined
  / applied) + a Withdraw button per row.

### Driver

- **Notification → trip detail**: tapping the "You've been selected" push
  opens the trip detail with the new big card at the top:
  - "**You've been selected for this trip**"
  - Countdown timer
  - **Accept** (primary, green)
  - **Decline** (ghost, red text)
  - Agent name + phone (tap-to-call)
- **My trips** gets a new tab — "**Invited**" — between "Applied" and
  "Posted by me". Shows trips the driver was invited to, with a
  "Invited" status pill. Tapping a row opens the trip detail; the
  driver sees the agent's details but not the passenger's.
- **Trip detail (invited)**: a sky-blue banner — "You've been invited to
  view this trip" + agent name + phone + an "Apply to this trip" CTA.
  Same screen, just with the invite ribbon on top.
- **OTP + odometer screen** (existing): unchanged. Mandatory OTP +
  odometer reading + odometer photo to start. (Already in spec; this
  PR just re-affirms.)

### Passenger

No UI change. The OTP arrives on accept (slightly later than today). The
passenger portal (`/t/<code>`) still opens with the same fields once
trip is `assigned`.

---

## 11. Edge cases & answers

| Question | Answer |
|---|---|
| Driver was selected for two overlapping trips simultaneously by two different agents? | Server checks on `POST /trips/:id/accept`: if the driver has any other `assigned` or `in_progress` trip whose `[pickup_at, expected_end_at]` overlaps this one, return 409 `CONFLICT_OVERLAP`. The driver picks one. |
| Agent withdrew the selection just as the driver tapped Accept? | The accept endpoint reads `trip.status` inside a transaction; if it's no longer `selected`, returns 409. |
| Driver lost connection during the acceptance window? | Server expiry job runs on its own clock — being offline isn't a get-out-of-jail-free. The push notification arrives on next reconnect; the user sees "Sorry, this trip expired." |
| Driver accepted but the passenger phone is wrong / unreachable? | Trip stays `assigned`; the agent can `POST /trips/:id/cancel-assignment { reason: 'passenger_unreachable' }` to free the driver. |
| Trip creator wants to swap drivers mid-`selected` — cancel + re-pick or just re-pick? | Cancel + re-pick. We never silently swap (the original driver might be on their way). The withdrawal notification fires. |
| Driver was invited AND independently applied — duplicate? | The invitation row's UNIQUE (trip_id, driver_id) prevents a second invite to the same driver. The acceptance row is allowed; the trigger flips the invitation to `applied` when the acceptance lands. |
| Driver's KYC lapses mid-acceptance? | Server check on `POST /trips/:id/accept` — KYC must still be `approved`. 403 `KYC_REQUIRED`. |
| Agent's KYC lapses mid-acceptance? | Server check on `POST /trips/:id/assign` — agent must be approved. (The trip already failed `POST /trips` if not.) |

---

## 12. Telemetry

Useful counters / latencies (add to `api_metrics` or a dedicated
`trip_assignment_events` table):

- `selection_to_accept_ms` — time from `POST /trips/:id/assign` to the
  driver's accept. Feeds the agent-side "Driver responsiveness" chart.
- `selection_outcome` — `accepted` | `declined` | `expired` |
  `agent_withdrew`. Drives the per-driver "Accept rate" metric.
- `invite_outcome` — `applied` | `declined` | `expired` | `withdrawn`.
- `acceptance_window_chosen` — distribution of `acceptance_window_minutes`
  across trips. Helps tune the default.

Surface these on the existing `/analytics` endpoints and the admin
dashboard.

---

## 13. Out of scope (parked for follow-ups)

- **Masked-number calling** (Knowlarity / Exotel) between agent ↔ driver
  ↔ passenger. Today we tap-to-call raw numbers. Adds privacy + auditing.
- **Push-notification reliability** instrumentation (delivery receipts,
  open-rate). We assume the platform notifications work; selection
  failures from missed notifications are a known gap.
- **Re-invite same driver after a decline** within the same trip.
  Currently each invite is unique per (trip, driver). A re-invite would
  need to either resurrect the row or allow multiple. Defer.
- **Invite-only trips** (Option B from §7) — a poster toggle that hides
  the trip from the public feed. Defer.
- **Invitee bidding** — letting invited drivers propose a rate
  upfront, before applying. Defer.

---

## 14. Implementation phases (rough)

A reasonable splits for follow-up PRs:

1. **Migration + acceptance-window field** — DB only. No behaviour change
   yet (`acceptance_window_minutes` becomes a stored field; the post-trip
   form gets the slider but the assign flow still works as today).
2. **The selected state + accept/decline endpoints** — change `assign`
   to set `status='selected'`, add the two new driver-side endpoints,
   add the cron expiry job, update redactions for the new state.
3. **Frontend: new card on the driver's trip detail** + the agent's
   "awaiting acceptance" view + countdown.
4. **`trip_invitations` table + invite endpoints** — back-end of the
   invite flow. No UI yet — invites only via API (or admin tool).
5. **Frontend: invite picker + "Invited" tab in My Trips** for the
   driver.
6. **Telemetry + analytics surface.**

Each is a one-PR chunk. Steps 1–3 unlock the big-bang two-step handshake;
steps 4–5 unlock the invite flow; step 6 closes out the analytics.

---

## 15. Verification

End-to-end test scenarios (will become smoke + Playwright in the
implementation PRs):

1. **Happy path.** Agent posts trip with `acceptance_window_minutes=10`.
   Driver applies. Agent selects → trip.status=`selected`. Driver sees
   countdown + accept card. Driver accepts → trip.status=`assigned`,
   passenger receives OTP, trip-creator sees OTP. Driver enters
   OTP+odometer → in_progress.
2. **Driver declines.** Same up to selection. Driver hits Decline → trip
   falls back to `has_applicants`. Agent sees decline notification + the
   other applicants still listed. Picks another → loop.
3. **Timeout.** Agent selects. Driver does nothing. After
   `acceptance_window_minutes`, the cron job flips trip back to
   `has_applicants`. Driver and agent both get a notification.
4. **Race — agent withdraws first.** Agent selects, then hits Withdraw.
   Driver taps Accept simultaneously. One of them wins; the loser gets a
   409 with a friendly toast.
5. **Overlapping trips.** Driver is `assigned` to trip A (10–12 am).
   Agent of trip B (11 am – 1 pm) selects them → driver tries Accept →
   409 `CONFLICT_OVERLAP`.
6. **Invite happy path.** Agent invites driver Ravi to a trip. Ravi sees
   it on the Invited tab with agent's details visible. Applies. Agent's
   applicants list now shows Ravi. Agent selects → standard flow.
7. **Invite decline.** Same setup. Ravi taps Decline. The invitation row
   → `declined`. Agent sees it in the invitee list.
8. **Multi-invite + agent withdraws an invite.** Agent invites Ravi and
   Suresh. Suresh applies first. Agent withdraws Ravi's invite. Ravi no
   longer sees the trip on Invited.

---

## 16. Critical files referenced

For the engineer picking this up:

- `supabase/functions/trips/index.ts` — current `POST /:id/assign` at
  ~line 819 is what becomes the new two-step flow.
- `supabase/functions/_shared/pii.ts` — `redactTrip` reveal rules; the
  new `'selected'` viewer-relationship goes here.
- `supabase/functions/_shared/revealCache.ts` —
  `canRevealAgentUser` / `canRevealDriverUser`. Extend with a
  selection-based reveal predicate.
- `supabase/migrations/023_vacancy_invitations.sql` — the existing
  invitation table to mirror for `trip_invitations`.
- `src/pages/PostTripPage.tsx` — adds the acceptance-window slider.
- `src/pages/TripDetailPage.tsx` — the big accept card + countdown +
  the agent's "awaiting acceptance" status; the invite picker entry
  point.
- `src/pages/MyTripsPage.tsx` (or wherever the tabs live) — new
  "Invited" tab.
- `src/hooks/useTrips.ts` — new mutations: `useAcceptTrip`,
  `useDeclineTrip`, `useCancelAssignment`, `useInviteDrivers`.
- `src/types/trip.ts` — `Trip.acceptanceWindowMinutes`,
  `acceptanceDeadlineAt`, `driverAcceptanceStatus`,
  `inviteeCount`.
- `docs/PLATFORM_AND_ADMIN_REQUIREMENTS.md` — update the trip-lifecycle
  section to point here.

---

*End of spec. Comments + edits welcome before implementation starts.*
