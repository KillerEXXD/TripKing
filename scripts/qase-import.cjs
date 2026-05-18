#!/usr/bin/env node
/**
 * One-shot importer: HTML QA doc → Qase test cases.
 *
 * Why a script and not a one-time UI session: the QA doc has 9 phases / ~40
 * scenarios / ~60 steps. Hand-typing into Qase is two hours of error-prone
 * copy/paste. This codifies the mapping in one place, runs idempotently, and
 * makes future doc → Qase updates a one-command operation.
 *
 * Mapping:
 *   - Each phase (P0 … P8)  → Qase Suite
 *   - Each scenario (P0.1 …) → Qase Test Case in that suite, with
 *     `automation = manual`, `priority = high` (medium for nit scenarios),
 *     `severity = medium`, `is_flaky = false`, structured `steps[]`.
 *
 * Idempotency: we look up existing cases by title within the suite and PATCH
 * them rather than creating duplicates. Re-run any time after the doc changes.
 *
 * Usage:
 *   node scripts/qase-import.cjs --dry-run     # write qase-import-preview.json, no API calls
 *   node scripts/qase-import.cjs               # live import (POST/PATCH against api.qase.io)
 *
 * Env (read from .env.development):
 *   QASE_API_TOKEN     — required (Profile → API tokens in Qase)
 *   QASE_PROJECT_CODE  — required (e.g. TRIPKINGAP)
 */
'use strict';

const fs = require('fs');
const path = require('path');

// ── Env loading (no dotenv dep; .env.development is tiny) ──────────────────
function loadEnv() {
  const envPath = path.resolve(__dirname, '..', '.env.development');
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
loadEnv();

const TOKEN = process.env.QASE_API_TOKEN;
const PROJECT = process.env.QASE_PROJECT_CODE;
const DRY = process.argv.includes('--dry-run');

if (!DRY) {
  if (!TOKEN) { console.error('QASE_API_TOKEN not set. Use --dry-run for a preview without API calls.'); process.exit(1); }
  if (!PROJECT) { console.error('QASE_PROJECT_CODE not set (e.g. TRIPKINGAP).'); process.exit(1); }
}

// ── Embedded scenario data — single source of truth for Qase ───────────────
// Mirrors public/docs/manual-qa-invite-flow.html (TripKing-tour repo). When
// the HTML changes, update this block too and re-run the import.
const PHASES = [
  { code: 'P0', title: 'P0 · Onboarding & KYC',           description: 'One-time per account (4 accounts: A-agent, A-driver, B-agent, B-driver). Unlocks posting/applying/inviting.' },
  { code: 'P1', title: 'P1 · Trip posting',                description: 'Happy + every rejection path. Verifies KYC gating, validation, edit, pre-applicant cancel.' },
  { code: 'P2', title: 'P2 · Discovery & application',    description: 'Driver finds the trip in the public feed and applies organically.' },
  { code: 'P3', title: 'P3 · Invitation',                  description: 'Agent invites specific drivers — single, multi, radius, decline, re-invite, dedup, and the new Auto-invite-on-post toggle (P3.8–P3.14).' },
  { code: 'P4', title: 'P4 · Selection (two-step handshake)', description: 'Agent picks → trip Selected with countdown → driver accepts/declines/expires.' },
  { code: 'P5', title: 'P5 · Passenger engagement',       description: 'Agent shares the /passenger/{otp} link manually; passenger sees trip detail + live tracking.' },
  { code: 'P6', title: 'P6 · Start & in-progress',        description: 'OTP handshake, brute-force lockout, live tracking, offline, mid-progress cancel.' },
  { code: 'P7', title: 'P7 · Completion & reviews',       description: 'Complete, complete-without-start blocked, reviews both directions, one-sided, review-on-cancelled blocked.' },
  { code: 'P8', title: 'P8 · Notifications & inbox',      description: 'Bell badge, deep-link per type, mark-read.' },
  { code: 'V',  title: 'V · Vacancy lifecycle',           description: 'PR #167 — overlap fix (multi-day trips honour expected_end_at) + pg_cron auto-expiry every 5 min. Driver vacancy must flip to on_trip on accept, revert on cancel, expire on start or window close.' },
  { code: 'R',  title: 'R · Referral program',            description: 'Referral program (Stages 6–9). Per-trip platform-fee accruals → referrer earnings → transfer-to-wallet OR UPI withdrawal → admin queue → fraud auto-detection on qualification + admin operations. Notifications (12 new types in migration 049) ride along.' },
  { code: 'N',  title: 'N · Navigation & Breadcrumbs',    description: 'PR #263 — the back-button on a trip detail (or any leaf page reached from a home-tab work card) must return to the LIST the user came from, not the generic /my-trips or /posted-trips fallback. Covers driver + agent. Also covers visual continuity: scoped page headers use the same accent colour as the home card that linked to them, and destructive actions (e.g. Decline invitation) sit INSIDE their parent trip card. List pages auto-refresh on back-navigation so any status change made on the detail page is reflected immediately.' },
  { code: 'M',  title: 'M · Multi-way trips',             description: 'Migration 024 trip_type=multi_way — itineraries with ≥3 waypoints (pickup, ≥1 intermediate stop, final destination which may equal the pickup for a city-loop). Covers the POST /trips body-shape contract (server-side validation: ≥3 waypoints, strictly monotonic arrive_at, last-may-equal-first), the form-level Multi-way tab UI, and the full trip lifecycle (post → apply → assign → accept → start → complete) to prove multi-way trips behave identically to one-way trips for the trip-acceptance endpoints. Mirrored 1:1 by e2e/trip-types.spec.ts M1-M5 + the existing tab test.' },
];

// Each scenario: { phase, id, title, preconditions?, steps[{action, expected}] }
const SCENARIOS = [
  // ── P0 ────────────────────────────────────────────────────────────────
  { phase: 'P0', id: 'P0.1', title: 'Sign-up & OTP login', steps: [
    { action: 'Open /signin. Enter the 10-digit phone for this role. Tap Send OTP.', expected: 'Toast "OTP sent". Code-entry screen appears. Dev mode also carries dev_otp:"12345". Rate-limited: 20/phone/10min; 21st → 429.' },
    { action: 'Enter 12345. Tap Verify.', expected: 'Toast "Signed in". Redirect to /profile on first login else /. Tokens stored.' },
    { action: 'Try wrong OTP (00000).', expected: 'Inline "Invalid OTP" 400 — not a 500. No lockout after 1 wrong try.' },
  ]},
  { phase: 'P0', id: 'P0.2', title: 'Profile setup', steps: [
    { action: 'Agent: business name, contact, home city. Save.', expected: 'Toast "Profile saved". Redirect to /. POST /agents.' },
    { action: 'Driver: full name, home city, languages. Save.', expected: 'Toast "Profile saved". Redirect to /vehicles/new. POST /drivers.' },
    { action: 'Reload and confirm fields persist.', expected: 'GET /me returns the row.' },
  ]},
  { phase: 'P0', id: 'P0.3', title: 'Driver adds a vehicle', steps: [
    { action: 'Go to /vehicles/new. Make/model/year (≥ 2015), reg, fuel, seats, RC/insurance/permit expiry. Save.', expected: '"Vehicle added". Eligible badge. POST /vehicles. Server computes eligibility_status.' },
    { action: 'Try year 2010.', expected: '400 "Vehicle too old (min year 2015)". No row created.' },
    { action: 'Open vehicle → Add photos (5 photos).', expected: 'Photos saved to private vehicle-photos bucket. Completeness 5/5.' },
  ]},
  { phase: 'P0', id: 'P0.4', title: 'KYC identity-doc upload (not vehicle docs)', preconditions: 'This scenario covers identity docs only — vehicle docs are P0.3.', steps: [
    { action: 'Driver: Get verified → Documents. Upload Aadhaar (front+back), DL (front+back), selfie.', expected: 'Each upload thumbnails + checks. kyc_status = docs_submitted.' },
    { action: 'Agent: Get verified → Documents. Upload Aadhaar + selfie.', expected: 'kyc_status = docs_submitted.' },
    { action: 'Tap Submit for review.', expected: 'kyc_status flips to video_pending. Banner now points at video-call step.' },
  ]},
  { phase: 'P0', id: 'P0.5', title: 'KYC video call booking & admin finalisation', steps: [
    { action: 'Open /verify/video-call. Pick an available slot. Confirm.', expected: 'Slot booked, Jitsi room URL shown. POST /video-verifications.' },
    { action: 'At slot time, tap Join call. Show face + Aadhaar.', expected: 'Jitsi opens. Call is recorded to private bucket.' },
    { action: 'Admin: /administration/video-calls → Finalise → 3-gate decision → Approve.', expected: 'kyc_status → approved. Notification: kyc_status_change "✅ You\'re verified". Verified badge on profile.' },
  ]},
  { phase: 'P0', id: 'P0.6', title: 'KYC rejection & resubmit', steps: [
    { action: 'Admin: Finalise → Reject. Reason: "Aadhaar photo blurry".', expected: 'kyc_status → resubmit_required. User bell: kyc_status_change "❌ Your KYC was rejected — see reason".' },
    { action: 'Re-upload Aadhaar and re-submit.', expected: 'Status returns to docs_submitted then video_pending after a new booking.' },
  ]},

  // ── P1 ────────────────────────────────────────────────────────────────
  { phase: 'P1', id: 'P1.1', title: 'Post a valid trip (happy)', steps: [
    { action: 'Post trip wizard. Step 1: Vellore → Chennai, tomorrow 09:00, sedan, 4 seats, AC, one-way. Next.', expected: 'Distance auto-fills ~140 km. Step 2 form shown.' },
    { action: 'Step 2: ₹15/km, bata ₹300, GST ₹100 flat (default from app_settings), passenger details, window 15 min. Post trip.', expected: '"Trip posted". Land on /trips/{id}. Status: Open. POST /trips.' },
  ]},
  { phase: 'P1', id: 'P1.2', title: 'KYC-blocked post (403)', steps: [
    { action: 'Use unverified agent. Try /trips/new → submit.', expected: '403 KYC_REQUIRED. "Get verified to continue". Redirect to /verify. No trip row.' },
  ]},
  { phase: 'P1', id: 'P1.3', title: 'Invalid data — rejection paths', steps: [
    { action: 'Pickup in the past, missing passenger phone, rate/km 0, same from/to.', expected: 'Each: inline error 400.' },
    { action: 'Window slider 4 min.', expected: 'Blocked (range 5–30).' },
  ]},
  { phase: 'P1', id: 'P1.4', title: 'Edit posted trip (pre-applicant)', steps: [
    { action: 'Open the trip from P1.1 while status=open. Edit rate to ₹16/km. Save.', expected: '"Trip updated". Detail page reflects ₹16/km. PATCH /trips/{id}.' },
    { action: 'After someone applies, try edit.', expected: 'Edit hidden or 409 from server.' },
  ]},
  { phase: 'P1', id: 'P1.5', title: 'Cancel an open trip (no applicants)', steps: [
    { action: 'Post a fresh trip. From menu → Cancel trip. Reason. Confirm.', expected: 'Cancelled. Trip leaves agent\'s open list. No driver notification (nobody attached).' },
  ]},
  { phase: 'P1', id: 'P1.6', title: 'Edit a posted trip before applicants (PR #173)',
    preconditions: 'Pencil "Edit trip" link is visible only when status=open AND applicantCount===0. Route (cities/waypoints/distance) is NOT editable — changing the route is effectively a new trip.',
    steps: [
    { action: 'Through P1.1 (status=open, 0 applicants). On /trips/{id} tap the pencil "Edit trip" link.', expected: 'Edit dialog opens. Editable fields: rate/km, bata, commission %, GST, pickup time, car type / AC / seats, driver instructions, extras-paid-by-passenger flag, show-fare-to-passenger flag. Route fields are NOT in the dialog.' },
    { action: 'Change rate ₹15 → ₹16/km. Live "new trip fare" preview updates. Save.', expected: '200. Trip detail shows ₹16/km. Server recomputes total_fare = round(distance × rate); the trips_compute_payout trigger re-derives driver_payout. PATCH /trips/{id}.' },
    { action: 'Re-open the dialog. Change pickup_at by +1 hour. Save.', expected: 'expected_end_at shifts by the same +1h delta (duration preserved).' },
    { action: 'Have a driver apply (P2.2 or P3.5) to bump applicantCount to 1. Refresh agent trip detail.', expected: 'Pencil "Edit trip" link is GONE (UI gate: status=open && applicantCount===0).' },
    { action: 'Dev-tools: POST PATCH /trips/{id} on the has_applicants trip with any commercial field.', expected: '409 — trip is locked once it leaves status=open. Server is the source of truth, not the UI gate.' },
  ]},

  // ── P2 ────────────────────────────────────────────────────────────────
  { phase: 'P2', id: 'P2.1', title: 'Browse public trip feed', steps: [
    { action: 'Driver → Trips bottom nav.', expected: 'Trips in/near home city, status open or has_applicants. Agent identity = business name only.' },
    { action: 'Apply filters: car type SUV, date tomorrow.', expected: 'List narrows. "No trips match" empty state.' },
  ]},
  { phase: 'P2', id: 'P2.2', title: 'Apply organically (no invite)', steps: [
    { action: 'Tap a trip → Apply. Pick vehicle. Confirm.', expected: '"Application sent". Trip moves to /my-trips?tab=applied. POST /trips/{id}/applicants.' },
    { action: 'Agent refreshes trip.', expected: 'Has applicants. "1 applicant · Review". Driver anonymous (handle + rating).' },
  ]},
  { phase: 'P2', id: 'P2.3', title: 'KYC-blocked apply (403)', steps: [
    { action: 'Unverified driver taps Apply.', expected: '403 KYC_REQUIRED. No applicant row inserted.' },
  ]},
  { phase: 'P2', id: 'P2.4', title: 'Vehicle ineligibility blocks apply', steps: [
    { action: 'Add a vehicle with insurance expired. Try to apply with it (bypass UI via dev tools if necessary).', expected: '400 VEHICLE_INELIGIBLE with a specific reason (insurance expired / wrong owner / underage / inactive). Server-side guard at POST /trips/{id}/applicants.' },
  ]},
  { phase: 'P2', id: 'P2.5', title: 'Driver withdraws own application', steps: [
    { action: 'Driver: /my-trips?tab=applied → open trip → Withdraw application. Confirm.', expected: '"Application withdrawn". Trip leaves Applied tab.' },
    { action: 'Agent checks applicants.', expected: 'Driver row shows Withdrawn (greyed, cannot select). If last applicant: status → Open.' },
  ]},

  // ── P3 ────────────────────────────────────────────────────────────────
  { phase: 'P3', id: 'P3.1', title: 'Invite a single driver', steps: [
    { action: 'On trip detail → Invite drivers → Invite. Pick Tester B\'s driver. Send.', expected: '"1 invited · pending". trip_invitations row created. POST /trips/{id}/invites.' },
    { action: 'Driver checks bell.', expected: '🔔 trip_invitation. Trip appears in /my-trips?tab=invited.' },
  ]},
  { phase: 'P3', id: 'P3.2', title: 'Invite multiple drivers (radius + skip)', steps: [
    { action: 'Select 3 drivers; one with vacancy >15 km from pickup. Send.', expected: 'Response { created:[2], skipped:[1] }. UI shows 2 invited + 1 skipped (out of radius).' },
  ]},
  { phase: 'P3', id: 'P3.3', title: 'Pre-apply PII reveal', steps: [
    { action: 'Driver opens the invited trip.', expected: 'Agent\'s full name + phone visible (call before applying). Agent does NOT see driver\'s name/phone yet.' },
  ]},
  { phase: 'P3', id: 'P3.4', title: 'Driver declines invitation', steps: [
    { action: 'Driver taps Decline invite. Reason: "Already booked".', expected: 'Trip vanishes from Invited tab. trip_invitations.status → declined.' },
    { action: 'Agent checks.', expected: '🔔 invitation_declined. Row shows Declined + reason.' },
  ]},
  { phase: 'P3', id: 'P3.5', title: 'Driver applies after invite (trigger sync)', steps: [
    { action: 'Driver: Invited tab → Apply. Pick vehicle. Confirm.', expected: 'Status invited → applied. Trip becomes Has applicants. Trigger sync_trip_invitation_on_apply flips invitation row.' },
  ]},
  { phase: 'P3', id: 'P3.6', title: 'Re-invite after decline', steps: [
    { action: 'After P3.4, open Invite. Declined driver should reappear. Tick and send.', expected: '200. Existing trip_invitations row upserted — same id, status declined → pending.' },
    { action: 'Driver checks bell.', expected: 'Fresh trip_invitation bell. Invited tab again.' },
  ]},
  { phase: 'P3', id: 'P3.7', title: 'Already-invited dedup (UI hide)', steps: [
    { action: 'After P3.1, re-open Invite. Verify the already-invited driver is NOT in the picker.', expected: 'Filtered client-side via InviteDriversCard. Unique (trip_id, driver_id) backstops at DB level.' },
    { action: 'Bypass via dev tools: POST /trips/{id}/invites with same driver_id.', expected: '200, created: [] (idempotent upsert no-op). No duplicate notification.' },
  ]},
  { phase: 'P3', id: 'P3.8', title: 'Auto-invite ON — live match-count preview', steps: [
    { action: 'Open /trips/new. Verify Auto-invite toggle is ON by default. Fill from-city, to-city, pickup.', expected: 'Live badge under toggle updates. Three text variants: "No matching drivers right now…" (0) / "N matching drivers available — all N will be invited." (1–5) / "N matching drivers available — top 5 will be invited (closest first)." (6+). Post button disabled while search in flight.' },
  ]},
  { phase: 'P3', id: 'P3.9', title: 'Auto-invite ON — 0 matches', steps: [
    { action: 'Toggle ON, no eligible drivers. Post.', expected: 'Toast "Trip posted" (no count suffix). Trip → Open. trip_invitations has 0 rows for this trip. Drivers with alerts still get alert_match.' },
  ]},
  { phase: 'P3', id: 'P3.10', title: 'Auto-invite ON — 1–5 matches', steps: [
    { action: 'Ensure 2–3 eligible drivers exist. Toggle ON. Post.', expected: 'Toast "Trip posted — N drivers invited". Invite card shows N invited · pending. N trip_invitations rows status pending.' },
    { action: 'Each matched driver checks bell.', expected: 'trip_invitation bell — same copy as manual invite.' },
  ]},
  { phase: 'P3', id: 'P3.11', title: 'Auto-invite ON — 6+ matches, cap at 5 closest', steps: [
    { action: 'Ensure ≥6 eligible drivers at varying distances within radius. Toggle ON. Post.', expected: 'Toast "Trip posted — 5 drivers invited". Exactly 5 trip_invitations rows.' },
    { action: 'Cross-check the 5 invited against haversine distance.', expected: 'Picks are deterministic (closest first; ties broken by id).' },
  ]},
  { phase: 'P3', id: 'P3.12', title: 'Auto-invite OFF — manual path only', steps: [
    { action: 'Flip toggle OFF. Label flips to "I\'ll manually invite drivers." Post.', expected: 'Toast "Trip posted". 0 trip_invitations rows. Trip → Open. No bells.' },
    { action: 'Manually invite via P3.1.', expected: 'Normal manual flow works.' },
  ]},
  { phase: 'P3', id: 'P3.13', title: 'Driver-posted trip excludes the poster from auto-invites', steps: [
    { action: 'Switch Tester A to Driver role. /trips/new with Auto-invite ON. Fill and post.', expected: 'Match-count badge excludes Tester A\'s own driver row. Toast shows N excludes the poster.' },
    { action: 'Tester B driver.', expected: 'Gets trip_invitation. Tester A gets no bell on their own post.' },
  ]},
  { phase: 'P3', id: 'P3.14', title: 'Auto-invite parity with manual eligibility filter', steps: [
    { action: 'Admin: set Tester B driver to kyc_status=pending. Tester A posts with Auto-invite ON.', expected: 'Match-count excludes Tester B. No invite. No row.' },
    { action: 'Restore Tester B to approved but no active vacancy.', expected: 'Still excluded — vacancy is required.' },
    { action: 'Add active vacancy in radius for Tester B. Re-post.', expected: 'Now appears in match count and gets invite.' },
  ]},
  { phase: 'P3', id: 'P3.15', title: 'Manual invite radius gate — now enforced (regression check)',
    preconditions: 'Regression context: before this release, POST /trips/:id/invites had a silently broken radius gate — it queried vacancies.status=\'open\' but migration 039 had renamed it to active/matched/on_trip/expired/cancelled, AND it compared numeric coords using typeof===number which never matched (supabase-js returns them as strings). Net result: every manually-invited driver was created regardless of distance. The gate now actually enforces app_settings.invite_max_radius_km. Testers who memorised the old behaviour will notice the difference — file as "regression fixed", not a regression.',
    steps: [
    { action: 'Admin: seed 3 KYC-approved drivers, each with an active vacancy. Two have current_city within 15 km of the trip\'s pickup; one has it >15 km away.', expected: 'All 3 drivers visible in the Invite picker (UI doesn\'t pre-filter by radius — that\'s the server\'s job). Vacancy status must be \'active\' (not the historical \'open\').' },
    { action: 'Agent: POST /trips/{id}/invites with all 3 driver ids in driver_ids.', expected: '{ created: [2 ids], skipped: [1 id of the out-of-radius driver] }. trip_invitations has exactly 2 rows. Out-of-radius driver gets NO notification.' },
    { action: 'Now invite a driver with NO active vacancy at all (expired or never posted).', expected: '200 with that driver in created, not skipped. Drivers without a vacancy bypass the radius gate by design — agent picks them from the pickup-city directory. (Manual invite is permissive; auto-invite is strict — that\'s the asymmetry.)' },
  ]},
  { phase: 'P3', id: 'P3.16', title: 'Auto-invited driver applies — invitation flips to applied',
    preconditions: 'Parity with P3.5 but for the auto-invite path. Pre-state: through P3.10 (auto-invite created at least one pending row).',
    steps: [
    { action: 'Auto-invited driver: /my-trips?tab=invited → Apply. Pick vehicle. Confirm.', expected: 'Trip status flips to Has applicants. Driver\'s existing trip_invitations row updated to status=applied (NOT a new row — sync_trip_invitation_on_apply trigger updates in place).' },
    { action: 'Agent: open Invite-drivers card.', expected: 'Driver row shows applied, name/phone revealed (actor-reveals rule — they reciprocated).' },
    { action: 'Agent (dev tools): POST /trips/{id}/invites with the already-applied driver\'s id again.', expected: '200. Existing row stays at applied — helper preserves prior acceptance, does NOT flip back to pending. No duplicate bell. "Invitation waiting" home card does NOT reappear.' },
  ]},
  { phase: 'P3', id: 'P3.17', title: 'Alert-match + trip_invitation can coexist on the same trip',
    preconditions: 'By design: alert_match means "matches your saved filter"; trip_invitation means "the agent specifically picked you". Different intent, both fire.',
    steps: [
    { action: 'Tester B driver: (a) post an active vacancy in the pickup city (qualifies for auto-invite), AND (b) save an alert from pickup city → destination city.', expected: 'Both rows visible: 1 active vacancy + 1 active alert.' },
    { action: 'Agent: post a fresh trip pickup→destination with Auto-invite ON.', expected: 'Toast "Trip posted — N drivers invited" (N includes Tester B).' },
    { action: 'Tester B driver: check bell.', expected: 'Bell rings TWICE for the same trip id: once with alert_match, once with trip_invitation. The trip appears in /my-trips?tab=invited (driven by the invitation row, not the alert).' },
  ]},
  { phase: 'P3', id: 'P3.18', title: 'Match-preview rate limit (30/min/user)',
    preconditions: 'Devtools-only test — not exercised by the normal form flow.',
    steps: [
    { action: 'From a logged-in session, hammer GET /trips/match-preview?from_city_id=<a city uuid> 35 times in under 60s (browser console for loop).', expected: 'First ~30 calls → 200 with { total_matches, will_invite, max_invites: 5 }. Around the 31st → 429 RATE_LIMITED. Within a minute the limit resets and 200s resume.' },
    { action: 'Verify the limit is per-user.', expected: 'Limit key is match-preview:<user_id>. One user\'s loop does not block another\'s form. Real agents normally fire this only a handful of times per session — should never see the 429 organically.' },
  ]},

  // ── P4 ────────────────────────────────────────────────────────────────
  { phase: 'P4', id: 'P4.1', title: 'Select from multiple applicants', preconditions: 'Have ≥2 applicants on the same trip (combine P2.2 + P3.5).', steps: [
    { action: 'Agent: /trips/{id}/applicants → Select this driver on one row. Confirm.', expected: 'Status → Selected. Yellow banner with 15-min countdown. Other applicants auto-rejected. POST /trips/{id}/assign.' },
    { action: 'Selected driver checks bell.', expected: '🔔 trip_selected. Awaiting card with countdown.' },
    { action: 'Other applicants check Applied tab.', expected: 'Their cards now say "Not selected". No bell. Sibling invitations → withdrawn. Mutual PII reveal between agent ↔ selected driver.' },
  ]},
  { phase: 'P4', id: 'P4.2', title: 'Agent withdraws selection', steps: [
    { action: 'Yellow banner → Withdraw selection. Reason. Confirm.', expected: 'Banner gone. Status → Has applicants. POST /trips/{id}/cancel-assignment. Auto-rejected drivers return to Applied.' },
    { action: 'Driver checks.', expected: '🔔 trip_assignment_cancelled. Awaiting card vanishes. Application still active.' },
  ]},
  { phase: 'P4', id: 'P4.3', title: 'Driver declines after selection', steps: [
    { action: 'Driver: trip detail → Decline. Reason.', expected: '"Selection declined". Awaiting card gone. POST /trips/{id}/decline.' },
    { action: 'Agent checks.', expected: '🔔 trip_assignment_cancelled. Banner gone. Status → Has applicants. Driver row Declined — out of pool.' },
  ]},
  { phase: 'P4', id: 'P4.4', title: 'Acceptance window expires (cron)', preconditions: 'Post with window slider at 5 min for this test.', steps: [
    { action: 'Watch countdown hit 0:00. Wait up to 60s for the cron.', expected: 'Banner clears. Status → Has applicants. 🔔 selection_expired (both sides). Driver\'s acceptance row = expired.' },
  ]},
  { phase: 'P4', id: 'P4.5', title: 'Driver accepts (clean)', steps: [
    { action: 'Driver taps Accept. No overlapping applications → no dialog.', expected: '"You\'re on the trip". Status → Accepted. Bottom bar shows Start trip with OTP. POST /trips/{id}/accept.' },
    { action: 'Agent checks.', expected: '🔔 trip_assigned. Yellow banner gone.' },
    { action: 'Agent refreshes /trips/{id}.', expected: 'Passenger OTP card visible: 3xl monospace 5-digit code labelled "Passenger OTP", plus Send passenger link button. No SMS — platform never contacts passenger directly.' },
  ]},
  { phase: 'P4', id: 'P4.6', title: 'Driver accepts with overlap-dialog', preconditions: 'Driver has applications on another trip in same time window.', steps: [
    { action: 'Apply to two trips with overlapping pickup windows. Get selected on one. Tap Accept.', expected: 'AcceptTripDialog appears listing overlaps. Tick boxes to auto-withdraw. Confirm.' },
    { action: 'Server side check.', expected: 'Checked applications → withdrawn atomically with the accept.' },
  ]},
  { phase: 'P4', id: 'P4.7', title: 'Agent withdraws assignment AFTER accept (vacancy restoration)', preconditions: 'Through P4.5 (trip Accepted).', steps: [
    { action: 'Agent: menu → Withdraw assignment. Reason. Confirm.', expected: 'Status: Accepted → Has applicants. Driver\'s Start affordance disappears. POST /trips/{id}/cancel-assignment.' },
    { action: 'Driver checks.', expected: '🔔 trip_assignment_cancelled title "Agent withdrew the assignment". Trip leaves Accepted, reappears in Applied.' },
    { action: 'Server: vacancy and OTP state.', expected: 'passenger_otp_hash and passenger_otp cleared (fresh OTP on next accept). Matching vacancy was on_trip → restored to active (or expired if window passed). syncVacanciesForTrip(\'revert\').' },
  ]},

  // ── P5 ────────────────────────────────────────────────────────────────
  { phase: 'P5', id: 'P5.1', title: 'Agent shares trip link + OTP with passenger', preconditions: 'Through P4.5 (trip Accepted; OTP card visible on agent\'s /trips/{id}).', steps: [
    { action: 'Tap Send passenger link under the Passenger OTP card.', expected: 'Share modal opens: large copyable OTP, full URL https://trip-king.vercel.app/passenger/{otp}, Copy link button. May offer WhatsApp/SMS quick-send.' },
    { action: 'Copy link → paste into WhatsApp/SMS and send.', expected: 'Passenger receives the link via your channel (NOT TripKing\'s — platform sends nothing).' },
  ]},
  { phase: 'P5', id: 'P5.2', title: 'Passenger opens the link → sees trip detail', steps: [
    { action: 'Passenger taps the link.', expected: 'Lands directly on /passenger/{otp} — no separate OTP-entry page. Sees: route, pickup, distance, car type, AC, driver name+rating+trip-count+phone, agent contact, own OTP as "Your OTP". GET /trips/by-otp/{otp} — public, no auth.' },
  ]},
  { phase: 'P5', id: 'P5.3', title: 'Passenger meets driver — shares OTP verbally', steps: [
    { action: 'On the portal, tap driver\'s phone to call (tel-link). On arrival, read OTP aloud.', expected: 'Tel-link works on mobile. OTP is visible on screen as Your OTP.' },
  ]},
  { phase: 'P5', id: 'P5.4', title: 'Passenger live-tracks the trip', steps: [
    { action: 'After driver starts (P6.1), reload /passenger/{otp}.', expected: 'Live map with driver pin + distance-to-destination refreshing ~every 5s. Same source as agent\'s map. Read-only.' },
  ]},
  { phase: 'P5', id: 'P5.5', title: 'Wrong OTP / expired access', steps: [
    { action: 'Open /passenger/00000.', expected: '404 "Trip not found". No PII leak.' },
    { action: 'After P7.1 (trip completed), reload original portal URL.', expected: 'Final-state card "Trip completed". Map frozen. Tracking disabled.' },
  ]},

  // ── P6 ────────────────────────────────────────────────────────────────
  { phase: 'P6', id: 'P6.1', title: 'Start trip with valid OTP', steps: [
    { action: 'Driver: Start trip with OTP. Enter 5-digit OTP + start-odo. Optional photo. Start.', expected: '"Trip started". Status: In progress. Bottom bar → Complete trip. POST /trips/{id}/start. Server verifies hash, sets trip_executions, vacancy → on_trip.' },
  ]},
  { phase: 'P6', id: 'P6.2', title: 'Wrong OTP × 5 → 60s lockout', preconditions: 'Enforced server-side by rateLimitOk(start-trip:{user}:{trip}, 5/60s) — PR #155, merged 2026-05-16.', steps: [
    { action: 'Enter 00000 six times.', expected: 'Attempts 1–5: 401 INVALID_OTP. Attempt 6: 429 RATE_LIMITED "Too many wrong OTP attempts — wait a minute and retry". After 60s, fresh attempt allowed.' },
  ]},
  { phase: 'P6', id: 'P6.3', title: 'Start before accept (blocked)', steps: [
    { action: 'On a Selected trip, hit /start via dev tools.', expected: '409 CONFLICT "Trip is \\"selected\\", not \\"accepted\\"". UI hides Start button until accepted.' },
  ]},
  { phase: 'P6', id: 'P6.4', title: 'Live location tracking', steps: [
    { action: 'Driver allows location. Move device a few metres.', expected: 'Pings every 5–10s. PATCH /drivers/me/location.' },
    { action: 'Agent + Passenger watch.', expected: 'Driver pin moves on map. distance_to_destination_km ticks down.' },
  ]},
  { phase: 'P6', id: 'P6.5', title: 'Driver goes offline mid-trip', steps: [
    { action: 'Driver: airplane mode for 2 min.', expected: 'Driver app shows "Offline — reconnecting".' },
    { action: 'Agent + Passenger view.', expected: 'Pin stops moving. After ~2 min shows "last seen Nm ago". No false cancellation.' },
  ]},
  { phase: 'P6', id: 'P6.6', title: 'Agent cancels mid-progress', steps: [
    { action: 'During in_progress, Agent tries Cancel trip.', expected: 'Either: (a) blocked "Cannot cancel a running trip" (acceptable) OR (b) allowed with admin warning → status Cancelled, driver gets trip_cancelled, vacancy restored. Flag if neither.' },
  ]},

  // ── P7 ────────────────────────────────────────────────────────────────
  { phase: 'P7', id: 'P7.1', title: 'Complete trip (happy)', steps: [
    { action: 'Driver: Complete trip. End-odo + optional photo + notes. Confirm.', expected: '"Trip completed". Status: Completed. POST /trips/{id}/complete.' },
    { action: 'Agent + Passenger.', expected: 'Agent 🔔 trip_completed. Passenger portal "Trip completed". Vacancy → expired.' },
  ]},
  { phase: 'P7', id: 'P7.2', title: 'Complete without start (blocked)', steps: [
    { action: 'On an Accepted trip (not started), POST /complete via dev tools.', expected: '409 CONFLICT "Trip is \\"accepted\\", not \\"in_progress\\"". UI hides Complete until in_progress.' },
  ]},
  { phase: 'P7', id: 'P7.3', title: 'Agent reviews driver', steps: [
    { action: 'Agent: /trips/{id} → Rate driver. Stars + tags + comment. Submit.', expected: '"Review posted". Card shows submitted rating. POST /reviews · passenger_to_driver.' },
    { action: 'Driver.', expected: '🔔 review_received. Profile rating updates.' },
  ]},
  { phase: 'P7', id: 'P7.4', title: 'Driver reviews agent', steps: [
    { action: 'Driver: Rate the agent. Submit.', expected: '"Review posted". POST /reviews · driver_to_manager.' },
    { action: 'Agent.', expected: '🔔 review_received. Agent profile rating updates.' },
  ]},
  { phase: 'P7', id: 'P7.5', title: 'Only one party reviews', steps: [
    { action: 'Complete a trip. Agent reviews. Driver does NOT.', expected: 'No errors. Driver\'s Rate-the-agent card stays visible across sessions. Optional 24h nag.' },
  ]},
  { phase: 'P7', id: 'P7.6', title: 'Review on cancelled trip (blocked)', steps: [
    { action: 'For a cancelled trip, POST /reviews via dev tools.', expected: '409 "Reviews only allowed on completed trips". No row inserted. UI shows no review prompt.' },
  ]},
  { phase: 'P7', id: 'P7.7', title: 'Cancel post-accept (full path)', steps: [
    { action: 'After P4.5 (accepted, not started) → menu → Cancel trip. Reason. Confirm twice.', expected: 'Status: Cancelled. POST /trips/{id}/cancel.' },
    { action: 'Driver + Passenger.', expected: 'Driver 🔔 trip_cancelled. Start button gone. Vacancy → active. Passenger portal "Trip cancelled".' },
  ]},

  // ── P8 ────────────────────────────────────────────────────────────────
  { phase: 'P8', id: 'P8.1', title: 'Bell unread badge', steps: [
    { action: 'Trigger a new notification from another flow.', expected: 'Bell shows red dot + numeric badge within ~5s. Top-of-list = newest, unread.' },
  ]},
  { phase: 'P8', id: 'P8.2', title: 'Deep-link from notification', steps: [
    { action: 'Tap each type: trip_invitation, trip_selected, trip_assigned, trip_completed, review_received, kyc_status_change.', expected: 'Each opens the correct page with the right trip/KYC context on first tap.' },
  ]},
  { phase: 'P8', id: 'P8.3', title: 'Mark-read behaviour', steps: [
    { action: 'Open /notifications. Tap a notification (or Mark all read).', expected: 'Bell badge clears. Re-opening shows the row as read. read_at stamped on row.' },
  ]},

  // ── V (Vacancy lifecycle — PR #167) ──────────────────────────────────
  { phase: 'V', id: 'V1', title: 'Multi-day trip flips short-window vacancy → on_trip',
    preconditions: 'Before PR #167 only pickup_at was checked; a vacancy whose window ended mid-trip stayed visible to agents. Now overlap honours expected_end_at too.',
    steps: [
    { action: 'Driver: post a vacancy available 9 AM – 9 PM today, current city = Vellore, destinations = Chennai.', expected: 'Vacancy shows status active on /vacancies.' },
    { action: 'Agent: post a multi-day trip pickup today 11 AM, expected end the day after tomorrow 6 PM (ends well after the vacancy\'s 9 PM cutoff). Driver applies → agent assigns → driver accepts (P3–P4.5).', expected: 'Driver accepts. Trip → accepted.' },
    { action: 'Driver: open /vacancies. Agent: open Vacant drivers for Vellore.', expected: 'Driver: vacancy still appears with amber "On Trip" banner + linked trip route + pickup date; edit pencil greyed, Remove still active. Agent: that driver\'s row is NOT present (pre-#167 it would have leaked through). vacancies.status=\'on_trip\', linked_trip_id = the accepted trip.' },
  ]},
  { phase: 'V', id: 'V2', title: 'Single-day trip inside vacancy window (regression check)',
    preconditions: 'Confirms the multi-day fix didn\'t break the existing single-day happy path.',
    steps: [
    { action: 'Driver: post a vacancy 9 AM – 9 PM today.', expected: 'Status active.' },
    { action: 'Agent: post a trip pickup 11 AM today, end 5 PM today (entirely inside the vacancy window). Driver accepts.', expected: 'Same as V1: vacancy flips to on_trip, hidden from agent search.' },
  ]},
  { phase: 'V', id: 'V3', title: 'Yesterday\'s vacancies hidden from agent search',
    steps: [
    { action: 'Agent: open Vacant drivers. Scroll the full list.', expected: 'NO row whose "When" line is in the past. Every visible vacancy\'s available_until is in the future (or open-ended).' },
    { action: 'As a driver who posted a vacancy yesterday: open /vacancies.', expected: 'Yesterday\'s row shows status expired (not counted toward the 2-active quota — driver can post again).' },
  ]},
  { phase: 'V', id: 'V4', title: 'Cron auto-expires a vacancy when its window closes',
    preconditions: 'pg_cron expire_stale_vacancies runs every 5 minutes.',
    steps: [
    { action: 'Driver: post a vacancy with available_until set 6 minutes from now (smallest window the UI allows; or admin sets it directly).', expected: 'Status active.' },
    { action: 'Wait 6 minutes.', expected: 'Status flips to expired automatically. Agent search no longer shows it. Driver\'s quota count drops by 1.' },
  ]},
  { phase: 'V', id: 'V5', title: 'Trip cancel reverts on_trip → active',
    steps: [
    { action: 'Driver: post a vacancy whose window is fully in the future (e.g. tomorrow 9 AM – 9 PM).', expected: 'Status active.' },
    { action: 'Agent: post a trip inside that window. Driver applies + accepts. Agent then cancels the trip before it starts.', expected: 'Driver\'s vacancy reverts from on_trip → active (banner gone, agents see it again). linked_trip_id cleared.' },
  ]},
  { phase: 'V', id: 'V6', title: 'Trip start consumes on_trip → expired',
    preconditions: 'Symmetric to V5 but with a real start instead of a cancel.',
    steps: [
    { action: 'As V5, but driver starts the trip (passenger OTP) instead of the agent cancelling.', expected: 'Vacancy moves on_trip → expired (slot consumed). Does NOT revert when the trip later completes.' },
  ]},
  { phase: 'V', id: 'V7', title: 'Negative — vacancy outside trip window must NOT flip',
    preconditions: 'Sanity check that the overlap check isn\'t over-eager.',
    steps: [
    { action: 'Driver: post a vacancy starting tomorrow. Agent: post a trip with pickup today and let this driver accept it.', expected: 'That vacancy stays active — its window doesn\'t cover the trip\'s pickup. (No flip.)' },
  ]},

  // ── R (Referral program — PRs #166/#168/#169/#171/#172) ──────────────
  { phase: 'R', id: 'R1', title: 'View referral summary on /referrals',
    preconditions: 'R has been a referrer at some point (at least one referral_links row exists). If needed, admin can seed via /admin/users PATCH to set referred_by_user_id on a test user.',
    steps: [
    { action: 'Open /referrals as the referrer (R).', expected: 'Three stat tiles: Lifetime earnings · Withdrawable · Referred users. Lifetime ≥ Withdrawable (hold-day math, see R3). ReferralCodeCard links here once user has ≥1 referral.' },
    { action: 'Open /referrals as a user with NO referrals.', expected: 'All-zero tiles + a CTA prompting them to share their code. No timeline/table yet (Stage 8 surfaces those once data exists).' },
  ]},
  { phase: 'R', id: 'R2', title: 'Earnings accrual on referred trip completion',
    preconditions: 'B is referred by R (users.referred_by_user_id=R). B is KYC-approved, R has an active referral_link for B.',
    steps: [
    { action: 'B applies → accepts → starts → completes a trip (P3–P7.1).', expected: 'On complete, charge_platform_fee_on_complete fires for both sides (migration 044). The accrual trigger inserts a referral_ledger row with entry_type=accrual, positive amount in paise, link_id = R↔B, trip_id = this trip.' },
    { action: 'R checks bell.', expected: '🔔 referral_earning. Body rendered from notification_templates with {lifetime} substituted to R\'s running lifetime total. /referrals stats refresh.' },
  ]},
  { phase: 'R', id: 'R3', title: 'Hold-aware withdrawable balance',
    preconditions: 'wallet_settings.withdrawal_hold_days set (default 3). The referral_withdrawable view filters by entry_at < now() - hold_days; the referral_withdrawable_summary view splits "withdrawable" vs "pending".',
    steps: [
    { action: 'Admin seeds two accruals for R: one dated -1 day, one dated -4 days (or wait for natural settlement). Refresh /referrals.', expected: 'Withdrawable tile shows only the -4 day row\'s amount. A separate "pending — clears in N days" hint shows the -1 day amount.' },
    { action: 'GET /referrals/me/summary directly.', expected: 'Response body carries withdrawable_paise (floored) AND pending_paise as separate fields.' },
  ]},
  { phase: 'R', id: 'R4', title: 'Transfer referral earnings to cash wallet (one-way)',
    preconditions: 'R has withdrawable > 0.',
    steps: [
    { action: '/referrals → TransferToWalletPanel. Verify the warning copy appears verbatim: "cannot be withdrawn later and will not generate further referral rewards" (spec §22).', expected: 'Warning visible inline above the amount field. Presets shown.' },
    { action: 'Enter a partial amount → Transfer.', expected: '200. referral_withdrawable drops by the amount. Cash wallet balance up by the same. POST /referrals/me/transfer-to-wallet { amount_paise }. React Query invalidates referrals + wallet + me caches; tiles refresh.' },
  ]},
  { phase: 'R', id: 'R5', title: 'Request UPI withdrawal — happy path',
    preconditions: 'R has withdrawable ≥ min withdrawal amount. R has not signed up within the new-user delay window.',
    steps: [
    { action: '/referrals WithdrawalCard → pick a preset → enter a valid UPI ID (e.g. test@upi) → Request.', expected: '200. Toast confirms. Withdrawable drops by amount. Row appears in "Recent withdrawals" with status=Requested. POST /referrals/me/withdraw.' },
    { action: 'R checks bell.', expected: '🔔 withdrawal_requested.' },
    { action: 'Server-side: query withdrawals table.', expected: 'New row with status=requested, amount, upi_id, provider=razorpay (or stubbed). Partial UNIQUE on (user_id) WHERE status IN (requested, approved, processing) means R cannot create a 2nd pending row.' },
  ]},
  { phase: 'R', id: 'R6', title: 'UPI withdrawal — validation errors',
    preconditions: 'Devtools-friendly. Each sub-step is independent; reset withdrawable between if needed.',
    steps: [
    { action: 'POST /me/withdraw { amount_paise: 0 }.', expected: '422 with a "must be > 0" message.' },
    { action: 'POST /me/withdraw without upi_id.', expected: '422 "UPI ID required".' },
    { action: 'POST /me/withdraw with amount below wallet_settings.min_withdrawal_paise.', expected: '422 "Below minimum".' },
    { action: 'POST /me/withdraw with amount > current withdrawable.', expected: '402 "Insufficient withdrawable balance".' },
    { action: 'Submit a 2nd /withdraw while the 1st is still requested/approved/processing.', expected: '409 "A withdrawal is already pending". (Partial UNIQUE enforces this.)' },
  ]},
  { phase: 'R', id: 'R7', title: 'UPI withdrawal — daily / monthly cap exceeded',
    steps: [
    { action: 'Hit daily-cap or monthly-cap (per-role values from wallet_settings).', expected: '429 RATE_LIMITED with a clear "daily/monthly cap" reason in the body.' },
  ]},
  { phase: 'R', id: 'R8', title: 'Admin approves + marks paid',
    preconditions: 'A withdrawal row exists in status=requested (e.g. from R5).',
    steps: [
    { action: 'Admin: /administration/withdrawals → filter by status=requested → row → Approve.', expected: '200. Status flips requested → approved. PATCH /admin/withdrawals/{id} { outcome: "approve" }.' },
    { action: 'Same row → Mark paid → enter UTR (e.g. "UTR123456789").', expected: '200. Status flips approved → paid. external_txn_ref stored. Audit log entry.' },
    { action: 'User R checks bell.', expected: '🔔 withdrawal_paid. Body contains {ref} substituted to the UTR.' },
  ]},
  { phase: 'R', id: 'R9', title: 'Admin rejects (reversal entry)',
    preconditions: 'A withdrawal row exists in status=requested or approved.',
    steps: [
    { action: 'Admin: row → Reject with reason (e.g. "Wrong UPI ID").', expected: '200. Status flips → rejected. rejected_reason stored. PATCH /admin/withdrawals/{id} { outcome: "reject" }.' },
    { action: 'Server-side: query referral_ledger for this user.', expected: 'A NEW positive reversal entry was inserted by complete_referral_withdrawal — withdrawable bounces back to the pre-withdraw balance.' },
    { action: 'User R checks bell.', expected: '🔔 withdrawal_rejected with the reason in the body.' },
  ]},
  { phase: 'R', id: 'R10', title: 'Referrer dashboard — timeline + table + drilldown (PR #171)',
    preconditions: 'R has ≥3 referrals across roles (driver + agent) and at least a week of accruals so the chart has data.',
    steps: [
    { action: '/referrals → EarningsTimelineChart. Switch the range picker: 7d → 30d → 90d.', expected: 'Recharts daily bars re-render from /referrals/me/earnings. Empty days show as 0-height bars.' },
    { action: 'Same page → ReferredUserTable. Apply filters: status=earning_active, role=driver.', expected: 'Table narrows to matches. Pagination + sorting work.' },
    { action: 'Click a row.', expected: 'Navigates to /referrals/:linkId. Drilldown shows per-trip ledger (route + fee source + your accrual) + a cap-remaining tile.' },
  ]},
  { phase: 'R', id: 'R11', title: 'Cap reached on a link',
    preconditions: 'Set referral_links.cap_paise = 50000 (₹500) for the R↔B link; R already accrued ₹500 from B\'s prior trips.',
    steps: [
    { action: 'B completes another eligible trip.', expected: 'NO new accrual row for R (or row with amount=0 + a "capped" note). Drilldown cap-remaining = ₹0.' },
    { action: 'R checks bell.', expected: '🔔 referral_cap_reached — fires once when the cap is first hit, not per subsequent trip.' },
  ]},
  { phase: 'R', id: 'R12', title: 'Fraud auto-detection on qualification (PR #172)',
    preconditions: 'fraud_settings + fraud_action_rules seeded with: duplicate_aadhaar → severity=high → action=suspend_link; duplicate_upi → flag_only; same_pair_pattern → hold_earnings. Detection runs in the AFTER UPDATE OF status trigger on referral_links when status transitions to qualified or earning_active.',
    steps: [
    { action: 'Duplicate Aadhaar: plant the same Aadhaar number on 3 different users (admin SQL). Have R refer the 3rd. That 3rd user completes their first eligible trip.', expected: 'Qualification fires → detect_duplicate_aadhaar matches → referral_fraud_flags row inserted (flag_type=duplicate_aadhaar, severity=high, action_taken=suspend_link). R\'s link for that referred user → status=suspended.' },
    { action: 'Duplicate UPI: same exercise with same UPI ID on multiple users.', expected: 'detect_duplicate_upi matches → flag inserted with flag_only action (no link suspension; surfaces in the admin queue).' },
    { action: 'Same-pair pattern: same referrer ↔ same referred user completing many trips within the threshold window (per fraud_settings).', expected: 'detect_same_pair_pattern matches → flag inserted with hold_earnings action → accruals continue but become non-withdrawable until admin resolves.' },
  ]},
  { phase: 'R', id: 'R13', title: 'Admin operations — flag queue + manual flag + status + reverse-earnings + risk',
    steps: [
    { action: 'Admin: GET /admin/referrals/flags?resolved=false. View the auto-detected flags from R12.', expected: 'List endpoint returns the flags with severity + action_taken. UI shows them in a queue.' },
    { action: 'POST /admin/referrals/flags { link_id, flag_type: "manual_review", severity: "medium", detail: { reason: "..." } }. Then PATCH /admin/referrals/flags/{id} { resolved_at: now, resolved_note: "..." }.', expected: 'Manual flag created → resolved. resolved_by stamped. admin_audit_log entries for both actions.' },
    { action: 'PATCH /admin/referrals/{link_id}/status { status: "suspended" }.', expected: 'Link status manually flipped. Audit log entry.' },
    { action: 'POST /admin/referrals/{link_id}/reverse-earnings { reason }.', expected: 'reverse_referral_earnings stored proc inserts a NEGATIVE ledger entry equal to the link\'s net positive accrued. Link status → suspended. R\'s withdrawable drops to 0; lifetime stays unchanged (reversal is its own row, not a delete).' },
    { action: 'PATCH /admin/users/{id}/risk { is_high_risk: true, note: "..." }.', expected: 'users.is_high_risk=true. Audit log entry. (Withdrawal-hold extension per spec is future work but the flag is now set.)' },
  ]},

  // ── N (Navigation & Breadcrumbs — PR #263) ───────────────────────────
  // Universal rule: a card on Home that leads to a list of trips → tap a trip → land on
  // the trip detail. The detail page's BACK arrow MUST return to the list the user came
  // from (with the same filter applied), not the generic /my-trips or /posted-trips. The
  // list MUST refetch on mount so any status change made on the detail page is reflected
  // immediately. Applies to BOTH driver and agent.
  { phase: 'N', id: 'N1', title: 'Driver: Home → Review invitations → trip → Back lands on Invites Received list (not /my-trips)',
    preconditions: 'Signed in as a driver with ≥2 pending invitations. Home shows "Invitations waiting" purple card with "Review invitations" button.',
    steps: [
    { action: 'On Home, tap the "Review invitations" button on the purple Invitations Waiting card.', expected: 'URL becomes /my-trips?scope=invites-received&from=/. Page header is purple-banded with title "Invites received" + subtitle "N trips waiting for your decision". No bottom tab strip.' },
    { action: 'Tap any trip in the list.', expected: 'Lands on /trips/{id}?from=%2Fmy-trips%3Fscope%3Dinvites-received%26from%3D%2F (the `from` query param is URL-encoded). Trip detail renders normally.' },
    { action: 'Tap the Back arrow on the trip detail.', expected: 'Lands back on /my-trips?scope=invites-received&from=/ — the SAME scoped list, not the plain /my-trips tabbed page. The list shows the same trips you came from.' },
    { action: 'Tap the Back arrow on the Invites Received page.', expected: 'Lands on / (the driver home). The breadcrumb walks back one step at a time.' },
  ]},
  { phase: 'N', id: 'N2', title: 'Driver: status change on trip detail → Back → list reflects the change (auto-refresh on mount)',
    preconditions: 'Through N1: on the scoped Invites Received list, tap any trip.',
    steps: [
    { action: 'On the trip detail, take an action that changes status (e.g. tap Decline or Apply).', expected: 'Action succeeds (toast). Trip status flips.' },
    { action: 'Tap Back to return to the Invites Received list.', expected: 'The trip you acted on either DROPS OUT of the list (if declined / withdrew) or its row reflects the new status without a manual refresh. The list automatically refetched on mount (PR #263 `alwaysRefetchOnMount` on `useInvitedTrips`).' },
  ]},
  { phase: 'N', id: 'N3', title: 'Driver: passive visit to trip detail → Back → list unchanged (no false drops)',
    preconditions: 'Same setup as N1.',
    steps: [
    { action: 'On the scoped Invites Received list, tap a trip. On the trip detail, do NOT take any action — just read.', expected: 'Detail loads normally.' },
    { action: 'Tap Back.', expected: 'Returns to the Invites Received list with the SAME trips visible in the SAME order. No phantom drops. Refetch on mount fired but data was identical.' },
  ]},
  { phase: 'N', id: 'N4', title: 'Driver: Decline button is rendered INSIDE the trip card on the Invites Received list (not as an orphan sibling)',
    preconditions: 'Through N1: on the scoped Invites Received list. ≥1 pending invitation visible.',
    steps: [
    { action: 'Inspect a trip row.', expected: 'The red "Decline invitation" button sits inside the trip card surface, separated from the trip info by a thin border-t divider. Card has a single rounded outline that contains both the trip info AND the Decline button. There is no standalone red button BELOW the card.' },
    { action: 'Tap "Decline invitation".', expected: 'Confirm dialog → on confirm, mutation succeeds → trip drops out of the list. No regression vs prior behaviour.' },
  ]},
  { phase: 'N', id: 'N5', title: 'Driver: direct navigation to /my-trips?scope=invites-received (no home-card hop) → trip → Back returns to the scoped list',
    preconditions: 'Signed-in driver. Paste the scoped URL directly into the address bar (or via a notification deep-link).',
    steps: [
    { action: 'Navigate to /my-trips?scope=invites-received directly.', expected: 'Scoped Invites Received page loads. The header back arrow points to / (default `from`).' },
    { action: 'Tap a trip, then tap Back on the detail.', expected: 'Returns to /my-trips?scope=invites-received (the scope param survives even without the home-card hop). Deep-linking + share-link survive the breadcrumb correctly.' },
  ]},
  { phase: 'N', id: 'N6', title: 'Driver: Home → "View invitations" (Invitations Sent single-trip card) → /trips/{id}/invitations → Back returns to Home',
    preconditions: 'Signed-in driver who has posted ONE trip with ≥1 pending invite. Home shows the blue "Invitations sent" card with "View invitations" button.',
    steps: [
    { action: 'Tap "View invitations" on the blue Invitations Sent card.', expected: 'Lands on /trips/{id}/invitations?from=/. The page HEADER is blue-banded (matches the home card\'s blue accent — PR #263). Title "Invitations sent" + subtitle "from → to · N pending".' },
    { action: 'Tap the Back arrow.', expected: 'Lands on / (driver home).' },
  ]},
  { phase: 'N', id: 'N7', title: 'Agent: Home → Invitations Sent (multi) → posted-trips list → trip → Back returns to the scoped list',
    preconditions: 'Signed in as an agent who has posted ≥2 trips with pending invites. Home shows the blue Invitations Sent card with "View N invitations".',
    steps: [
    { action: 'Tap "View N invitations" on the blue Invitations Sent card.', expected: 'Lands on /posted-trips?scope=invites-sent&from=/. Page header blue-banded; only trips with pending invites visible.' },
    { action: 'Tap a trip → tap Back on the trip detail.', expected: 'Returns to /posted-trips?scope=invites-sent&from=/. The scoped list, not the plain /posted-trips tabbed page.' },
    { action: 'Tap Back again on the scoped list.', expected: 'Lands on / (agent home).' },
  ]},
  { phase: 'N', id: 'N8', title: 'Agent: Home → Needs-action queue → trip detail → Back returns to /queue/needs-action',
    preconditions: 'Signed-in agent with ≥1 trip needing action (e.g. status=has_applicants needing a driver pick). Home shows the orange Needs Action priority card.',
    steps: [
    { action: 'Tap the Needs Action card on Home.', expected: 'Lands on /queue/needs-action. Page header orange/amber-banded. Trips listed.' },
    { action: 'Tap a trip → tap Back on the detail (or applicants page).', expected: 'Returns to /queue/needs-action (the trip-card Link passes ?from=/queue/needs-action — verified already correct, no regression in PR #263).' },
  ]},
  { phase: 'N', id: 'N9', title: 'Agent: Home → In-progress queue → trip detail → Back returns to /queue/in-progress',
    preconditions: 'Signed-in agent with ≥1 trip in_progress. Home shows the teal In-progress priority card.',
    steps: [
    { action: 'Tap the In Progress card on Home.', expected: 'Lands on /queue/in-progress. Page header teal-banded. Trips listed.' },
    { action: 'Tap a trip → tap Back on the detail.', expected: 'Returns to /queue/in-progress. Breadcrumb preserved.' },
  ]},
  { phase: 'N', id: 'N10', title: 'Visual: scoped page headers match the colour of the home card that linked to them',
    preconditions: 'Driver + agent home pages should each visually demonstrate the rule. Take screenshots if reporting a mismatch.',
    steps: [
    { action: 'Driver Home → purple "Invitations waiting" card → Review invitations. Compare card colour with page header.', expected: 'Both purple/indigo. Continuity preserved.' },
    { action: 'Driver Home → blue "Invitations sent" card → View invitations. Compare card colour with /trips/{id}/invitations page header.', expected: 'Both blue. PR #263 specifically fixed this — the page used to have a plain white header.' },
    { action: 'Agent Home → blue Invitations Sent card → /posted-trips?scope=invites-sent. Compare.', expected: 'Both blue.' },
    { action: 'Agent Home → orange Needs Action card → /queue/needs-action. Compare.', expected: 'Both orange/amber.' },
    { action: 'Agent Home → teal In Progress card → /queue/in-progress. Compare.', expected: 'Both teal.' },
  ]},
  { phase: 'N', id: 'N11', title: 'Refresh on mount catches another user\'s out-of-band change',
    preconditions: 'Two tabs: same driver in tab A on the scoped Invites Received list; same driver in tab B on a trip detail. (Or simulate via an admin acting in another tool.)',
    steps: [
    { action: 'In tab B (or via admin), perform an action on one of the listed trips that would remove it from the "pending invitations" filter (e.g. agent withdraws the invitation; admin marks the trip cancelled).', expected: 'No visible change in tab A yet (no live socket).' },
    { action: 'In tab A, tap a different trip → tap Back to return to the list.', expected: 'The trip that was removed elsewhere is now GONE from the list. Refetch-on-mount surfaced the out-of-band change without needing a manual reload. Confirms PR #263\'s `alwaysRefetchOnMount` not the optimistic-update path is what catches this.' },
  ]},
  { phase: 'N', id: 'N12', title: 'Non-card direct navigation: /my-trips with NO ?scope= still works (no regression to the tabbed view)',
    preconditions: 'Signed-in driver. Sanity check that the plain (un-scoped) /my-trips page is unchanged.',
    steps: [
    { action: 'Navigate to /my-trips with no query params.', expected: 'Renders the tabbed "My trips" page (All / Driving / Invited / Applied / Posted etc.) — NOT the scoped Invites Received header. Same as today.' },
    { action: 'On the Invited tab, tap a trip → tap Back.', expected: 'Returns to /my-trips on the Invited tab. The tabbed view is the default fallback when no `?from=` is in the URL.' },
    { action: 'Plain /posted-trips (agent equivalent) behaves the same way.', expected: 'Tabbed view, no scoped header, Back returns to the tabbed view.' },
  ]},

  // ── M (Multi-way trips — migration 024) ──────────────────────────────
  // 1:1 mirror of e2e/trip-types.spec.ts "PostTripPage — multi-way trips" suite.
  // Each Mn case below has a corresponding Mn-named E2E test that's been verified to pass
  // against the deployed Supabase. Use these manual cases for end-to-end QA passes through
  // the UI; the E2E covers the body-shape + lifecycle contracts at the API tier.
  { phase: 'M', id: 'M0', title: 'UI — Multi-way tab on /trips/new reveals the waypoint editor + Return to start checkbox',
    preconditions: 'Signed-in approved agent on /trips/new.',
    steps: [
    { action: 'Tap the "Multi-way" tab in the trip-type segmented control.', expected: 'Section heading switches to "Multi-way itinerary". "Destinations (in order)" sub-section appears with an "Add destination" button. "Return to start" checkbox is visible (toggles whether the last waypoint loops back to the pickup city).' },
    { action: 'Tap "Add destination" twice to build a 3-stop chain (pickup + 2 stops).', expected: 'Two destination rows appear, each with city picker, time of arrival picker, and optional wait-minutes input. Order is enforced (drag handle / arrow buttons present).' },
    { action: 'Toggle "Return to start" on.', expected: 'A read-only "back to pickup city" row appears as the final waypoint. The to_city resolves to the pickup city on submit.' },
  ]},
  { phase: 'M', id: 'M1', title: 'Happy path — POST /trips with trip_type=multi_way and 3+ waypoints persists',
    preconditions: 'Approved agent token. ≥3 distinct cities seeded.',
    steps: [
    { action: 'POST /trips with trip_type:"multi_way", waypoints: [pickup, via, drop] (3 entries). Pickup_at < via.arrive_at < drop.arrive_at.', expected: '200 OK with data.id returned. data.trip_type === "multi_way".' },
    { action: 'GET /trips/{id}. Read shape.', expected: 'trip_type === "multi_way". waypoints.length >= 3. from_city_id mirrors waypoints[0].city_id; to_city_id mirrors the last destination waypoint\'s city_id.' },
  ]},
  { phase: 'M', id: 'M2', title: 'Return-to-start — multi_way last waypoint == first city is allowed',
    preconditions: 'Approved agent token. ≥2 distinct cities seeded.',
    steps: [
    { action: 'POST /trips with trip_type:"multi_way", from_city_id === to_city_id, waypoints: [cityA, cityB (via), cityA (back)]. Strictly monotonic arrive_at.', expected: '200 OK. Unlike one_way (which 422s on last == first), multi_way explicitly permits the loop — this is the "drop the passenger somewhere, drive them back" use case.' },
    { action: 'GET /trips/{id}. Verify trip_type.', expected: 'trip_type === "multi_way".' },
  ]},
  { phase: 'M', id: 'M3', title: 'Validation — multi_way with only 2 waypoints → 422',
    preconditions: 'Approved agent token.',
    steps: [
    { action: 'POST /trips with trip_type:"multi_way" but only 2 waypoints (pickup + destination).', expected: '422 VALIDATION. Error message contains "multi_way" (server text: "multi_way requires ≥3 waypoints"). No trip row created.' },
  ]},
  { phase: 'M', id: 'M4', title: 'Validation — multi_way with non-monotonic arrive_at → 422',
    preconditions: 'Approved agent token. ≥3 distinct cities seeded.',
    steps: [
    { action: 'POST /trips with trip_type:"multi_way", waypoints chain where waypoint[2].arrive_at < waypoint[1].arrive_at (out of time order).', expected: '422 VALIDATION. Server message includes "waypoints[i].arrive_at must be > previous". No trip row created.' },
  ]},
  { phase: 'M', id: 'M5', title: 'Lifecycle — multi_way trip survives post → apply → assign → accept → start → complete',
    preconditions: 'Approved agent + approved driver (with vehicle) tokens. ≥3 distinct cities seeded.',
    steps: [
    { action: 'Agent posts a multi_way trip (M1 shape).', expected: '200, trip_id returned.' },
    { action: 'Driver POST /trips/{id}/applicants.', expected: 'Trip status flips to has_applicants. Returns acceptance_id.' },
    { action: 'Agent POST /trips/{id}/assign { acceptance_id }.', expected: 'Trip status → selected.' },
    { action: 'Driver POST /trips/{id}/accept.', expected: 'Trip status → accepted. Returns passenger_otp (4-6 digit).' },
    { action: 'Driver POST /trips/{id}/start with passenger_otp.', expected: 'Trip status → in_progress.' },
    { action: 'Driver POST /trips/{id}/complete.', expected: '200. Trip status → completed.' },
    { action: 'GET /trips/{id}. Verify trip_type preserved.', expected: 'trip_type === "multi_way" still. Lifecycle endpoints (apply/assign/accept/start/complete) do NOT have multi-way-specific branches that could regress — this test guards against a future refactor introducing one.' },
  ]},
];

// ── Qase API helpers ───────────────────────────────────────────────────────
async function qase(method, pathSuffix, body) {
  const url = `https://api.qase.io/v1${pathSuffix}`;
  const res = await fetch(url, {
    method,
    headers: { Token: TOKEN, accept: 'application/json', 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await res.text();
  let json;
  try { json = JSON.parse(txt); } catch { json = { raw: txt }; }
  if (!res.ok || json.status === false) {
    throw new Error(`Qase ${method} ${pathSuffix} → ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
  }
  return json.result;
}

async function listAllSuites() {
  const out = [];
  let offset = 0;
  while (true) {
    const r = await qase('GET', `/suite/${PROJECT}?limit=100&offset=${offset}`);
    const ents = r?.entities || [];
    out.push(...ents);
    if (ents.length < 100) break;
    offset += 100;
  }
  return out;
}

async function listAllCases() {
  const out = [];
  let offset = 0;
  while (true) {
    const r = await qase('GET', `/case/${PROJECT}?limit=100&offset=${offset}`);
    const ents = r?.entities || [];
    out.push(...ents);
    if (ents.length < 100) break;
    offset += 100;
  }
  return out;
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const preview = { project: PROJECT || '<not set>', phases: PHASES.length, scenarios: SCENARIOS.length, steps: SCENARIOS.reduce((n, s) => n + s.steps.length, 0), plan: [] };

  if (DRY) {
    for (const p of PHASES) {
      const phaseScenarios = SCENARIOS.filter((s) => s.phase === p.code);
      preview.plan.push({ suite: p.title, cases: phaseScenarios.map((s) => ({ id: s.id, title: `${s.id} · ${s.title}`, steps: s.steps.length })) });
    }
    const outPath = path.resolve(__dirname, '..', 'qase-import-preview.json');
    fs.writeFileSync(outPath, JSON.stringify(preview, null, 2));
    console.log(`✓ Dry-run preview written to ${outPath}`);
    console.log(`  Phases: ${preview.phases} · Scenarios: ${preview.scenarios} · Steps: ${preview.steps}`);
    return;
  }

  console.log(`→ Importing into project ${PROJECT}: ${PHASES.length} suites, ${SCENARIOS.length} cases.`);

  // 1. Suites: ensure one per phase. Idempotent by title.
  const existingSuites = await listAllSuites();
  const suiteIdByCode = new Map();
  for (const p of PHASES) {
    const existing = existingSuites.find((s) => s.title === p.title);
    if (existing) {
      suiteIdByCode.set(p.code, existing.id);
      console.log(`  ✓ Suite kept: ${p.title} (id=${existing.id})`);
    } else {
      const created = await qase('POST', `/suite/${PROJECT}`, { title: p.title, description: p.description });
      suiteIdByCode.set(p.code, created.id);
      console.log(`  + Suite created: ${p.title} (id=${created.id})`);
    }
  }

  // 2. Cases: idempotent by title within suite.
  const existingCases = await listAllCases();
  const caseByTitle = new Map(existingCases.map((c) => [c.title, c]));

  for (const s of SCENARIOS) {
    const suiteId = suiteIdByCode.get(s.phase);
    const title = `${s.id} · ${s.title}`;
    const payload = {
      title,
      description: s.preconditions ? `**Preconditions:** ${s.preconditions}` : undefined,
      suite_id: suiteId,
      automation: 0,         // 0=manual, 1=to-be-automated, 2=automated
      priority: 1,           // 0=not_set, 1=low, 2=medium, 3=high (Qase: 1=high, treat as high for manual QA-priority)
      severity: 4,           // 1=blocker, 2=critical, 3=major, 4=normal, 5=minor, 6=trivial
      type: 1,               // 1=functional
      is_flaky: 0,
      steps: s.steps.map((st, i) => ({ action: st.action, expected_result: st.expected, position: i + 1 })),
    };
    const existing = caseByTitle.get(title);
    if (existing) {
      await qase('PATCH', `/case/${PROJECT}/${existing.id}`, payload);
      console.log(`  ~ Case updated: ${title} (id=${existing.id})`);
    } else {
      const created = await qase('POST', `/case/${PROJECT}`, payload);
      console.log(`  + Case created: ${title} (id=${created.id})`);
    }
  }

  console.log(`\n✓ Import complete. View at https://app.qase.io/project/${PROJECT}`);
}

main().catch((err) => { console.error(err.message || err); process.exit(1); });
