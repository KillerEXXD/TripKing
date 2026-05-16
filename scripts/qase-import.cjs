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
