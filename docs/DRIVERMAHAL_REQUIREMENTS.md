# DriverMahal — Cab Driver & Trip Marketplace PWA

> **Status:** Requirements v3 — prototype-validated. Backend implementation pending (Phase 0+).
> **Created:** 2026-05-08
> **Last updated:** 2026-05-09
> **Live prototype:** https://driver-mahal.vercel.app
> **Repo:** https://github.com/KillerEXXD/DriverMahal
> **Stack:** React 18 + TypeScript + Vite 5 + Tailwind v4 + shadcn/ui (Radix), Zustand + TanStack Query, react-hook-form + Zod, Sonner, Recharts, lucide-react, idb, Sentry, PostHog, Supabase JS, vite-plugin-pwa + Workbox, Web Push (VAPID), Google Maps (Places + Distance Matrix), Daily.co (video calls), MSG91/Twilio (SMS).
> **Design language:** **Uber-style mobile-first** — drivers are familiar with Uber, so layouts, iconography, and interaction patterns mirror that paradigm: large bottom CTAs, location-search-first flows (no map UI in MVP), single-column flows, big tap targets, status pills, prominent ★ ratings, photo avatars.

---

## What's new in v3 (prototype-validated)

The Phase W prototype shipped to https://driver-mahal.vercel.app uncovered concrete UX patterns and a few gaps in the v2 spec. This section captures what changed; the rest of the doc has been edited inline to match. Skip to **Features as built** below for the reference list of every screen and store.

**Big additions surfaced in the prototype:**

1. **Map-driven location search everywhere** — single reusable `LocationSearchPanel` component (OpenStreetMap Nominatim for prototype, Google Places-ready for prod). Used by Driver Home current-location, Post Vacancy from + multi-add destinations, Post Trip from/to, alert criteria, Vacancies/Find Driver filter, Trip Feed filter. Every selection carries lat/lng for radius matching.
2. **Default-to-near-me for browse views** — drivers land on Trips and Vacancies pre-filtered to their currentCity with a contextual "Trips from {city}" / "Drivers vacant in {city}" heading.
3. **Trip lifecycle: applied → assigned → started → completed** with persisted state across the prototype:
   - **`myApplicationsStore`** — driver applications survive reload; "✓ You applied" badges appear on every trip card; Apply CTA → "Applied" pill with Withdraw.
   - **`tripStateStore`** — manager assignments + cancellations + OTP + visibility toggles, overlaid on the seed trips so feeds reflect user actions.
   - **`tripExecutionStore`** — per-trip start/complete timestamps, odometer photos (start + end), driver notes.
4. **Passenger OTP + Passenger Portal** — auto-generated 6-digit OTP on assignment. Manager shares out-of-band (SMS/WhatsApp), passenger types it on `/passenger` (no login), driver enters it before tripping the start-photo capture. Single use per trip.
5. **Odometer photo capture** — `<input capture="environment">` for camera-first capture on mobile, client-side compression to keep persisted state under the localStorage budget. Start + end snapshots stored with timestamps.
6. **Two privacy toggles for the trip poster:**
   - **Show fare to passenger** (default ON) — controls whether `/passenger` displays the fare card or "Fare handled separately".
   - **Hide passenger phone from driver** (default OFF) — when ON the assigned driver sees only the passenger name and a hint to route questions through the manager.
7. **Driver vacancy lifecycle** — `myVacanciesStore`, "Your active vacancy" hero card on Driver Home, dedicated `/driver/my-vacancies` manage page (Active + History), peer-awareness card on Post Vacancy showing other drivers free in the chosen city.
8. **Re-assignable applicants + cancellable trips** — once a manager has chosen a driver, the assigned-driver hero stays at the top, with the other applicants listed below for one-tap re-selection (e.g. assigned driver becomes unavailable). A sticky "Cancel posted trip" CTA lets the manager kill the trip with an optional reason.
9. **Auto-updating PWA service worker** — `registerSW({ immediate: true })` polls for updates every 60s + on focus + on visibilitychange, wipes caches and reloads on `controllerchange`. Avoids stale-bundle white-screens after deploys.
10. **Persistent demo state** — the demo seeds an OTP `123456` and a pre-assigned trip on first load so testers can hit `/passenger` immediately without first walking through the manager flow.

**Status of v2 phases:**
- Phase W (Workflow + Prototype): ✅ shipped to Vercel
- Phase 0–6 (backend implementation, Supabase migrations, edge functions, real auth, etc.): ❌ pending — the prototype runs entirely on local stores so Phase 0 schema design can begin from the validated UX.

---

## Overview

DriverMahal is a 3-role progressive web app that connects independent cab drivers with trip managers and other drivers across cities in India. Vacant drivers advertise their current city and the destinations they are willing to drive to; trip managers (and other drivers) post inter-city trip requests with full commercial specs (car type, rate per KM, distance, commission %, GST). Both sides can subscribe to alerts that fire push notifications when a matching trip or vacancy appears within a chosen radius. Administrators gate driver onboarding via a KYC workflow that verifies Aadhaar, profile photo, license, vehicle papers, and 4-side photos of each car before a driver is allowed to post or accept work.

---

## User Roles

| Role | Auth | Description |
|------|------|-------------|
| **Cab Driver** | Phone + OTP. Must be **Admin-approved** (KYC + video call) before posting vacancies or accepting trips. | Posts availability, posts trips, accepts trips, sets alerts, manages own vehicles. |
| **Trip Manager** | Phone or Email + OTP. Must be **Admin-approved** (KYC + video call) before posting trips or assigning drivers. | Posts trips, finds vacant drivers, reviews driver acceptances, assigns chosen driver, tracks commission, sets alerts. |
| **Administrator** | Email + password (no OTP). **First admin is provisioned manually via SQL** (no self-signup, no UI). Subsequent admins added by an existing admin. | Reviews KYC for both drivers and trip managers, conducts video-call verification, approves/rejects, manages master data (cities, car types, commission rules, minimum vehicle year, translations), audits all activity. |

### Access Control Matrix

| Action | Driver | Trip Manager | Admin |
|--------|:------:|:------------:|:-----:|
| Sign up | ✅ | ✅ | ❌ (provisioned manually via SQL) |
| Upload KYC docs (Aadhaar, voter ID, license) | ✅ | ✅ | ❌ |
| Schedule / attend video-call verification | ✅ (as interviewee) | ✅ (as interviewee) | ✅ (as interviewer) |
| Approve/reject KYC | ❌ | ❌ | ✅ |
| Post vacancy | ✅ (only if `kyc_status='approved'`) | ❌ | ❌ |
| Post trip | ✅ (only if approved) | ✅ (only if approved) | ✅ |
| Accept trip | ✅ (only if approved) | ❌ | ❌ |
| Review applicants & pick driver for own trip | ✅ (for trips they posted) | ✅ (for trips they posted) | ✅ |
| View other user's KYC docs | ❌ | ❌ | ✅ |
| Edit master data (cities, car types, **min vehicle year**, **translations**) | ❌ | ❌ | ✅ |
| View commission reports | own trips | own trips | all |
| Choose UI language (English / Tamil / Hindi) | ✅ | ✅ | ✅ (admin UI English-only at launch) |

---

## Data Model

### `users` — base auth row
| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key (links to `auth.users`) |
| `role` | enum | `driver \| trip_manager \| admin` |
| `phone` | string | E.164, unique |
| `email` | string | Optional for drivers, required for managers/admins |
| `display_name` | string | |
| `is_active` | boolean | Soft-deactivate |
| `created_at` | timestamp | |

### `drivers` — KYC profile (1:1 with users where `role='driver'`)
| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | PK |
| `user_id` | UUID | FK → users.id |
| `full_name` | string | As on Aadhaar |
| `phone` | string | |
| `email` | string | |
| `home_city_id` | UUID | FK → cities |
| `current_city_id` | UUID | FK → cities |
| `current_lat`, `current_lng` | float | Last-known geolocation |
| `current_location_updated_at` | timestamp | |
| `aadhaar_number_masked` | string | Last 4 digits only |
| `aadhaar_front_url` | string | Signed URL (private bucket) |
| `aadhaar_back_url` | string | |
| `voter_id_number_masked` | string | Last 4 digits only |
| `voter_id_front_url` | string | Required |
| `voter_id_back_url` | string | Required |
| `driver_license_number` | string | |
| `driver_license_url` | string | |
| `driver_license_expiry` | date | |
| `profile_photo_url` | string | Selfie/headshot |
| `phone_verified_at` | timestamp | OTP-verified phone |
| `video_verification_status` | enum | `not_scheduled \| scheduled \| completed \| failed` |
| `video_verification_id` | UUID | FK → `video_verifications` (latest) |
| `kyc_status` | enum | `pending \| docs_submitted \| video_pending \| approved \| rejected \| resubmit_required` |
| `kyc_reviewed_by` | UUID | FK → users (admin) |
| `kyc_reviewed_at` | timestamp | |
| `kyc_rejection_reason` | text | Free text from admin |
| `preferred_language` | enum | `en \| ta \| hi` (default `en`) |
| `rating_avg` | float | 0–5 |
| `total_trips_completed` | int | |
| `created_at`, `updated_at` | timestamp | |

> **Compliance:** Full Aadhaar / Voter ID numbers are **never** stored. Only masked last-4 digits go in DB columns; document images live in the private `driver-kyc/` Supabase Storage bucket, accessible only via signed URLs to admins or the owning driver.

### `trip_managers` — KYC profile (1:1 with users where `role='trip_manager'`)
| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | PK |
| `user_id` | UUID | FK → users.id |
| `full_name` | string | As on Aadhaar |
| `phone` | string | OTP-verified |
| `email` | string | |
| `business_name` | string | Optional company / agency name |
| `business_city_id` | UUID | FK → cities |
| `aadhaar_number_masked` | string | Last 4 digits only |
| `aadhaar_front_url`, `aadhaar_back_url` | string | Required |
| `voter_id_number_masked` | string | |
| `voter_id_front_url`, `voter_id_back_url` | string | Required |
| `profile_photo_url` | string | Selfie/headshot |
| `phone_verified_at` | timestamp | |
| `video_verification_status` | enum | `not_scheduled \| scheduled \| completed \| failed` |
| `video_verification_id` | UUID | FK → `video_verifications` |
| `kyc_status` | enum | `pending \| docs_submitted \| video_pending \| approved \| rejected \| resubmit_required` |
| `kyc_reviewed_by`, `kyc_reviewed_at`, `kyc_rejection_reason` | | |
| `preferred_language` | enum | `en \| ta \| hi` (default `en`) |
| `total_trips_posted` | int | |
| `created_at`, `updated_at` | timestamp | |

> **Trip Manager KYC** uses the same document set and video-call flow as drivers. Trip Manager cannot post trips or assign drivers until `kyc_status='approved'`.

### `vehicles` — driver's car (a driver may have multiple)
| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | PK |
| `driver_id` | UUID | FK → drivers |
| `make` | string | e.g. "Toyota" |
| `model` | string | e.g. "Innova Crysta" |
| `year` | int | Manufacture year — **validated against `app_settings.min_vehicle_year` at upload time and on every Post Vacancy / Accept Trip action** |
| `retirement_year` | int | Auto-calc: `year + (current_year - app_settings.min_vehicle_year_relative)` — the year this vehicle becomes ineligible. Refreshed nightly. |
| `eligibility_status` | enum | `eligible \| expiring_soon \| expired` (refreshed nightly) |
| `registration_number` | string | e.g. "TN 22 AB 1234" |
| `car_type` | enum | `Hatchback \| Sedan \| SUV \| Tempo Traveller \| Innova \| Mini Bus` (admin-extensible) |
| `seats` | int | |
| `ac` | boolean | |
| `fuel_type` | enum | `Petrol \| Diesel \| CNG \| EV` |
| `photo_front_url` | string | Required |
| `photo_back_url` | string | Required |
| `photo_left_url` | string | Required |
| `photo_right_url` | string | Required |
| `photo_interior_url` | string | Optional |
| `rc_book_url` | string | Required |
| `insurance_url` | string | Required |
| `insurance_expiry` | date | |
| `permit_url` | string | Optional (commercial permit) |
| `permit_expiry` | date | |
| `is_primary` | boolean | One primary vehicle per driver |
| `is_active` | boolean | |
| `created_at` | timestamp | |

### `app_settings` — single-row global configuration (admin-managed)
| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | PK (singleton row) |
| `min_vehicle_year` | int | Hard minimum manufacture year — vehicles older than this are rejected at upload. Editable by admin only. |
| `min_vehicle_year_relative` | int | OR (mutually-exclusive alt mode): "vehicle must be ≤ N years old". If set, `min_vehicle_year` is computed as `current_year − N`. |
| `vehicle_expiry_warning_days` | int | Days before retirement to flag as `expiring_soon` (default 90) |
| `default_alert_radius_km` | int | Default 25 |
| `default_commission_pct` | numeric | Default suggestion when posting a trip |
| `default_gst_pct` | numeric | Default suggestion |
| `push_rate_limit_minutes` | int | Default 5 |
| `support_phone`, `support_email` | string | Shown in driver app |
| `updated_by` | UUID | FK → users (admin) |
| `updated_at` | timestamp | |

### `cities` — admin-managed reference list
| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | PK |
| `name` | string | e.g. "Vellore" |
| `state` | string | e.g. "Tamil Nadu" |
| `lat`, `lng` | float | Centroid for radius matching |
| `is_active` | boolean | |

### `vacancy_posts` — "I'm free in city X, willing to go to one of these cities"
| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | PK |
| `driver_id` | UUID | FK → drivers |
| `vehicle_id` | UUID | FK → vehicles |
| `current_city_id` | UUID | FK → cities |
| `available_from` | timestamp | |
| `available_until` | timestamp | Optional (null = open-ended) |
| `destination_city_ids` | UUID[] | Array — driver will accept trips to any of these |
| `min_rate_per_km` | numeric | Optional floor |
| `notes` | text | Free-text (e.g. "Prefer one-way, no return cargo") |
| `status` | enum | `active \| matched \| expired \| cancelled` |
| `created_at`, `updated_at` | timestamp | |

### `trips` — published trip request
| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | PK |
| `posted_by_user_id` | UUID | FK → users |
| `posted_by_role` | enum | `driver \| trip_manager` |
| `from_city_id`, `to_city_id` | UUID | FK → cities |
| `from_lat`, `from_lng`, `to_lat`, `to_lng` | float | Pickup/drop coords |
| `pickup_datetime` | timestamp | |
| `expected_distance_km` | numeric | Auto-suggested via Google Distance Matrix, editable |
| `car_type_required` | enum | Matches `vehicles.car_type` |
| `seats_required` | int | |
| `ac_required` | boolean | |
| `rate_per_km` | numeric | INR |
| `total_fare` | numeric | Auto-calc `distance × rate`, editable |
| `commission_pct` | numeric | 0–100 (manager's cut) |
| `gst_amount` | numeric | INR (flat amount) |
| `toll_handling` | enum | `included \| extra \| passenger_pays` |
| `driver_payout` | numeric | Auto-calc: `total_fare − (total_fare × commission_pct/100) − gst_amount` |
| `passenger_name`, `passenger_phone` | string | |
| `passenger_count` | int | |
| `luggage_notes`, `special_requests` | text | |
| `status` | enum | `open \| has_applicants \| assigned \| in_progress \| completed \| closed \| cancelled \| expired \| disputed` — see **Trip Status Lifecycle** below |
| `confirmed_substate` | enum | Only meaningful when `status='assigned'`: `awaiting_start \| driver_en_route \| arrived_at_pickup`. Drives the "Driver on the way / arrived" passenger notification and starts live tracking. |
| `cancellation_reason` | enum | Only set when `status='cancelled'`: `manager \| driver \| mid_trip \| no_show \| passenger_no_show`. (Kept as a separate field rather than expanding the status enum so analytics still know who cancelled and why.) |
| `closure_state` | enum | Only meaningful when `status='completed'`: `pending_reviews \| closed`. After the review window (48h) or once both parties review, `status` flips to `closed`. |
| `applicant_count` | int | Cached count of `trip_acceptances` rows with `status='applied'` |
| `assigned_driver_id` | UUID | FK → drivers (nullable, set after poster picks from applicants) |
| `assigned_vehicle_id` | UUID | FK → vehicles (nullable) |
| `assigned_at` | timestamp | When the poster selected a driver |
| `expires_at` | timestamp | Auto-set to `pickup_datetime`; a nightly job flips still-unassigned trips to `status='expired'` |
| `started_at` | timestamp | Driver tapped "Start trip" (with start-odometer photo) |
| `start_odometer_km` | numeric | |
| `start_odometer_photo_url` | string | |
| `ended_at` | timestamp | Driver tapped "End trip" (with end-odometer photo) |
| `end_odometer_km` | numeric | |
| `end_odometer_photo_url` | string | |
| `actual_distance_km` | numeric | `end_odometer_km − start_odometer_km` — used to reconcile fare vs `expected_distance_km` |
| `current_lat`, `current_lng` | float | Driver's last reported position (live tracking; updated while `status='in_progress'`) |
| `last_location_at` | timestamp | When `current_lat/lng` was last updated |
| `disputed_at`, `disputed_by_user_id`, `dispute_note` | timestamp/UUID/text | Set when a manager or passenger raises an issue (`status='disputed'`) |
| `created_at`, `updated_at` | timestamp | |

### Trip Status Lifecycle

A trip moves through these states. `status` is the primary field; `confirmed_substate`, `cancellation_reason`, and `closure_state` qualify it where noted. Every transition writes a row to `trip_assignments_history` (`from_status`, `to_status`, `changed_by`, `changed_at`, `note`).

**Posting & matching**
| Status | Meaning | Set by | Can move to |
|--------|---------|--------|-------------|
| `open` | Published, accepting driver applications | System on publish | `has_applicants`, `cancelled`, `expired` |
| `has_applicants` | ≥1 driver applied, none selected yet | System on first `trip_acceptances` row | `assigned`, `open` (all withdrew), `cancelled`, `expired` |
| `expired` | `pickup_datetime` passed with no driver assigned (nightly job) | System | *(terminal)* |

**Confirmed** (`status='assigned'`, qualified by `confirmed_substate`)
| `confirmed_substate` | Meaning | Set by | Can move to |
|----------------------|---------|--------|-------------|
| `awaiting_start` | Driver selected; trip not yet underway | Poster picks a driver → `status='assigned'`, `assigned_driver_id` set, other acceptances → `rejected` | `driver_en_route`, or `cancelled` (`manager`/`driver`/`no_show`) |
| `driver_en_route` | Driver heading to the pickup point — **live tracking starts here** | Driver taps "On my way" | `arrived_at_pickup`, or `cancelled` (`driver`/`no_show`) |
| `arrived_at_pickup` | Driver at pickup, waiting for passenger | Driver taps "Arrived" | `in_progress`, or `cancelled` (`passenger_no_show`) |

**Active**
| Status | Meaning | Set by | Can move to |
|--------|---------|--------|-------------|
| `in_progress` | Trip underway, car moving — drives the **live tracking + ETA + on-time/delayed** view for the trip manager | Driver taps "Start trip" (captures `start_odometer_km` + photo, sets `started_at`) | `completed`, or `cancelled` (`mid_trip`) |

**Closure** (`status='completed'`, qualified by `closure_state`)
| `closure_state` | Meaning | Set by | Can move to |
|-----------------|---------|--------|-------------|
| `pending_reviews` | Trip ended (captures `end_odometer_km` + photo, sets `ended_at`, computes `actual_distance_km`, finalizes fare/payout). Passenger can leave a driver review; manager↔driver mutual review window open (48h) | Driver taps "End trip" | `closed`, or `disputed` |
| *(none — status flips)* `closed` | Review window elapsed or both parties reviewed — fully archived, immutable | System | *(terminal)* |

**Failure / cancellation** (`status='cancelled'`, qualified by `cancellation_reason`)
| `cancellation_reason` | Triggered when |
|-----------------------|----------------|
| `manager` | Manager cancels before the trip starts |
| `driver` | Assigned driver backs out before the trip starts |
| `no_show` | Assigned driver never arrives at pickup |
| `passenger_no_show` | Driver arrives, passenger doesn't show |
| `mid_trip` | Trip aborted after it started (breakdown, emergency, safety) |

**Other terminal**
| Status | Meaning |
|--------|---------|
| `disputed` | Manager or passenger raised an issue on a completed trip (fare, behavior, route). Held until resolved → moves to `closed` (or triggers a refund flow outside this table). |

```
                ┌─ cancelled (manager/driver) ─┐
open → has_applicants → assigned ───────────────┤
  │        │             │ awaiting_start       │
  │        │             ▼                       ▼
  └─ expired              driver_en_route → arrived_at_pickup → in_progress → completed → closed
                                │ (no_show)        │ (passenger_no_show)   │ (mid_trip)   │ (pending_reviews)
                                └──── cancelled ───┴───────────────────────┘              └─→ disputed
```

**Notes**
- `confirmed_substate` lets us keep the `status` enum small while still notifying the passenger ("Driver is on the way" / "Driver has arrived") and knowing exactly when to begin live tracking.
- The prototype currently simulates live tracking (deterministic per `trip.id`) since there's no driver GPS feed yet; production will update `current_lat/lng` + `last_location_at` from the driver's app while `status='in_progress'`.
- `expired` replaces leaving stale `open`/`has_applicants` trips around forever.
- `closed` vs `completed` separates "trip done" from "review window over / archived"; if a simpler model is preferred later, `completed` can be treated as terminal and `closure_state`/`closed` dropped.

### `trip_acceptances` — driver expresses interest in a posted trip (multiple drivers per trip)
| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | PK |
| `trip_id` | UUID | FK → trips |
| `driver_id` | UUID | FK → drivers |
| `vehicle_id` | UUID | FK → vehicles |
| `status` | enum | `applied \| selected \| rejected \| withdrawn \| expired` |
| `applicant_message` | text | Optional note from driver (e.g. "Can pick up 30 min earlier") |
| `applicant_quoted_rate_per_km` | numeric | Optional — driver may counter-quote |
| `applied_at` | timestamp | |
| `decision_at` | timestamp | When poster selected/rejected |
| `decision_note` | text | Optional reason from poster |
| `created_at` | timestamp | |

> **Multi-driver acceptance:** When a trip is posted, any approved driver matching `car_type_required` can apply. Multiple drivers may apply per trip. The poster (driver or trip manager) sees the applicant list, reviews each driver's profile (rating, completed trips, vehicle, photo), and selects exactly one — at which point that row's `status='selected'`, all others auto-flip to `rejected`, and the trip's `status='assigned'` with `assigned_driver_id` set. Selected and rejected drivers all receive push notifications.

### `alerts` — match criteria a user subscribes to
| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | PK |
| `user_id` | UUID | FK → users |
| `name` | string | User-friendly label e.g. "Vellore → Chennai > ₹15/km" |
| `from_city_id` | UUID | FK → cities |
| `from_radius_km` | int | Default 25 |
| `to_city_id` | UUID | FK → cities (nullable — null = "any destination") |
| `to_radius_km` | int | Default 25 |
| `min_rate_per_km` | numeric | Optional |
| `min_commission_pct` | numeric | Optional (manager-side) |
| `car_types` | enum[] | Filter to specific types |
| `pickup_window_start`, `pickup_window_end` | time | Daily window |
| `notify_via` | enum[] | `push \| sms \| email \| in_app` |
| `is_active` | boolean | |
| `created_at` | timestamp | |

### `notifications` — log of fired alerts + system messages
| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | PK |
| `user_id` | UUID | FK → users |
| `type` | enum | `alert_match \| kyc_status_change \| trip_assigned \| trip_cancelled \| trip_completed` |
| `title`, `body` | string | |
| `payload_json` | jsonb | Trip ID, vacancy ID, etc. for deep linking |
| `is_read` | boolean | |
| `delivered_at` | timestamp | |
| `created_at` | timestamp | |

### `trip_assignments_history` — audit trail
Every status change of a trip with `from_status`, `to_status`, `changed_by`, `changed_at`, `note`.

### `audit_log` — admin actions
KYC approvals/rejections, master data edits, user deactivations — `actor_id`, `action`, `target_id`, `payload_json`, `created_at`.

### `ratings` — post-trip ratings
`trip_id`, `rater_user_id`, `ratee_user_id`, `score` (1–5), `comment`, `created_at`.

### `video_verifications` — admin video-call verification sessions
| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | PK |
| `subject_user_id` | UUID | FK → users (driver or trip_manager being verified) |
| `subject_role` | enum | `driver \| trip_manager` |
| `scheduled_for` | timestamp | Slot picked by subject (15-min increments) |
| `meeting_url` | string | Generated link (Jitsi / Google Meet / Daily.co) |
| `meeting_provider` | enum | `jitsi \| google_meet \| daily \| in_app_webrtc` |
| `status` | enum | `scheduled \| in_progress \| completed \| no_show \| failed_verification \| rescheduled \| cancelled` |
| `started_at`, `ended_at` | timestamp | |
| `verified_by` | UUID | FK → users (admin) |
| `face_match_confirmed` | boolean | Admin confirms face matches Aadhaar/profile photo |
| `documents_confirmed` | boolean | Admin confirms physical docs match uploads |
| `liveness_check_passed` | boolean | Subject performed simple liveness action (turn head, blink) |
| `recording_url` | string | Optional retention (consent-gated) |
| `notes` | text | Admin's free-form notes |
| `created_at`, `updated_at` | timestamp | |

### `languages` — supported UI languages (admin-managed)
| Field | Type | Description |
|-------|------|-------------|
| `code` | string | PK — `en`, `ta`, `hi`, etc. (ISO 639-1) |
| `name_native` | string | e.g. "தமிழ்", "हिन्दी", "English" |
| `name_english` | string | e.g. "Tamil", "Hindi", "English" |
| `is_active` | boolean | Toggle visibility in language switcher |
| `is_default` | boolean | Exactly one row marked default (English at launch) |
| `display_order` | int | Sort order in switcher |
| `created_at` | timestamp | |

### `translation_keys` — canonical i18n keys
| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | PK |
| `key` | string | Unique, dot-notation e.g. `screen.home.post_vacancy_cta`, `error.kyc.aadhaar_required` |
| `namespace` | string | Coarse grouping: `driver_app`, `manager_app`, `admin_app`, `email`, `sms` |
| `default_text` | string | English source string (also serves as fallback) |
| `description` | text | Translator note (context, max length, variables used) |
| `variables` | string[] | Placeholder names e.g. `["city_name", "amount"]` for `"Trip from {{city_name}} for ₹{{amount}}"` |
| `is_active` | boolean | Soft-delete |
| `created_at`, `updated_at` | timestamp | |

### `translations` — per-language translation values
| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | PK |
| `key_id` | UUID | FK → translation_keys |
| `language_code` | string | FK → languages.code |
| `value` | text | Translated string |
| `status` | enum | `draft \| published \| needs_review` |
| `translated_by` | UUID | FK → users (admin or appointed translator) |
| `translated_at` | timestamp | |
| `created_at`, `updated_at` | timestamp | |

> **Unique constraint** `(key_id, language_code)` — exactly one translation row per (key, language). Missing translations fall back to `translation_keys.default_text` (English) and are flagged in the admin Translation Coverage dashboard.

### `user_preferences` — per-user UI preferences
| Field | Type | Description |
|-------|------|-------------|
| `user_id` | UUID | PK / FK → users |
| `language_code` | string | FK → languages.code (driver picks at onboarding, can change anytime) |
| `notification_channels` | enum[] | Subset of `push \| sms \| email \| in_app` |
| `timezone` | string | IANA timezone (default `Asia/Kolkata`) |
| `created_at`, `updated_at` | timestamp | |

---

## Core Flows

### 1. Driver Onboarding & KYC

```
Sign up (phone + OTP — phone_verified_at set)
  ↓
Choose UI language (English [default] / Tamil / Hindi) — saved to user_preferences
  ↓
Profile (name, home city, email)
  ↓
Aadhaar upload (front + back) + selfie
  ↓
Voter ID upload (front + back)
  ↓
Driver license upload + expiry
  ↓
Add primary vehicle:
  make/model/year, registration, car type, seats, AC
  + Year validated against app_settings.min_vehicle_year (rejected inline if too old)
  + 4-side photos (front/back/left/right) [required]
  + RC book + insurance + expiry [required]
  ↓
Submit docs → kyc_status = 'docs_submitted'
  ↓
Schedule video-call slot (15-min increments)
  → video_verifications row created, status='scheduled'
  → kyc_status = 'video_pending'
  ↓
Video call: admin verifies face matches Aadhaar/profile photo + asks subject
to physically show original docs + simple liveness action (turn head / blink)
  → video_verifications.status='completed', face_match_confirmed, documents_confirmed, liveness_check_passed
  ↓
Admin final decision → approve / reject (with reason) / request resubmission
  ↓
Driver receives push + in-app notification (in their preferred language)
  ↓
On 'approved' → unlocks Post Vacancy, Apply to Trip
```

### 1b. Trip Manager Onboarding & KYC

Identical document set to driver (Aadhaar + Voter ID + selfie + phone OTP) **plus**:
- Optional `business_name` and `business_city`
- No driver license, no vehicle data
- Same scheduled video-call verification with admin
- Cannot post trips or assign drivers until `kyc_status='approved'`

### 2. Vacancy Posting (driver)

- Approved driver taps "Post Vacancy"
- App auto-fills `current_city` via HTML5 Geolocation → reverse-geocode to nearest `cities` row (manual override available)
- Driver picks one or more **destination cities** (multi-select chips)
- Driver picks vehicle (if multiple), availability window, optional minimum rate per KM, optional notes
- Submit → row created in `vacancy_posts` with `status='active'`
- Visible to: all trip managers, all drivers with matching alerts
- Auto-expires on `available_until` via scheduled function (default 24h if null)

### 3. Trip Posting (driver or trip manager)

- Form fields:
  - From city, To city → distance auto-suggested via Google Distance Matrix (editable)
  - Pickup datetime
  - Car type required, seats, AC y/n
  - **Rate per KM (INR)** → `total_fare` auto-calculates
  - **Commission %** (manager's cut)
  - **GST amount (INR)** (flat)
  - Toll handling, passenger info, luggage, special requests
- Driver payout previewed before submit
- On publish → matching engine (Postgres function `match_alerts_for_trip(trip_id)`):
  - Finds all `alerts` where `from_city_id` is within `from_radius_km` of trip's from city, `to_city_id` matches (or null), and rate/commission/car-type/window pass
  - For each match → INSERT into `notifications` + queue Web Push delivery
  - Also matches against active `vacancy_posts` (driver in `from_city` with destination including `to_city`) → drivers get push too

### 4. Alert Subscription

- User opens "Alerts" → "Create Alert"
- Form: name, from city + radius, optional to city + radius, rate floor, commission floor, car types, pickup window, notification channels
- Saved to `alerts` table → matcher consults this on every new trip/vacancy
- User can pause/resume/delete alerts; rate-limited delivery (max 1 push per 5 min per alert to avoid spam)

### 5. Trip Lifecycle (with multi-driver acceptance)

```
open
  ↓ (1+ drivers tap "Apply" — INSERT into trip_acceptances, status='applied')
has_applicants
  ↓ (poster opens "My Trips" → applicant list with driver cards: photo, rating, completed trips, vehicle, distance from pickup, optional counter-quote)
  ↓ (poster taps "Choose this driver" on one card)
assigned (selected acceptance → status='selected'; all others → 'rejected'; trip.assigned_driver_id set; all applicants notified)
  ↓ (driver starts trip)
in_progress
  ↓
completed → both parties rate (1–5 + comment) → drivers.rating_avg updated, driver_payout finalized
  ↘ cancelled (with reason; cooldown applied to no-show driver)
```

**Key rules:**
- A driver can have at most **one active application** (`status='applied'`) per trip
- A driver can apply to multiple different open trips simultaneously, but **once selected** for one trip, all their other applications auto-withdraw (`status='withdrawn'`)
- Poster can reject individual applicants without selecting (e.g. "wrong vehicle type") — driver receives polite-rejection push
- Applications expire when trip's `pickup_datetime` passes without selection
- Driver's matching `vacancy_post` (if any) auto-marks `status='matched'` on selection

### 6. Admin Operations

- **KYC queue (drivers)**: filter by `docs_submitted / video_pending / approved / rejected / resubmit_required`, search by name/phone, click row → review modal showing all docs side-by-side → schedule video call → after call: approve / reject (reason required) / request resubmission
- **KYC queue (trip managers)**: same flow, separate tab
- **Video call console**: today's scheduled calls, "Start call" button (opens meeting URL), checklist (face match / docs verified / liveness), one-click finalize
- **Master data**: CRUD on `cities`, `car_types` (default commission rules per type), `app_settings` (incl. `min_vehicle_year`)
- **Driver list**: search, filter by KYC status, deactivate driver (sets `users.is_active=false`)
- **Trip Manager list**: search, filter by KYC status, deactivate
- **Vehicle Eligibility Dashboard**: list of all active vehicles with `eligibility_status` column (`eligible / expiring_soon / expired`); filter "expiring in next 30/60/90 days"; bulk-notify owners; deactivate vehicles past retirement
- **Trips overview**: read-only across all trips, filter by status/route/date
- **Translation Manager**: see Translation Workflow section below
- **Reports**: active drivers count, trips/day, revenue collected, commission collected, top routes, KYC approval throughput, video-call no-show rate, language distribution of users
- **Audit log**: all admin actions with actor, target, timestamp

### 7. Vehicle Year Eligibility Monitoring

- Admin sets `app_settings.min_vehicle_year` (e.g. `2015`) **or** `min_vehicle_year_relative` (e.g. `10` → "must be ≤ 10 years old")
- **At upload time**: vehicle form rejects inline if `year < min_vehicle_year`
- **Nightly job** (Supabase scheduled function `refresh_vehicle_eligibility`):
  - Recomputes each vehicle's `retirement_year`, `eligibility_status` based on current `app_settings`
  - Vehicles within `vehicle_expiry_warning_days` of retirement → `expiring_soon`
  - Vehicles past retirement → `expired`, auto-removed from active vacancy/trip eligibility
- **Admin Vehicle Eligibility Dashboard**:
  - Counts: Eligible / Expiring soon / Expired
  - Filterable list with driver, registration, year, retirement year, days remaining
  - "Notify driver" action queues a push reminder
  - Export CSV
- **Driver receives push**: "Your vehicle XYZ will become ineligible in N days" at 90 / 30 / 7-day marks
- When admin **changes `min_vehicle_year`**, eligibility statuses are recomputed immediately and affected drivers are notified

### 8. Translation Workflow (Admin)

- **Translation Coverage dashboard** shows for each language: `total_keys / translated / missing / needs_review` with %-complete bar
- **Translation Editor**: side-by-side English source + target-language input, with description, variables, screenshot reference, and Save → publishes to `translations` table
- **Bulk import/export**: CSV with columns `key, namespace, en, ta, hi, status` for offline translator workflow
- **Versioning**: every edit appends to `translations_history` (audit trail)
- **Driver/manager apps**: fetch translations on login + cache in IndexedDB; refresh on app cold-start. If a key is missing in the chosen language, fall back to English (`default_text`) and log to `translation_keys.missing_log` so admin sees what to translate next.
- **Admin app itself is English-only at launch** (Phase 1) — admin-facing strings are not translated.

---

## Pages / Screens by Role

### Cab Driver (mobile-first PWA — **Uber-style design**)

| Page | Notes |
|------|-------|
| Splash + Language picker | First-launch only — English / தமிழ் / हिन्दी; saved to `user_preferences.language_code` |
| Login / OTP | Phone-first, large numeric keypad, single-screen |
| Onboarding wizard | 5 steps: Language → Profile → KYC docs (Aadhaar + Voter ID + License + selfie) → Vehicle (with 4-side photos) → Schedule video call |
| KYC Pending | Status banner with stage indicator (`docs_submitted` → `video_pending` → review) + checklist of what's missing + scheduled video-call slot reminder |
| Home (Uber-style) | Big map background, bottom sheet with: "Post Vacancy" big primary button, my active vacancy card, my upcoming trips |
| Available Trips Feed | Card list (sorted by pickup time / distance), each card shows: route, pickup time, fare/payout, distance, car type required; tap → Trip Detail |
| Trip Detail | Map preview, full payout breakdown, "Apply for this trip" button (creates `trip_acceptances` row, status='applied'); shows current applicant count + my application status |
| My Applications | List of trips I've applied to with status (`Waiting / Selected / Not selected / Withdrawn`); pull-to-refresh |
| Post Vacancy | Multi-select destination chips, time window, one-tap "Use my current location" |
| Post Trip | Same form as Trip Manager (drivers can relay trips) |
| **My Posted Trips** | List of trips I posted, each with applicant count badge → tap to open Applicant Review |
| **Applicant Review** | List of drivers who applied; each card: photo, name, ★ rating + review count, completed trips, vehicle, distance from pickup, optional counter-quote, "View profile" + "Choose this driver" + "Reject" |
| **Driver Profile (public view)** | Photo, name, home city, ★ avg rating, review count, total trips completed, vehicle list, recent reviews from trip managers (5-star/text, redacted authors) |
| Alerts | List + Create/Edit |
| Notifications inbox | Tap → deep link to related trip/vacancy/applicant decision |
| Profile & Vehicles | Manage vehicles (with year + eligibility status badge), re-upload expired docs, **Language switcher** (change anytime) |
| History | Completed trips, earnings, ratings received, reviews received |
| **Reviews — Received** | All reviews left for me by trip managers / passengers (★ + text + when) |

### Trip Manager (mobile-first PWA)

| Page | Notes |
|------|-------|
| Splash + Language picker | Same as driver |
| Login | Email or phone + OTP |
| Onboarding wizard | 4 steps: Language → Profile (+ optional business name/city) → KYC docs (Aadhaar + Voter ID + selfie) → Schedule video call |
| KYC Pending | Same pattern as driver |
| Dashboard | Open trips, assigned trips, "Drivers nearby" map showing pins per active vacancy, **applicant-count badges** on each open trip |
| Post Trip | Full commercial form with payout preview |
| **My Posted Trips (multi-trip dashboard)** | Tabbed view: `Open / Has Applicants / Assigned / In Progress / Completed / Cancelled`. Each row shows: route, pickup time, status pill, applicant count, assigned driver photo. Designed to manage many trips in parallel without confusion. |
| **Applicant Review** (per trip) | Same screen as drivers' Applicant Review — driver cards with photo, ★ rating, review count, completed trips, distance from pickup, counter-quote, View profile / Choose / Reject |
| **Driver Profile (public view)** | Same as driver-side public profile; can leave a review after a completed trip |
| **Leave Review** | Post-completion rating modal: ★ 1–5 + free-text comment + tags (Punctual / Clean car / Polite / Safe driver) |
| Find Driver | Search active `vacancy_posts` by from-city radius, filter car type + min rate, **shows ★ rating on each driver card** |
| Trip Detail | Assignment, status updates, contact driver, leave review when completed |
| Alerts | Same as driver |
| Reports | Commission earned, completed routes, top drivers (by ★ rating) |
| Driver Directory | Approved drivers only, sortable by ★ rating / completed trips / last active |
| Profile | Edit profile, **Language switcher**, logout |

### Administrator (web-first, English UI)

| Page | Notes |
|------|-------|
| Login | Email + password (no OTP, no self-signup) |
| Dashboard | KPI cards: drivers pending KYC, video calls today, expiring vehicles, open support tickets |
| KYC Queue (Drivers) | Tabbed by status, click → review modal with all docs side-by-side |
| KYC Queue (Trip Managers) | Same flow, separate tab |
| **Video Call Console** | Today's scheduled calls; "Start call" → opens meeting URL; checklist (face match / docs verified / liveness); Approve / Reject / Reschedule one-click |
| Driver List | Search + filter, deactivate, view profile, view reviews received |
| Trip Manager List | Search + filter, deactivate |
| **Vehicle Eligibility Dashboard** | All vehicles with year, retirement year, status (Eligible / Expiring soon / Expired); filter by days-until-expiry; bulk-notify; CSV export |
| Cities CRUD | Name, state, lat/lng |
| Car Types CRUD | Name, default commission % suggestion |
| **App Settings** | Edit `min_vehicle_year` / `min_vehicle_year_relative`, `vehicle_expiry_warning_days`, default radius/commission/GST, support contact info, push rate-limit |
| **Translation Manager** | Languages list + add/edit, Translation Coverage dashboard per language, key-by-key editor with EN source + target input, CSV import/export, missing-keys log |
| **Reviews Moderation** | Flagged reviews queue (auto-flagged for profanity / threats); approve / hide / delete; one-tap deactivate offending account |
| Trips Overview | Read-only, all statuses |
| Reports | KPI dashboard incl. video-call no-show rate, language distribution, average driver rating trend |
| Audit Log | Searchable timeline of all admin actions |

---

## Non-Functional Requirements

### Design Language — Uber-style mobile-first
- Drivers are already trained on Uber. Mirror its conventions:
  - **Map-first home screens** with content in a bottom sheet
  - **Single primary action per screen**, large bottom button
  - **Big tap targets** (min 48 px), large numerals for fares/rates
  - **Vertical card lists** for trip feed and applicant review (no dense tables on mobile)
  - **Status pills** with strong colors (green/yellow/red)
  - **Driver star ratings** displayed prominently (★ 4.8 · 142 trips)
  - **Photo avatars everywhere** to humanize the marketplace
  - Minimal copy — icons + numbers over paragraphs

### PWA
- `vite-plugin-pwa` with Workbox runtime caching
- Manifest with icons (192/512), theme color, standalone display
- Offline read for last-loaded feed, app shell precached
- Install prompt for Android Chrome; iOS Safari users get "Add to Home Screen" instructions

### Web Push
- VAPID key pair generated at deploy; private key in Supabase secrets
- Service worker registers push subscription → stored in `push_subscriptions` table per user
- Edge Function `send-push` sends from a queue
- iOS Safari fallback: in-app inbox + SMS for high-priority alerts (KYC status, trip assigned, applicant decision)

### Geolocation & Maps
- `navigator.geolocation.getCurrentPosition` with permission prompt
- Reverse-geocode to nearest `cities` row (haversine distance)
- Distance matrix: Google Maps Distance Matrix API (or OpenRouteService as cost-control alternative)
- Map view: Mapbox GL JS or Google Maps JS API

### Video Call Verification
- **Provider options (in priority order)**: in-app WebRTC (Daily.co prebuilt), Jitsi Meet (self-hosted free), Google Meet link (manual)
- Subject self-schedules a 15-min slot from admin-configured availability
- Admin opens meeting from Video Call Console; checklist gates the verdict
- Optional recording (consent-gated, 30-day retention)
- iOS Safari + Android Chrome supported

### Storage
- Bucket `driver-kyc/` — **private**, signed URLs, RLS allows owner + admins only
- Bucket `manager-kyc/` — **private**, signed URLs, owner + admins only
- Bucket `vehicle-photos/` — **private**, signed URLs, owner + admins
- Bucket `video-recordings/` — **private**, admins only, 30-day TTL
- All image uploads compressed client-side (max 1.5 MB) with `browser-image-compression`

### Security & Compliance
- RLS on every table
- KYC docs: signed URLs only, expire in 5 min
- Driver cannot read another driver's `aadhaar_*`, `voter_id_*`, `driver_license_*`, vehicle docs, or video recordings
- **Aadhaar / Voter ID handling** (per UIDAI guidelines):
  - Never log full numbers
  - Store only masked last-4 in DB column
  - Document images encrypted at rest in private bucket
  - Explicit consent checkbox before upload, with copy referencing UIDAI consent guidelines
- Phone OTP via MSG91 or Twilio (reuse provider for SMS notifications)
- Video-call recordings retained 30 days then auto-purged (admin can extend per audit need)
- All admin actions logged to `audit_log`

### Internationalization (i18n) — **Day 1 at launch**
- **3 languages** supported from launch: English (`en`, default), Tamil (`ta`), Hindi (`hi`)
- App shipped first in **English** (the canonical source); Tamil & Hindi translations populated by admin via Translation Manager **before** public release
- Driver / Trip Manager picks language at first launch (Splash + Language picker), saved to `user_preferences.language_code`
- **Language switcher** available in Profile screen — change anytime, takes effect on next screen
- **Admin app remains English-only** at launch
- Library: `i18next` + `react-i18next`
- Translation source-of-truth: DB (`translation_keys` + `translations`); fetched on app load, cached in IndexedDB
- Fallback: missing translation → English `default_text` + log to missing-keys table
- New languages added by admin via Translation Manager without code change

### Performance
- Feed pagination: 20 per page, infinite scroll
- Debounced city search (300 ms)
- React Query staleTime: 30 s for feeds, 5 min for master data
- Indexes: `(from_city_id, status)`, `(to_city_id, status)`, `(driver_id, status)`, `(user_id, is_read)` on notifications, `(trip_id, status)` on `trip_acceptances`, `(eligibility_status)` on vehicles

---

## Tech Stack — **mirrors `hudr-pwa` exactly**

DriverMahal must reuse the proven hudr-pwa stack and conventions verbatim so the codebase looks and feels identical to a developer already familiar with HUDR. This avoids a costly refactor later.

| Layer | Choice (must match hudr-pwa) | Rationale |
|-------|------------------------------|-----------|
| Frontend framework | **React 18 + TypeScript + Vite 5** | Identical to hudr-pwa |
| Styling | **Tailwind CSS v4** (`@tailwindcss/vite` plugin) + **shadcn/ui** (Radix UI primitives) | Reuse `components/ui/*` shadcn pattern |
| Component utilities | `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react` icons | Same `cn()` helper, same `cva` variant pattern |
| Routing | `react-router-dom` v7 | Same as hudr-pwa |
| Data fetching | `@tanstack/react-query` v5 + devtools | Hooks `useTrips`, `useDrivers`, `useApplicants` mirror hudr-pwa's `useTournaments`, `usePlayers` |
| Client state | `zustand` v5 | Same as hudr-pwa stores |
| Forms | `react-hook-form` v7 + `zod` v4 | Same validation strategy |
| Toasts | `sonner` | Same as hudr-pwa |
| Charts | `recharts` v3 | Driver rating histogram + admin dashboards |
| Date utilities | `date-fns` v4 | Same as hudr-pwa |
| IndexedDB | `idb` v8 | Offline translation cache + queued actions |
| Errors | `@sentry/react` + `@sentry/vite-plugin` | Same source-map upload flow |
| Analytics | `posthog-js` | Same `lib/posthog.ts` + `PostHogPageviewTracker.tsx` pattern |
| Backend SDK | `@supabase/supabase-js` v2 | Same as hudr-pwa |
| API client | Custom `lib/api/client.ts` fetch wrapper (mirrors hudr-pwa) | Service layer in `lib/api/services/`, transforms in `lib/api/transforms/`, guards in `lib/api/guards/` |
| PWA | `vite-plugin-pwa` v1 + `workbox-window` | Workbox cache strategy: NetworkFirst for live data (active vacancies, applicants), StaleWhileRevalidate for stable (cities, car types, translations), CacheFirst for images |
| i18n | `i18next` + `react-i18next` + DB-backed loader cached in IndexedDB | Admin-managed without code redeploy |
| Maps | Google Maps JS API (Places + Distance Matrix) | Best India coverage |
| Video calls | Daily.co prebuilt (preferred) or Jitsi Meet | Cross-platform |
| Push | Web Push (VAPID) via Supabase Edge Function + service worker | Vendor-neutral |
| SMS / OTP | MSG91 or Twilio | OTP + iOS push fallback |
| Hosting | Vercel | Mirrors hudr-pwa + TournamentPro |
| Testing | `vitest` v3 + `@testing-library/react` v16 + `happy-dom` + `@playwright/test` v1 | Same as hudr-pwa |
| Storybook | `storybook` v9 + `@chromatic-com/storybook` | For shared `components/ui/` |
| Tooling | ESLint v8 (zero-warnings) + Prettier v3 + Husky v9 + Vercel Speed Insights | Identical to hudr-pwa |

### Folder Structure — **identical to `hudr-pwa/src/`**

```
src/
├── App.tsx                         # Root with Routes + providers
├── main.tsx                        # ReactDOM.createRoot
├── index.css                       # Tailwind v4 directives
├── version.ts
├── vite-env.d.ts
├── assets/
├── components/
│   ├── ui/                         # shadcn primitives (button, card, dialog, tabs, badge, avatar, ...)
│   ├── layout/                     # AppShell, BottomNav, AdminSidebar
│   ├── auth/                       # LoginForm, OtpInput, KycPendingBanner
│   ├── driver/                     # DriverCard, DriverProfileCard, RatingHistogram
│   ├── trip/                       # TripCard, TripForm, ApplicantCard, PayoutBreakdown
│   ├── vacancy/                    # VacancyForm, DestinationChips
│   ├── alert/                      # AlertForm, AlertCard
│   ├── review/                     # ReviewForm, StarSelector, TagSelector, ReviewList
│   ├── kyc/                        # DocUploader, VideoCallScheduler, AadhaarConsent
│   ├── vehicle/                    # VehicleForm, FourSidePhotoUploader, EligibilityBadge
│   ├── language/                   # LanguagePicker, LanguageSwitcher
│   ├── form/                       # FormField wrapper
│   └── PostHogPageviewTracker.tsx
├── config/                         # api.ts, i18n.ts
├── contexts/                       # AuthContext, LanguageContext, LayoutContext
├── data/                           # Mock data for prototype phase
├── features/                       # Feature slices (e.g., features/multi-trip)
├── hooks/                          # useDrivers, useTrips, useVacancies, useAlerts, useApplicants, useReviews, useTranslations, useUser, useVehicleEligibility, useKyc
├── lib/
│   ├── api/
│   │   ├── client.ts               # Centralized fetch wrapper (HUDR pattern)
│   │   ├── services/               # auth, drivers, managers, vacancies, trips, applicants, alerts, reviews, vehicles, kyc, translations
│   │   ├── transforms/             # Strict, throw on missing fields
│   │   └── guards/                 # Runtime type guards
│   ├── i18n/                       # DB-backed loader, IndexedDB cache
│   ├── sentry/                     # dataErrors.ts
│   ├── posthog.ts
│   ├── supabase.ts
│   ├── constants.ts
│   ├── logger.ts
│   ├── utils.ts                    # cn() helper, formatters
│   └── warmup.ts
├── pages/                          # All driver/manager/admin pages — see Pages section
├── stores/                         # authStore, uiStore (Zustand)
├── test/                           # Vitest setup
└── types/                          # api, driver, manager, trip, vacancy, alert, review, vehicle, kyc, translation, index
```

### Design Patterns — **identical to `hudr-pwa`**

- **Service-layer rule**: NEVER import Supabase or fetch directly in pages or components. All data ops go through `lib/api/services/*.ts`.
- **Strict transforms**: `lib/api/transforms/*.ts` validate API payloads and throw `[Resource]TransformError` when required fields are missing — *no fallback calculations* (mirrors `hudr-pwa/src/lib/api/transforms/handTransform.ts`).
- **`cn()` utility** in `lib/utils.ts` (clsx + tailwind-merge), used in every component.
- **shadcn `cva` variants**: every UI primitive uses `class-variance-authority` for size/variant props.
- **TanStack Query hooks**: every resource has a `use[Resource]()` hook with `queryKey`, `queryFn`, `staleTime`.
- **Zustand stores**: minimal — only auth/UI client state. Server state lives in TanStack Query.
- **Sentry data errors**: `lib/sentry/dataErrors.ts` exports `captureDataError(feature, ...)` called from API client on every failure.
- **Path alias**: `@/*` resolves to `src/*` (set in `vite.config.ts` + `tsconfig.json`).
- **TypeScript strict** + ESLint zero-warnings policy.

### Reuse Plan — copy directly from `hudr-pwa`

| File | Action |
|------|--------|
| `src/lib/utils.ts` (the `cn()` helper) | Copy verbatim |
| `src/lib/api/client.ts` (fetch wrapper) | Copy + swap base URL |
| `src/lib/sentry/dataErrors.ts` | Copy + extend `DataFeature` enum |
| `src/components/ui/*` (shadcn primitives) | Copy verbatim |
| `src/lib/posthog.ts` | Copy verbatim |
| `vite.config.ts` skeleton | Copy structure, swap manifest fields |
| `tsconfig.json` + `tsconfig.node.json` | Copy verbatim |
| `vitest.config.ts`, `playwright.config.ts` | Copy + adapt paths |
| `eslint.config` + `.prettierrc` + `husky/` | Copy verbatim |

We are **not building from scratch** — we are forking the proven HUDR PWA scaffold.

---

## Phases

| Phase | Scope | Deliverables |
|-------|-------|--------------|
| **W — Workflow Doc & Prototype** | Single-file HTML workflow doc (Ayusmat-style) + clickable HTML/React prototype mirroring all driver/manager/admin screens (Uber-style, mobile-first). No backend; mock data only. | `docs/drivermahal-flows.html`, `prototype/` folder with linked screens |
| **0 — Schema & i18n Infra** | All tables + RLS + storage buckets + manual admin seed + cities/car-types seed + `languages`/`translation_keys`/`translations` tables + i18n loader hook | Supabase migrations, seed scripts |
| **1 — Onboarding & KYC (drivers + managers)** | Both onboarding flows, doc upload (Aadhaar + Voter ID + License + selfie + Vehicle 4-side photos), video-call scheduling, admin KYC review queue + Video Call Console, language picker on splash | Driver + Manager onboarding flows, Admin KYC page, Video Call Console |
| **2 — Vacancy & Trip Posting** | Both forms, feeds for both roles, manual matching only (no alerts yet), vehicle-year validation at upload | Vacancy form, Trip form, Driver/Manager feeds |
| **3 — Multi-Driver Acceptance & Trip Lifecycle** | Apply-to-trip flow, applicant review screen for trip poster, multi-trip dashboard, accept → in_progress → completed, **reviews & ratings (★ + text + tags)** with public driver profiles, payout calc | Applicant Review screen, Posted Trips dashboard, Driver Profile, Reviews UI |
| **4 — Alerts & Notifications** | Alert CRUD, matcher (DB function or cron), Web Push + in-app inbox + SMS fallback | Alerts page, push infra, matcher function |
| **5 — Vehicle Eligibility & Translations** | `min_vehicle_year` enforcement, Vehicle Eligibility Dashboard, nightly refresh job, expiry pushes, **Translation Manager** with full Tamil + Hindi translations published | Admin App Settings page, Eligibility Dashboard, Translation Manager, complete `ta` + `hi` packs |
| **6 — Reports, Reviews Moderation & Polish** | Manager/admin reports, audit log UI, reviews moderation queue, performance pass | Reports pages, Moderation queue, perf tuning |

---

## Resolved Decisions (2026-05-09)

The following questions from v1 have been **resolved**:

- ✅ **Trip Manager KYC** — Trip Manager **also requires admin approval** with the same KYC document set as drivers (Aadhaar + Voter ID + selfie + phone OTP) plus a video-call verification with admin. They cannot post trips or assign drivers until `kyc_status='approved'`.
- ✅ **Admin provisioning** — First admin is created **manually via SQL** (no UI bootstrap, no env flag). Subsequent admins are added by an existing admin from the Admin Users page.
- ✅ **Video-call verification** — All KYC subjects (drivers and trip managers) must complete a scheduled video call with the admin where face match against Aadhaar/profile photo, physical document inspection, and a simple liveness action are confirmed before final approval.
- ✅ **Multi-language at launch** — Tamil and Hindi must be available **from launch**, not Phase 2. App is built in English first; admin populates Tamil/Hindi via Translation Manager before public release.
- ✅ **Multi-driver trip acceptance** — Multiple drivers can apply for a posted trip. Poster sees an Applicant Review screen and selects exactly one. Per-trip dashboard supports managing many trips in parallel.
- ✅ **Minimum vehicle year** — Admin sets a global `min_vehicle_year` (or `min_vehicle_year_relative`). Vehicles older than this are rejected at upload, and a Vehicle Eligibility Dashboard tracks vehicles approaching expiry.

## Remaining Open Questions

These do not block requirements signoff.

1. **Payment flow** — Cash-on-trip only, in-app wallet, or out-of-scope for v1?
2. **Multi-leg trips** — Vellore → Chennai → Pondicherry as one job — supported in v1 or later?
3. **Driver-posts-on-behalf-of-driver** — Per requirements, drivers can post trips. Commission split between original poster and accepting driver?
4. **GST split** — Is GST borne by the passenger entirely, or split between trip manager and driver?
5. **Cancellation policy** — Penalty / cooldown if a driver no-shows after accepting?
6. **Surge pricing** — Dynamic rate suggestions based on demand (festival weekends, etc.)?
7. **Driver self-pickup of vehicle docs** — Do we OCR Aadhaar / RC for auto-fill, or analyst-only?
8. **Vehicle inspection cadence** — Re-upload of car photos every N months, or only on insurance/permit renewal?
9. **Video-call provider final pick** — Daily.co prebuilt vs Jitsi Meet vs Google Meet links — confirm before Phase 1.
10. **Reviews — bidirectional?** — Can drivers also review trip managers / passengers, or one-way only (manager → driver)?
11. **Reviews moderation policy** — Auto-publish with auto-flag-on-keywords, or all reviews go through pre-moderation queue?

---

## Reviews & Ratings (Driver Reputation System)

A first-class feature, not an afterthought — drivers compete on reputation, posters use ratings to pick from multiple applicants, and the public driver profile is a primary trust signal.

### Goals
- Trip managers / passengers can leave a review after every completed trip
- Reviews are visible on the public driver profile for future posters to see
- Average rating is shown wherever a driver is referenced (applicant card, directory, profile)
- Admin moderates flagged reviews; bad-actor accounts can be deactivated

### Data Model — `ratings` (extended)

Already defined above. Fields recap:
| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | PK |
| `trip_id` | UUID | FK → trips |
| `rater_user_id` | UUID | FK → users (manager / passenger / driver depending on direction) |
| `ratee_user_id` | UUID | FK → users (the one being rated; driver in v1) |
| `direction` | enum | `manager_to_driver \| driver_to_manager` (Phase 3 = manager_to_driver only) |
| `score` | int | 1–5 |
| `comment` | text | Free-form, max 500 chars |
| `tags` | string[] | Multi-select pre-canned tags: `Punctual`, `Clean car`, `Polite`, `Safe driver`, `Knew the route`, `Late`, `Rude`, `Reckless`, `Vehicle issues` |
| `is_published` | boolean | Default true; admin can hide |
| `is_flagged` | boolean | Auto-set by profanity filter or user "Report this review" tap |
| `flag_reason` | text | "profanity" / "personal info" / user-supplied |
| `moderated_by` | UUID | FK → users (admin) |
| `moderated_at` | timestamp | |
| `created_at` | timestamp | |

**Constraints:**
- Unique `(trip_id, rater_user_id, ratee_user_id, direction)` — one review per direction per trip
- Reviews can only be left when `trip.status='completed'` and `created_at` ≤ 7 days after completion
- Editable by author for 24 h; immutable thereafter (history retained in `ratings_edits` audit table)

### Cached Aggregates on `drivers`
| Field | Type | Description |
|-------|------|-------------|
| `rating_avg` | numeric(2,1) | Cached average of all published ratings (recomputed on insert/edit/moderation) |
| `rating_count` | int | Cached count of published ratings |
| `rating_distribution` | jsonb | `{1: count, 2: count, 3: count, 4: count, 5: count}` for histogram |
| `top_tags` | string[] | Top 3 most-used positive tags (for profile badge display) |

A Postgres trigger on `ratings` recomputes these on INSERT / UPDATE / DELETE.

### UX Flow

**Leaving a review (manager / passenger after trip completion):**
1. Trip status flips to `completed` → push notification: "Rate your driver — [Driver Name]"
2. Tap → modal with: 5-star selector (large taps), tag chips (multi-select, color-coded positive/negative), free-text box, "Submit"
3. Submitted review appears on driver's public profile within seconds
4. 24-h edit window, then locked

**Public Driver Profile screen (visible to any approved poster):**
- Header: photo, name, ★ avg + count, total trips completed, home city
- Rating breakdown bar chart (5★ ████████ 80% … 1★ ▎ 2%)
- Top tags pill row (e.g. ★ Punctual · Clean car · Polite)
- Reviews list (newest first), each row: ★ score, comment, tags, "X days ago" (rater identity hidden — shown only as "Trip Manager" / "Passenger")
- "Report this review" affordance under each review (only one report per user per review)
- Pagination (20 reviews / page)

**Applicant Review screen** (where this matters most):
- Each driver applicant card surfaces: photo · ★ rating with count · completed trips · top tag · vehicle · distance from pickup · counter-quote
- "View profile" → public driver profile
- This is *the* screen where reputation pays off — clear visual hierarchy lets a manager pick the best applicant in seconds

### Moderation
- **Auto-flagging**: profanity filter (English + Tamil + Hindi keyword lists, admin-editable) + simple PII detector (phone numbers, emails) → `is_flagged=true`, hidden from public profile until moderated
- **User reporting**: any logged-in user tapping "Report this review" → `is_flagged=true` + reason logged
- **Admin Reviews Moderation page**: queue of flagged reviews; admin can publish / hide / delete + optionally deactivate the offending account in one tap
- **Pattern detection**: if a driver receives 3+ ★1-2 reviews in a 30-day window, admin gets a system notification

### Anti-gaming Rules
- Only the `rater_user_id` from the trip's poster (or assigned passenger) can leave a review for that trip — enforced via RLS
- Driver cannot review the manager who selected them in v1 (`direction='manager_to_driver'` only). Open Question #10 covers v2 expansion.
- One review per trip per direction (unique constraint above)
- Self-review impossible (CHECK `rater_user_id != ratee_user_id`)
- New driver (< 5 trips) shows "New driver" badge instead of misleading-low rating count

### Notifications related to reviews
- "Your driver completed the trip — leave a review" (manager, on `trip.status='completed'`)
- "You received a new ★N review from [Trip Manager]" (driver, on review insert)
- "Your review was hidden by an admin: [reason]" (rater, on moderation)
- "Your account has 3 low ratings this month — please contact support" (driver, on pattern detection)

---

## Workflow Document & Prototype Deliverable

Following the same pattern used for **Ayusmat / Naturopathy Hospital** (`C:\Apps\Ayusmat\docs\naturopathy-hospital-flows.html`), DriverMahal will ship two pre-implementation artifacts so stakeholders can review the experience before any backend work:

### 1. Workflow HTML doc — `docs/drivermahal-flows.html`

Single self-contained HTML file (no build, opens directly in browser) with:
- Sticky top nav linking to each role's flow
- Hero section + role legend (color-coded: Driver / Trip Manager / Admin)
- **Per-role operational flows** rendered as connected boxes with arrows:
  - Driver flow: Sign up → Language → Profile → KYC docs → Vehicle + photos → Schedule video call → KYC pending → Approved → Home → (Post Vacancy / Apply to Trip / Post Trip / View Applicants / Complete trip / Receive review)
  - Trip Manager flow: Sign up → Language → Profile → KYC docs → Schedule video call → KYC pending → Approved → Dashboard → Post Trip → Review Applicants → Pick driver → Track lifecycle → Leave review
  - Admin flow: KYC review (drivers + managers) → Video call console → Approve/reject → Master data CRUD → Vehicle eligibility monitoring → Translation manager → Reports → Reviews moderation
- **Mock dashboards** rendered inline (mini cards showing My Posted Trips, Applicant Review, Vehicle Eligibility, Translation Coverage)
- Notification flow diagram (alert match → push → in-app inbox)
- Access control matrix table
- Mobile-responsive, dark theme to match Ayusmat aesthetic

### 2. Clickable prototype — `prototype/` folder

Mirrors the Ayusmat layout — `prototype/index.html` boots a small React or static-HTML app with:
- All driver / manager / admin screens linked together (no real backend; mock data in JSON)
- **Uber-style mobile shell** (390 px viewport simulator + desktop fallback) for driver/manager apps
- Web-first admin shell
- All 3 languages selectable from the splash to demonstrate the i18n switch
- Hardcoded sample data: 5 drivers (with photos, ratings, vehicles), 8 trips, 3 trip managers, 1 admin

This prototype is **walked through with target drivers** (Uber-familiar audience) for usability feedback before Phase 0 backend work begins.

### Acceptance criteria for Phase W
- [x] `docs/drivermahal-flows.html` covers all 3 roles end-to-end (v2 baseline; v3 surfaces are documented inline below).
- [x] Prototype renders all screens listed in the Pages section.
- [x] All flows readable on a 390 px wide mobile viewport (iPhone 14 Pro Max validated).
- [ ] Stakeholders sign off on the prototype before we start writing migrations.

---

## Features as built (Phase W shipped)

Reference for what's running on https://driver-mahal.vercel.app today. Useful when scoping Phase 0+ backend work — every store maps 1:1 to a future SQL table or edge function.

### Routes

| Route | Role | Page |
|---|---|---|
| `/` | public | SplashPage (language picker) |
| `/login` | public | LoginPage (role chooser) |
| `/passenger` | public, no login | PassengerPage (OTP gate → trip view → review) |
| `/driver` | driver | DriverHomePage (location chip + map-search picker, trip feed, hero cards for assigned trips + active vacancy) |
| `/driver/trips` | driver | TripFeedPage (default-near-me, search, radius, car-type filters, AC-only) |
| `/driver/trips/:tripId` | driver | TripDetailPage (route + payout + Posted-by Call/SMS + Apply CTA) |
| `/driver/post-vacancy` | driver | PostVacancyPage (map-driven from + multi-add destinations, peer-vacancies preview, editable hours w/ projected end time) |
| `/driver/post-trip` | driver | PostTripPage (also `/manager/post-trip`) |
| `/driver/my-vacancies` | driver | MyVacanciesPage (Active + History, +4h Extend, Cancel) |
| `/driver/my-trips` | driver | MyAssignedTripsPage (Upcoming / In progress / Completed) |
| `/driver/my-trips/:tripId` | driver | AssignedTripDetailPage (passenger + manager contacts, OTP entry gate, odometer photos, driver notes) |
| `/driver/vacancies` | driver | VacanciesPage role="driver" (peer awareness; default-filter to currentCity) |
| `/driver/alerts` | driver | AlertsPage (Active / Paused / Expired) |
| `/driver/alerts/new` | driver | CreateAlertPage |
| `/driver/alerts/:alertId` | driver | AlertDetailPage |
| `/driver/profile` | driver | ProfilePage (KYC docs, vehicles w/ 4-side photos, language switcher) |
| `/manager` | trip manager | ManagerHomePage (Find Driver tile, KPI tiles drill into Posted Trips filtered) |
| `/manager/post-trip` | trip manager | PostTripPage (full commercial form + privacy toggles) |
| `/manager/posted-trips` | trip manager | PostedTripsPage (status tabs via `?status=`, tap card → applicants) |
| `/manager/posted-trips/:tripId/applicants` | trip manager | ApplicantReviewPage (TripSummaryCard + assigned-driver hero with OTP + privacy toggles + Other applicants for re-assign + Cancel trip CTA) |
| `/manager/find-driver` | trip manager | VacanciesPage role="manager" (filter by city + radius, Send-trip + Call CTAs) |
| `/manager/profile` | trip manager | ProfilePage |
| `/drivers/:driverId` | public (admin sees more) | DriverProfilePage (rating histogram + reviews; admin view also surfaces contact, identity docs grid, vehicle photos + RC + Insurance + Permit + retirement-year hint) |
| `/admin` | admin | AdminDashboardPage |
| `/admin/kyc` | admin | AdminKycQueuePage |
| `/admin/drivers` | admin | AdminDriversPage (search by name/vehicle/registration, sort by rating/trips/recent/A-Z, filter by KYC + car type + AC) |
| `/admin/vehicles` | admin | AdminVehicleEligibilityPage |
| `/admin/translations` | admin | AdminTranslationManagerPage |

### Reusable components

| Component | Purpose |
|---|---|
| `LocationSearchPanel` | Single inline picker used by every from/to / location filter. Wraps `useLocationSearch` (Nominatim today, Google Places later). Exposes `LocationValue { name, state?, country?, lat, lng, displayName? }`. |
| `cn()` (lib/utils) | shadcn-standard tailwind-merge helper. |
| `formatINR / formatKm / formatRating / haversineKm / initials` | Shared formatters. |
| `Card / Button / Badge / Avatar / Input` (shadcn) | UI primitives in `components/ui/`. |

### Persisted client stores (Zustand + localStorage)

These map 1:1 to future server-side tables / edge function endpoints. The prototype writes to localStorage so refresh preserves state.

| Store | Persisted shape | Migrates to |
|---|---|---|
| `useAlertsStore` | `alerts: UIAlert[]` keyed-by-id, with active/paused/expired derivation via `getAlertStatus()`. Seeded with 3 demo alerts. | `alerts` table + `match_alerts_for_trip()` PG function |
| `useMyVacanciesStore` | `vacancies: MyVacancy[]` (Active + Cancelled). `addVacancy / cancelVacancy / extendVacancy(+4h)`. | `vacancy_posts` table |
| `useMyApplicationsStore` | `byTrip: Record<tripId, MyApplication>` w/ `appliedAt + withdrawnAt + quotedRatePerKm + message`. | `trip_acceptances` table |
| `useTripStateStore` | `overlays: Record<tripId, TripOverlay>` carrying status / assignedDriverId / acceptanceStatuses / `passengerOtp` / `showFareToPassenger` / `hidePassengerPhone` / cancelledAt / cancelReason. Migrate-aware (v3) so version bumps don't error. Seeded with one demo overlay (trip `t-1`, OTP `123456`). | `trips` table updates + `trip_assignments_history` |
| `useTripExecutionStore` | `byTrip: Record<tripId, TripExecution>` with `startedAt + startOdo (data-URL, capped ~700 KB) + completedAt + endOdo + driverNotes`. Includes `fileToCappedDataUrl()` helper. | New `trip_executions` table + Supabase Storage bucket for odometer photos |
| `usePassengerReviewsStore` | `byTrip: Record<tripId, PassengerReview>` + `consumedOtps: Record<otp, tripId>`. | Extend `ratings` table with passenger-direction reviews; consumedOtps becomes a server-side single-use enforcement |

### Auth (prototype)

- AuthContext persists active role to `localStorage[drivermahal:auth]` and rehydrates on mount, so refreshing any page (including `/driver/profile`) keeps the session.
- `loginAs(role)` is a developer affordance — production replaces it with phone OTP (driver/manager) or email+password (admin).

### PWA

- `registerSW({ immediate: true })` polls every 60 s + on `visibilitychange` + on `focus`.
- On `controllerchange` the SW wipes all `caches.keys()` then `location.reload()` — prevents stale chunk references after deploy.
- Manifest icons + favicon shipped; viewport meta uses no `maximum-scale` so pinch-zoom works (a11y).

### Privacy controls (manager → trip)

Two toggles persisted on the `tripStateStore` overlay:

| Toggle | Default | Driver-side effect | Passenger-side effect |
|---|---|---|---|
| `showFareToPassenger` | ON | n/a | `/passenger` shows trip fare card with line items; OFF → "Fare handled separately" copy |
| `hidePassengerPhone` | OFF | AssignedTripDetailPage hides phone + Call/Message buttons; shows amber hint to route through manager | n/a |

Manager flips both from the assigned-driver hero card on Applicant Review (Eye / EyeOff buttons).

### OTP flow (security gate)

1. **Generation** — auto-fired on `assignDriver()` via `tripStateStore`. 6 numeric digits, persists on overlay. Re-assignment preserves OTP so passenger doesn't need re-issue.
2. **Manager view** — big monospace OTP card with Regenerate button.
3. **Out-of-band share** — manager texts/WhatsApps the OTP to the passenger.
4. **Passenger view** — `/passenger` OTP gate → on match, full trip view + driver/manager contacts + (optionally) fare + post-completion review form.
5. **Driver gate** — Start trip CTA opens an inline 6-digit input. Verify checks `overlay.passengerOtp`; on match opens odometer photo capture; on mismatch toasts an error.
6. **Single use for review** — `consumedOtps` flag in `passengerReviewsStore` prevents review replay.

### Trip lifecycle (prototype state)

```
[posted by manager] → [drivers apply via myApplicationsStore]
       │                          │
       ▼                          ▼
[has_applicants]         [✓ You applied badge on every card]
       │
       │ manager picks one on ApplicantReviewPage
       ▼
[assigned] → tripStateStore.assignDriver()
   ├─ assigned applicant → status='selected'
   ├─ all others → status='rejected'
   ├─ passengerOtp generated
   └─ defaults: showFareToPassenger=true, hidePassengerPhone=false
       │
       │ driver enters OTP (gates capture flow)
       │ driver captures start-odometer photo
       ▼
[in_progress] → tripExecutionStore.startTrip()
       │
       │ driver captures end-odometer photo + optional notes
       ▼
[completed] → tripExecutionStore.completeTrip()
       │
       └─ passenger can submit review on /passenger
              → passengerReviewsStore.submit()
              → markOtpUsed() prevents replay
```

Cancel paths:
- **Manager cancel** (any time before completion) → `tripStateStore.cancelTrip(reason)` → status `cancelled` everywhere; applicants notified.
- **Driver cancel** (post-assignment, pre-start) → `tripExecutionStore.cancel(reason)` (handler shipped, UI surface deferred).
- **Driver withdraw application** (pre-assignment) → `myApplicationsStore.withdraw()` → "✓ You applied" badge disappears.
- **Re-select after assignment** — manager can pick a different applicant if the current one becomes unavailable; previous selection auto-flips to `rejected` and is notified.

### Surfacing & filtering patterns

- **Default-near-me** on Driver Trip Feed and Driver Vacancies — derived from `mockDrivers.find(d => d.userId === user.id).currentCity`. Header reads "Trips from {city}" / "Drivers vacant in {city}".
- **Tap-to-drill KPI tiles** on Manager Home → `/manager/posted-trips?status=...` (URL-driven so back button + bookmarks behave).
- **"Your post" highlight** on the public Vacancies feed — any vacancy whose driver is the current user gets emerald ring + badge and pinned to the top.
- **Multi-trip dashboard** for managers — tabs by status, applicant-count badges, "Review applicants →" CTA on cards with applicants.

### Mobile camera capture

- `<input type="file" accept="image/*" capture="environment">` opens the rear camera on mobile, falls back to file picker on desktop.
- `fileToCappedDataUrl()` (`tripExecutionStore`) progressively scales the image until under ~700 KB so multiple photos still fit in localStorage.
- Inline thumbnails preview the captured image; status timeline shows the timestamp.

### Demo conveniences (won't ship to production)

- Pre-seeded `t-1` overlay assigning driver `d-ravi` with OTP `123456` and `showFareToPassenger=true` so `/passenger` works on first launch.
- Pre-seeded acceptances for `t-2` (2 applicants) and `t-5` (1 applicant) so "has applicants" trips actually open to populated review screens.
- Splash page shows a "Are you a passenger?" link to `/passenger` so testers don't have to type the URL.
- Mock service-layer functions inject 80–200 ms delay so React Query loading states render realistically.

### Open work (deferred from this prototype push)

- **Translation Manager edit screen** — mock data for keys + per-language values shipped (`src/data/translationsMockData.ts`), but the click-Edit-→-key-by-key editor screen is not yet built.
- **KYC Review detail page** — mock data for queue subjects shipped (`src/data/kycMockData.ts`), but clicking a queue card to see docs + pending checks isn't yet wired.

These should be straightforward Phase 1 additions — store and data shapes are settled.

---

## Change Log

- **2026-05-08** — Initial requirements captured from user prompt (3 roles, vacancy posting, trip posting with rate/commission/GST/car type, alert matching with from/to + radius KM, admin KYC verification with Aadhaar + photo + 4-side car photos + make/model/year).
- **2026-05-09** (v2) — Major update incorporating clarifications:
  - Trip Manager now requires admin approval with full KYC (Aadhaar + Voter ID + selfie + phone OTP + video call)
  - Added video-call verification flow for both drivers and trip managers (`video_verifications` table, Video Call Console)
  - First admin provisioned manually via SQL (no UI bootstrap)
  - Added `app_settings.min_vehicle_year` configuration + Vehicle Eligibility Dashboard with nightly refresh + expiry pushes
  - Added multi-driver acceptance flow (`trip_acceptances` table, Applicant Review screen, multi-trip dashboard for posters)
  - i18n promoted from Phase 2 to Day 1 — Tamil + Hindi at launch via admin Translation Manager (`languages`, `translation_keys`, `translations` tables); language picker on splash; per-user `preferred_language`; runtime DB-driven loader
  - Adopted **Uber-style mobile-first design language** for driver and manager apps
  - **Expanded Reviews & Ratings** into a first-class feature: tags, public driver profiles, moderation queue, anti-gaming rules, cached aggregates with histogram
  - Added Phase W (Workflow Doc + Prototype) before Phase 0 — single-file flows HTML + clickable prototype following Ayusmat pattern
  - Resolved Open Questions #2 and #9; added 3 new questions (#9–11)

- **2026-05-09** (v3) — Prototype shipped to https://driver-mahal.vercel.app. Spec edits to match what was built and validate the UX:
  - **Map-driven from/to throughout** — single reusable `LocationSearchPanel` component (Nominatim today, Google Places-ready). Captures lat/lng on every selection. No map UI in MVP — search-first flow tested better with Uber-familiar drivers.
  - **Default-near-me browse** — Driver lands on Trips and Vacancies pre-filtered to their currentCity. Header reads "Trips from {city}" / "Drivers vacant in {city}".
  - **Trip lifecycle stores added** to support the prototype client-side — `myApplicationsStore`, `myVacanciesStore`, `tripStateStore` (overlays), `tripExecutionStore` (start/complete + odo photos), `passengerReviewsStore`. Each maps 1:1 to a future server table; the shapes are settled.
  - **Passenger OTP** — auto-generated on `assignDriver()`. Manager shares out-of-band; driver enters before Start; passenger types on `/passenger` to view the trip + leave a review. Single-use for review submission via `consumedOtps`.
  - **Passenger Portal** — new public route `/passenger`, no login. OTP gate → trip view (route, driver card with Call/SMS, manager card with Call/SMS, fare card, review form once trip completes).
  - **Privacy toggles for trip poster** — `showFareToPassenger` (default ON) and `hidePassengerPhone` (default OFF), set on Post Trip and adjustable post-assignment from the Applicant Review hero card.
  - **Odometer photo capture** — `<input capture="environment">` for rear-camera-first capture, client-side compression (`fileToCappedDataUrl`) keeps the persisted state under the localStorage budget. Captured at start + end of trip.
  - **Driver assigned-trip surface** — `/driver/my-trips` (Upcoming / In progress / Completed buckets) + `/driver/my-trips/:tripId` with passenger card (with Call/SMS gated by hidePassengerPhone), trip-manager card with Call/SMS, status timeline (Selected → Started → Completed), driver notes textarea.
  - **Driver vacancy lifecycle** — Post Vacancy now actually persists via `myVacanciesStore`. "Your active vacancy" hero card on Driver Home with +4h Extend / Manage / Cancel. New `/driver/my-vacancies` page (Active + History). Peer-awareness card on Post Vacancy showing other drivers free in the chosen city.
  - **Apply / Withdraw** — `myApplicationsStore` persists a driver's applications. "✓ You applied" badge appears on every trip card across DriverHome, TripFeed, AlertDetail. Apply CTA on TripDetail flips to "Applied" pill with Withdraw button + "Submitted N min ago" timestamp banner.
  - **Re-assignable applicants + cancel posted trip** — Applicant Review keeps the assigned driver as a hero card with Other applicants below for one-tap re-assign; sticky "Cancel posted trip" CTA with optional reason prompt.
  - **Tappable KPI tiles** on Manager Home drill into `/manager/posted-trips?status=...` (URL-driven for bookmark/back-button friendliness). Trip cards have a "Review applicants →" CTA when there are applicants.
  - **TripDetailPage Posted-by card** — surfaces the manager's name + phone + Call/Message buttons; passenger phone gated by `hidePassengerPhone` on AssignedTripDetailPage.
  - **Admin Drivers list** — `/admin/drivers` with full search (name, phone, vehicle, registration, city), sort (rating / trips / recent / A-Z), filter chips (KYC status, car type, AC-only). KPI strip at top.
  - **Admin-rich DriverProfile** — same `/drivers/:id` URL, role-aware rendering. Admins see contact, identity-documents card with masked Aadhaar/Voter ID/license, 6-tile uploaded-scans grid, vehicle card with full spec grid + 4-side photo grid + RC/Insurance/Permit checks + retirement-year hint.
  - **Auth persistence** — `AuthContext` mirrors active role to `localStorage[drivermahal:auth]`, so refreshing any page keeps the session.
  - **PWA auto-update SW** — `registerSW({ immediate: true })` polls every 60 s + on focus + visibilitychange; on `controllerchange` wipes caches and reloads. Avoids stale-bundle white-screens.
  - **Demo seeds** — `tripStateStore` ships with one pre-assigned overlay (trip `t-1`, OTP `123456`) so `/passenger` works on first launch. Mock acceptances added for trips `t-2` and `t-5` so "has applicants" trips open to populated review screens.
  - **Editable availability hours on Post Vacancy** — interactive stepper with quick-pick chips (4h / 8h / 12h / 24h), live "Until" projection, "today" / "tomorrow" / weekday hint.
  - **Applied state across feeds** — green "✓ You applied" badge on every trip card the driver has applied to.
  - Open work: Translation Manager edit screen + KYC Review detail page (mock data ready in `src/data/translationsMockData.ts` and `src/data/kycMockData.ts`, page wiring deferred).

- **2026-05-11** (v4) — Shareable trip card + clean share links:
  - **Shareable trip card** — "Share trip" opens `ShareTripModal` (bottom-sheet on mobile, centered on desktop) rendering `TripShareCard` (1080×1200 marketing card: emerald header, route hero, "Posted by", big pickup pill, distance + est. duration, payout breakdown line items, vehicle chips, QR code, "DEPARTING SOON" badge when pickup ≤6h, trip-ID footer). Three share paths: native `navigator.share({ files })` with graceful degradation, Download PNG (`html-to-image`), Copy text + link (`buildShareCaption`).
  - **Clean share links** — `buildShareUrl(trip)` returns just `/driver/trips/<id>` (no `#d=<base64>` hash). A posted trip resolves by id on the device where it was posted (`userPostedTripsStore`). Cross-device sharing was intentionally dropped — there's no server to look the trip up. `decodeTripFromHash` is retained only so links shared during earlier testing still resolve.
  - **Cross-device shared-link fallback** — when a `/driver/trips/:id` link can't be resolved on this device (the trip lives only in the poster's browser), `TripDetailPage` redirects to a random seeded trip that already has applicants (`FALLBACK_TRIP_IDS = ['t-1','t-2','t-5']`) instead of dead-ending — keeps the demo flowing on any device.
  - **Applicants list on `TripDetailPage`** — the trip-detail page now lists the drivers who applied (avatar, name, rating, vehicle, quoted ₹/km) via `useTripApplicants`, replacing the bare "N other drivers applied" count.
  - **`TripNotFound` component** — `src/components/common/TripNotFound.tsx`, still used by `AssignedTripDetailPage` (an assigned-trip link that no longer resolves) — explains the link may be stale with a CTA back to the trip list.
  - **Driver "My Applications"** — new route `/driver/my-applications` (`MyApplicationsPage`), sibling to `/driver/my-trips` and `/driver/my-vacancies`. Buckets every trip the driver applied to by outcome — **Awaiting decision** / **Selected** / **Closed** (not selected / withdrawn / cancelled / trip gone) — with route, pickup, payout, applied time-ago, the driver's quoted ₹/km, a per-row outcome badge, and a Withdraw action on pending rows. Outcome is derived by merging `myApplicationsStore` with the trip overlay (`applicationOutcome` helper in `myApplicationsStore.ts`). Surfaced on Driver Home as a conditional summary card ("You've applied to N trips · M awaiting · K selected", shown only when there's ≥1 live application) plus a "My applications →" link in the trip-feed header next to "Drivers nearby →".

- **2026-05-12** (v5) — Phone-OTP auth, single all-roles hub, PWA install, "Trip King" rebrand, trip-form extras:
  - **Phone registration** — `/auth` (`AuthPage`): country code + number → 5-digit OTP (demo: `12345`) → first/last name (new accounts only). Persisted in `useAuthStore`; one account per device, every capability. `AuthContext` projects it onto a synthetic `User` pinned to seed driver `u-driver-1` with `role: 'admin'`. Returning device skips the splash and lands on `/home`. Replaces the old role picker (`LoginPage` deleted, `loginAs` removed).
  - **Single home hub** — `DriverHomePage` becomes `/home` with a tile grid (Post Trip · Post Vacancy · Trips · Vacant · Administration) above the existing feed + summary cards. `RequireAuth` gates the registered-account area; `/driver` and `/manager` redirect to `/home`; `/login` → `/auth`.
  - **PWA install** — `usePwaInstall` (beforeinstallprompt / appinstalled / standalone + iOS/Android/desktop sniff) + `InstallAppCard` (native prompt on Chromium, Share→Add-to-Home-Screen hint on iOS). Shown on `/home` (dismissable) and `/auth`. `purpose: 'any maskable'` on the manifest icons.
  - **"Trip King" rebrand** — new crown SVG logo (PWA icons 192/512, favicon, `logo-mark.svg` used on splash/auth). User-visible "DriverMahal" → "Trip King" (two words) in the manifest, title, headings, install copy, share-card wordmark (🚖→👑), share caption, welcome strings (en/ta/hi). Internal ids / localStorage keys / `api.*` hostnames / doc filenames left as-is.
  - **Trip-form extras** — Post Trip gains: **Driver bata** (₹, default 300 — paid straight to the driver, on top of the fare; folded into the driver's payout), a **"Packing, toll & permit — extra, paid by passenger"** checkbox (replaces the old 3-option toll selector), and an editable **Driver instructions** textarea pre-filled with "Call customer before arrival / Reach 10 mins early / Follow Google Maps route". New `Trip` fields: `driverBata?`, `extrasPaidByPassenger?`, `driverInstructions?`, `postedByPhone?`; helpers in `src/lib/tripDefaults.ts`. Driver-facing surfaces (`TripDetailPage`, `AssignedTripDetailPage`) show the instructions card, bata in the payout breakdown, and the extras line. Seed trips bumped (`driverBata: 300`, payout +300).
  - **WhatsApp/Telegram share message** — `buildShareCaption` rewritten into three icon-led, blank-line-separated blocks: (1) Car type · Pickup · Drop · Distance · Pickup date · Time; (2) Per km · Commission % + GST ₹ · Bata ₹ · ≈ Approx. cost (= km×rate − commission − GST + bata); (3) Posted by · Contact no. (resolved from `postedByPhone` or seed data), then the deep link.
