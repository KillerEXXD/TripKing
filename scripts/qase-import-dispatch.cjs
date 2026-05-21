#!/usr/bin/env node
/**
 * Importer: the "I'm Online" + token-queue Auto-dispatch feature → Qase test cases.
 *
 * Companion to scripts/qase-import.cjs (the invite-flow QA doc). Self-contained
 * and idempotent: suites are looked up by title and cases by title, then PATCHed
 * rather than duplicated. Re-run any time after editing the SCENARIOS below.
 *
 * Source of truth: docs/DISPATCH_IMPLEMENTATION_PLAN.md +
 * memory/project-online-token-dispatch.md. Covers the whole feature surface —
 * admin toggle, /config, presence, the 3-state grace + token lifecycle, global
 * vs location queue, the offer engine, the 60s offer, missed trips, busy→re-join,
 * exhaustion/widen/retry, real-time delivery, push, mode-swap drain, security/PII,
 * and failure modes — including cases for parts still in build (marked in their
 * preconditions) so QA has the full plan up front.
 *
 * Usage:
 *   node scripts/qase-import-dispatch.cjs --dry-run   # writes qase-import-dispatch-preview.json
 *   node scripts/qase-import-dispatch.cjs             # live import (POST/PATCH api.qase.io)
 *
 * Env (.env.development): QASE_API_TOKEN, QASE_PROJECT_CODE (e.g. TRIPKINGAP).
 */
'use strict';

const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.resolve(__dirname, '..', '.env.development');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
loadEnv();

const TOKEN = process.env.QASE_API_TOKEN;
const PROJECT = process.env.QASE_PROJECT_CODE;
const DRY = process.argv.includes('--dry-run');
if (!DRY) {
  if (!TOKEN) { console.error('QASE_API_TOKEN not set. Use --dry-run for a preview.'); process.exit(1); }
  if (!PROJECT) { console.error('QASE_PROJECT_CODE not set (e.g. TRIPKINGAP).'); process.exit(1); }
}

// Qase priority: 1=high 2=medium 3=low. severity: 1=blocker 2=critical 3=major 4=normal 5=minor.
const P = { high: 1, med: 2, low: 3 };
const S = { blocker: 1, critical: 2, major: 3, normal: 4, minor: 5 };

const PHASES = [
  { code: 'DA',  title: 'Dispatch · Admin algorithm toggle & settings', description: 'The platform-wide Auto⇄Manual switch + the 8 Auto-dispatch tunables in /administration/config → Dispatch. Admin-only, confirm-guarded, audit-logged.' },
  { code: 'DC',  title: 'Dispatch · Public /config endpoint',           description: 'The unauthenticated GET /config projection (dispatch_algorithm + timings) that drives the driver UI swap. Must never leak commercial settings.' },
  { code: 'DP',  title: 'Dispatch · Driver presence ("I\'m Online")',    description: 'Go online / offline / heartbeat + the OnlineToggle UI. KYC + active gating. Shown only when the platform algorithm = auto.' },
  { code: 'DG',  title: 'Dispatch · Offline grace & token lifecycle',    description: 'The 3 states: online / grace (keeps token, hidden, no offers) / offline (token cleared). Reconnect-within-grace, grace expiry, heartbeat lapse.' },
  { code: 'DQ',  title: 'Dispatch · Global token & location queue',      description: 'Hidden global token (never shown) vs the location-relative "X of N nearby". Radius is the hard gate; token only orders the reachable set.' },
  { code: 'DE',  title: 'Dispatch · Auto-offer engine',                  description: 'On post (auto mode): radius-filter → token-order → offer #1 for 60s → advance on miss/decline. One offer at a time. DB-authoritative deadline + on-read/realtime advance + 1-min cron.' },
  { code: 'DO',  title: 'Dispatch · Incoming offer (60s) — driver',      description: 'The driver-side IncomingOfferModal: 60s countdown, Accept → trip assigned + OTP, Decline → advances, timeout → advances.' },
  { code: 'DM',  title: 'Dispatch · Missed / declined trips',            description: 'No penalty on miss/decline; the trip appears in the driver\'s Missed Trips list (informational).' },
  { code: 'DB',  title: 'Dispatch · Busy → re-join lifecycle',           description: 'Accept removes the driver from the queue (no new offers) until the trip completes; on completion they auto re-join with a NEW token at the drop location.' },
  { code: 'DX',  title: 'Dispatch · Exhaustion / widen / retry',         description: 'No taker → widen radius → loop to max passes → waiting (cooldown + auto-retry) → Unfilled + notify agent → re-broadcast.' },
  { code: 'DRT', title: 'Dispatch · Real-time delivery',                 description: 'Realtime as a SIGNAL not source (PR #324): trip_offers/trips changes invalidate queries; data still flows through REST/transforms. Sub-second offer + agent status. Polling fallback.' },
  { code: 'DPH', title: 'Dispatch · Push (FCM) delivery',                description: 'FCM push for offers + unfilled so a backgrounded driver gets the 60s offer in time. Provider-abstracted; no-op when unconfigured.' },
  { code: 'DSW', title: 'Dispatch · Mode swap & graceful drain',         description: 'Flipping the algorithm: each trip freezes its mode at POST, so in-flight finishes in its mode; new trips use the new mode. The driver availability UI + agent surfaces swap.' },
  { code: 'DSEC',title: 'Dispatch · Security, RLS & PII',                description: 'The global token never leaves the server. RLS scoping on driver_presence/trip_offers. Toggle is admin-only + audited. Passenger OTP stays stripped.' },
  { code: 'DED', title: 'Dispatch · Edge cases & failure modes',         description: 'GPS denied/lost, clock skew, rapid toggling, no vehicle, deactivation mid-online, duplicate-token races, cron-down, concurrent accepts, config blip.' },
];

const SCENARIOS = [
  // ── DA · Admin toggle & settings ───────────────────────────────────────
  { phase: 'DA', id: 'DA.1', title: 'Dispatch section is admin-only', sev: S.critical, steps: [
    { action: 'As a non-admin (driver/agent), navigate directly to /administration/config.', expected: 'AdminRoute blocks — redirect/403; the Dispatch section is never reachable.' },
    { action: 'As admin, open /administration/config → Dispatch tab.', expected: 'The Dispatch section renders: algorithm toggle (Manual/Auto) + the 8 tunables + "Currently live: manual".' },
  ]},
  { phase: 'DA', id: 'DA.2', title: 'Toggle shows a confirm dialog before flipping', sev: S.major, steps: [
    { action: 'On Dispatch, current = Manual. Click the "Auto" pill.', expected: 'A confirm dialog opens explaining the impact ("drivers switch to I\'m Online / auto-offered…", "in-flight trips finish as-is", "make sure QA is briefed"). NOTHING is saved yet.' },
    { action: 'Click Cancel (or press Escape).', expected: 'Dialog closes; algorithm stays Manual; no PUT fired.' },
    { action: 'Click "Auto" again → Enable Auto-dispatch.', expected: 'PUT /admin/app-settings { dispatch_algorithm:"auto" }. Toast "Switched to Auto-dispatch". "Currently live: auto".' },
  ]},
  { phase: 'DA', id: 'DA.3', title: 'Clicking the already-live algorithm is a no-op', sev: S.minor, steps: [
    { action: 'Current = Manual. Click the "Manual" pill.', expected: 'No dialog, no network call — it is already live.' },
  ]},
  { phase: 'DA', id: 'DA.4', title: 'Every algorithm flip is audit-logged', sev: S.major, steps: [
    { action: 'Flip Auto→Manual→Auto. Query admin_audit_log (or the audit view) for entity="app_settings".', expected: 'One row per flip with actor_user_id, action="update", before_json/after_json showing the dispatch_algorithm change.' },
  ]},
  { phase: 'DA', id: 'DA.5', title: 'Tunables save + validate against DB CHECK bounds', sev: S.major, steps: [
    { action: 'Edit Offer window to 60, Initial radius to 3, Max retries to 3. Save.', expected: 'Toast "Dispatch settings saved". PUT carries only the 8 dispatch_* fields (not the algorithm).' },
    { action: 'Set Offer window to 10 (below the 15 min) and Save.', expected: 'Rejected — DB CHECK (15–300) → 4xx; UI surfaces the error; value not persisted.' },
    { action: 'Set Offer window to 999 (above 300). Save.', expected: 'Rejected (CHECK upper bound). No persistence.' },
    { action: 'Reset.', expected: 'Draft reverts to the last saved values; no network call.' },
  ]},
  { phase: 'DA', id: 'DA.6', title: 'Saved tunables take effect on the NEXT dispatch only', sev: S.normal, steps: [
    { action: 'With an offer in flight, change Offer window 60→90 and Save.', expected: 'The in-flight offer keeps its original 60s deadline; the next offer uses 90s. No retroactive change to live deadlines.' },
  ]},

  // ── DC · /config ───────────────────────────────────────────────────────
  { phase: 'DC', id: 'DC.1', title: 'GET /config is public and returns the curated subset', sev: S.major, steps: [
    { action: 'curl GET /functions/v1/config with no auth.', expected: '200 { success, data:{ dispatch_algorithm, dispatch_offer_seconds, dispatch_offline_grace_seconds, dispatch_heartbeat_stale_seconds } }.' },
    { action: 'Inspect the payload keys.', expected: 'dispatch_algorithm ∈ {auto,manual}; the 3 timings are numbers.' },
  ]},
  { phase: 'DC', id: 'DC.2', title: '/config never leaks commercial settings', sev: S.critical, steps: [
    { action: 'Inspect the /config response body.', expected: 'NO default_commission_pct, default_driver_bata, default_gst_amount, fees, or any other app_settings field beyond the 4 whitelisted keys.' },
  ]},
  { phase: 'DC', id: 'DC.3', title: '/config method + route guards', sev: S.minor, steps: [
    { action: 'POST /config.', expected: '405 METHOD_NOT_ALLOWED.' },
    { action: 'GET /config/anything.', expected: '404 (unknown config route).' },
  ]},
  { phase: 'DC', id: 'DC.4', title: '/config reflects an admin flip within the cache TTL', sev: S.normal, steps: [
    { action: 'Note dispatch_algorithm from /config. Admin flips it. Re-fetch /config after ~30s (cache TTL).', expected: 'The new algorithm is reflected. (Within the TTL a stale value is acceptable by design.)' },
  ]},

  // ── DP · Driver presence ───────────────────────────────────────────────
  { phase: 'DP', id: 'DP.1', title: 'Availability surface swaps on the platform algorithm', sev: S.critical, steps: [
    { action: 'Platform = manual. Open the driver home.', expected: 'The "I\'m vacant" (IAmAvailableCard) is shown. No OnlineToggle.' },
    { action: 'Admin flips to auto. Reload the driver home.', expected: 'The <OnlineToggle> ("I\'m Online") replaces the vacancy card. No vacancy/apply CTA.' },
    { action: 'While /config is still loading (throttle the network).', expected: 'Fails safe to manual — the vacancy card shows; never strands the driver in a half-loaded Auto UI.' },
  ]},
  { phase: 'DP', id: 'DP.2', title: 'Go online — happy path', preconditions: 'Platform=auto; driver is_active + KYC approved; location permission granted.', sev: S.major, steps: [
    { action: 'Tap "Go Online".', expected: 'Browser prompts for / uses GPS. POST /drivers/online { lat,lng,vehicle_id }. Card flips to "You\'re Online" (emerald) + "In the queue". Toast "You\'re online — finding trips near you."' },
    { action: 'Inspect the /drivers/online response.', expected: 'status:"online", is_online:true. NO token field anywhere in the payload.' },
  ]},
  { phase: 'DP', id: 'DP.3', title: 'Go online blocked when KYC not approved', sev: S.critical, steps: [
    { action: 'Driver with kyc_status≠approved taps Go Online.', expected: '403 KYC_REQUIRED. Toast "Finish KYC verification to go online." No presence row created/updated to online.' },
  ]},
  { phase: 'DP', id: 'DP.4', title: 'Go online blocked when the account is deactivated', sev: S.critical, steps: [
    { action: 'Admin deactivates the driver (is_active=false). Driver taps Go Online.', expected: '403; toast "Your account can\'t go online right now." Not added to the queue.' },
  ]},
  { phase: 'DP', id: 'DP.5', title: 'Go online with no GPS permission', sev: S.major, steps: [
    { action: 'Deny location permission, tap Go Online.', expected: 'Toast "Turn on location to go online." No /drivers/online call (can\'t go online without a fix).' },
  ]},
  { phase: 'DP', id: 'DP.6', title: 'Vehicle picker — default + selection', sev: S.normal, steps: [
    { action: 'Driver with >1 active vehicle, offline. Open the card.', expected: 'A vehicle <select> shows, defaulting to the primary (or first) vehicle.' },
    { action: 'Choose a different vehicle, then Go Online.', expected: 'POST /drivers/online carries the chosen vehicle_id.' },
    { action: 'Driver with exactly 1 vehicle.', expected: 'No picker shown; that vehicle is used implicitly.' },
  ]},
  { phase: 'DP', id: 'DP.7', title: 'Heartbeat keeps the position fresh while online', sev: S.normal, steps: [
    { action: 'Stay online; observe network for ~1 min.', expected: 'POST /drivers/heartbeat fires periodically (~30s) with the current lat/lng. drivers.current_lat/lng/current_location_at update too.' },
    { action: 'Background the tab.', expected: 'Heartbeats pause while the tab is hidden; resume on focus.' },
  ]},
  { phase: 'DP', id: 'DP.8', title: 'Heartbeat before going online is rejected', sev: S.minor, steps: [
    { action: 'POST /drivers/heartbeat for a driver with no presence row.', expected: '409 "Not online — call /drivers/online first".' },
  ]},
  { phase: 'DP', id: 'DP.9', title: 'GET /drivers/presence reflects the derived status', sev: S.normal, steps: [
    { action: 'GET /drivers/presence while online.', expected: 'status:"online" + grace_expires_at:null + vehicle_id; NO token.' },
    { action: 'Unauthenticated GET /drivers/presence.', expected: '401.' },
  ]},
  { phase: 'DP', id: 'DP.10', title: 'Go online / offline / heartbeat require a driver profile', sev: S.minor, steps: [
    { action: 'A trip_manager (no driver profile) calls POST /drivers/online.', expected: '404 "No driver profile for this account".' },
  ]},

  // ── DG · Grace & token lifecycle ───────────────────────────────────────
  { phase: 'DG', id: 'DG.1', title: 'Go offline → grace (keeps the token, hidden, no offers)', sev: S.major, steps: [
    { action: 'Online driver taps Go Offline.', expected: 'status:"grace"; grace_expires_at set ~3 min ahead. Card shows "Going offline… come back within M:SS to keep your place" + a live countdown.' },
    { action: 'Post a trip nearby during the grace window.', expected: 'The grace driver is NOT offered the trip and is NOT counted in the nearby pool.' },
  ]},
  { phase: 'DG', id: 'DG.2', title: 'Reconnect within grace keeps the same token', sev: S.major, steps: [
    { action: 'Within the grace window, tap "I\'m back online" (or a heartbeat fires).', expected: 'status→online; the driver keeps their queue position (same global token). Re-enters nearby pools immediately.' },
  ]},
  { phase: 'DG', id: 'DG.3', title: 'Grace expiry clears the token (drop from global queue)', sev: S.major, steps: [
    { action: 'Go offline; wait past the grace window (or run expire_offline_grace).', expected: 'status→offline; token cleared. Driver no longer in any queue.' },
    { action: 'Go online again later.', expected: 'A FRESH (higher) token is allocated — back of the global queue.' },
  ]},
  { phase: 'DG', id: 'DG.4', title: 'Heartbeat lapse auto-enters grace then expires', sev: S.major, steps: [
    { action: 'Online driver stops sending heartbeats (close tab / lose network) beyond the stale timeout (~90s). Wait for the minute cron.', expected: 'expire_offline_grace flips them to grace (token retained). After the grace window, the token is cleared.' },
  ]},
  { phase: 'DG', id: 'DG.5', title: 'Grace countdown is wall-clock accurate', sev: S.normal, steps: [
    { action: 'Enter grace; watch the countdown for ~30s.', expected: 'Counts down 1/sec from grace_expires_at; hits 0:00 exactly at expiry; no negative values.' },
  ]},

  // ── DQ · Global token & location queue ─────────────────────────────────
  { phase: 'DQ', id: 'DQ.1', title: 'Tokens are monotonic by go-online order', sev: S.major, steps: [
    { action: 'Driver A then driver B go online. Inspect (server/DB) driver_presence.token.', expected: 'B\'s token > A\'s token (allocated from the sequence). Never exposed via any API.' },
  ]},
  { phase: 'DQ', id: 'DQ.2', title: 'Radius is a hard gate; token orders the reachable set', sev: S.critical, steps: [
    { action: 'A (token 5) is 50km away; B (token 50) is 2km from a pickup. Post a trip there (3km radius).', expected: 'Only B is eligible (A filtered by radius). A\'s lower token is irrelevant — it never enters this trip\'s queue.' },
  ]},
  { phase: 'DQ', id: 'DQ.3', title: 'Driver only ever sees the local "X of N nearby"', sev: S.critical, steps: [
    { action: 'With 8 online drivers in a 3km circle and you 2nd by token, inspect the driver UI + every API response.', expected: 'UI shows "2 of 8 nearby" (or similar). The raw global token (e.g. 1010) appears NOWHERE in any client payload.' },
  ]},
  { phase: 'DQ', id: 'DQ.4', title: 'Moving location re-buckets you into a new local queue', sev: S.normal, steps: [
    { action: 'Online in area A (2 of 5). Drive to area B and let the heartbeat update your GPS.', expected: 'Same hidden token, but your nearby count/position reflects area B (e.g. 1 of 3). Eligibility follows your live position.' },
  ]},
  { phase: 'DQ', id: 'DQ.5', title: 'Busy + grace + stale drivers are excluded from the eligible set', sev: S.major, steps: [
    { action: 'Set up: one busy (on a trip), one in grace, one with a stale heartbeat, one truly online in radius. Run the eligibility query for a nearby trip.', expected: 'Only the truly-online, fresh-heartbeat, non-busy driver is returned (ordered by token).' },
  ]},

  // ── DE · Auto-offer engine ─────────────────────────────────────────────
  { phase: 'DE', id: 'DE.1', title: 'Post (auto) → first offer to the lowest-token driver in radius', preconditions: 'Platform=auto. ≥2 online drivers in radius.', sev: S.critical, steps: [
    { action: 'Agent posts a trip.', expected: 'dispatch_status→"offering"; current_offer_driver_id = the lowest-token online driver in the initial radius; offer_deadline_at = now + offer window (60s). A trip_offers(offered) row is written. No applicants list (auto has no apply).' },
  ]},
  { phase: 'DE', id: 'DE.2', title: 'Timeout advances to the next driver by token', sev: S.major, steps: [
    { action: 'Let the 60s lapse with no response (rely on a viewer poll or the 1-min cron).', expected: 'The current trip_offers row → "missed"; the offer advances to the next-lowest token in radius with a fresh 60s deadline. dispatch_status stays "offering".' },
  ]},
  { phase: 'DE', id: 'DE.3', title: 'Decline advances immediately (same as timeout)', sev: S.major, steps: [
    { action: 'The offered driver taps Decline.', expected: 'trip_offers→"declined"; advance_dispatch runs immediately → next driver offered. No token penalty for the decliner.' },
  ]},
  { phase: 'DE', id: 'DE.4', title: 'One offer at a time — a driver with a live offer is skipped elsewhere', sev: S.critical, steps: [
    { action: 'Driver X has a live offer on trip A. Post trip B where X is also next-in-line.', expected: 'Trip B skips X and offers the next eligible driver. X is never the current offer on two trips at once.' },
  ]},
  { phase: 'DE', id: 'DE.5', title: 'No double-offer within a pass', sev: S.major, steps: [
    { action: 'During one pass, ensure a driver who already missed is not re-offered the same trip in the same pass.', expected: 'Each driver gets at most one offer per pass (unique trip_id+driver_id+pass_number).' },
  ]},
  { phase: 'DE', id: 'DE.6', title: 'On-read advancement keeps it moving with an active viewer', sev: S.normal, steps: [
    { action: 'Agent watches trip detail (polls ~5s) while an offer lapses.', expected: 'The next GET triggers advance_dispatch — the status panel moves to the next driver within a few seconds without waiting for the cron.' },
  ]},
  { phase: 'DE', id: 'DE.7', title: 'Cron safety-net advances a no-viewer trip', sev: S.major, steps: [
    { action: 'Post an auto trip, then close all agent/driver views. Wait up to ~1 min.', expected: 'The dispatch_sweep cron advances the lapsed offer even with nobody watching (up to ~60s late, by design).' },
  ]},
  { phase: 'DE', id: 'DE.8', title: 'Manual-mode post does NOT enter the offer engine', sev: S.major, steps: [
    { action: 'Platform=manual. Agent posts a trip.', expected: 'dispatch_status stays null/manual; the legacy auto-invite + applicants flow runs. No trip_offers rows.' },
  ]},

  // ── DO · Incoming offer (60s) ──────────────────────────────────────────
  { phase: 'DO', id: 'DO.1', title: 'Offer arrives and shows a 60s countdown', preconditions: 'Driver is the current_offer_driver_id (PR6 IncomingOfferModal).', sev: S.major, steps: [
    { action: 'When offered, observe the driver app.', expected: 'A full-screen IncomingOfferModal shows the trip summary + a 60s ring counting down. Accept + Decline buttons.' },
  ]},
  { phase: 'DO', id: 'DO.2', title: 'Accept → trip assigned + OTP', sev: S.critical, steps: [
    { action: 'Tap Accept before the timer ends.', expected: 'POST /trips/:id/offer-accept → trip_offers "accepted" + trip_acceptances "accepted" + trips.assigned_* + dispatch_status "filled". Passenger OTP issued. driver_presence.busy_trip_id set. Downstream (start/complete/OTP) behaves exactly like the manual handshake.' },
  ]},
  { phase: 'DO', id: 'DO.3', title: 'Accept after the deadline is rejected (superseded)', sev: S.major, steps: [
    { action: 'Let the timer hit 0, then tap Accept (stale UI).', expected: '409 with a clear reason (offer expired/superseded). The modal closes; the trip is already being offered to the next driver.' },
  ]},
  { phase: 'DO', id: 'DO.4', title: 'Only the current offer driver can accept', sev: S.critical, steps: [
    { action: 'A different online driver calls POST /trips/:id/offer-accept for a trip they were not offered.', expected: '403/409 — not the current_offer_driver_id. Cannot steal an offer.' },
  ]},
  { phase: 'DO', id: 'DO.5', title: 'Decline closes the modal with no penalty', sev: S.normal, steps: [
    { action: 'Tap Decline.', expected: 'Modal closes; the driver keeps their token/position; the trip advances to the next driver.' },
  ]},

  // ── DM · Missed / declined trips ───────────────────────────────────────
  { phase: 'DM', id: 'DM.1', title: 'A missed offer appears in "Missed Trips" (informational)', sev: S.normal, steps: [
    { action: 'Be offered a trip and let it time out. Open the driver "Missed Trips" tab.', expected: 'The trip is listed with a "missed" marker. It is informational only — no warning/penalty.' },
  ]},
  { phase: 'DM', id: 'DM.2', title: 'A declined offer also appears in the list', sev: S.minor, steps: [
    { action: 'Decline an offer. Open Missed Trips.', expected: 'The declined trip is listed (declined). The driver\'s queue position is unchanged.' },
  ]},
  { phase: 'DM', id: 'DM.3', title: 'Missing/declining does not change the token', sev: S.major, steps: [
    { action: 'Note your nearby position; miss an offer; check your position again on the next trip.', expected: 'Same global token / same relative position — no demotion for missing.' },
  ]},

  // ── DB · Busy → re-join ────────────────────────────────────────────────
  { phase: 'DB', id: 'DB.1', title: 'On an accepted trip, no new offers arrive', sev: S.critical, steps: [
    { action: 'Accept a trip. Post other nearby trips.', expected: 'busy_trip_id is set; the driver receives NO new offers until the current trip completes.' },
  ]},
  { phase: 'DB', id: 'DB.2', title: 'Completion auto re-joins with a NEW token at the drop', sev: S.major, steps: [
    { action: 'Complete the trip at the destination.', expected: 'busy_trip_id cleared; the driver is auto re-online with a fresh (back-of-queue) token at the drop GPS. The OnlineToggle shows "You\'re Online" again.' },
    { action: 'Confirm the new token > the old one.', expected: 'Re-join is at the back of the global queue (new nextval), not the old position.' },
  ]},
  { phase: 'DB', id: 'DB.3', title: 'Driver can go offline after completing (not forced online)', sev: S.normal, steps: [
    { action: 'After completion + auto re-online, tap Go Offline.', expected: 'Normal grace transition; they are not forced to stay online.' },
  ]},
  { phase: 'DB', id: 'DB.4', title: 'Cancelling the assignment frees the driver', sev: S.major, steps: [
    { action: 'Cancel the assignment / trip before start.', expected: 'busy_trip_id cleared; the driver returns to an eligible online state (per the cancel path) and can be offered again.' },
  ]},

  // ── DX · Exhaustion / widen / retry ────────────────────────────────────
  { phase: 'DX', id: 'DX.1', title: 'No taker in the initial radius → widen', sev: S.major, steps: [
    { action: 'All drivers in the initial 3km miss/decline.', expected: 'dispatch_status→"widening"; current_radius_km grows by the widen step; pass_number++. Drivers in the wider ring are now offered.' },
  ]},
  { phase: 'DX', id: 'DX.2', title: 'Passes exhausted → waiting (cooldown) + auto-retry', sev: S.major, steps: [
    { action: 'Exhaust all passes with no acceptance.', expected: 'dispatch_status→"waiting"; next_retry_at set ~2 min ahead; retry_count++. The trip card shows "Waiting" / "retry in m:ss".' },
    { action: 'Wait for the cooldown (dispatch_retry_due cron).', expected: 'Dispatch restarts from radius 0 and re-scans (drivers free up / come online between attempts).' },
  ]},
  { phase: 'DX', id: 'DX.3', title: 'Max retries reached → Unfilled + notify agent', sev: S.major, steps: [
    { action: 'Let all retries exhaust with nobody available.', expected: 'dispatch_status→"unfilled"; a trip_unfilled notification fires to the poster. Trip card badge → "Unfilled".' },
  ]},
  { phase: 'DX', id: 'DX.4', title: 'Re-broadcast restarts the engine', sev: S.normal, steps: [
    { action: 'On an Unfilled trip, agent taps "Re-broadcast" (optionally after editing fare).', expected: 'POST /trips/:id/rebroadcast resets radius + retry_count and re-enters the offer loop.' },
  ]},
  { phase: 'DX', id: 'DX.5', title: 'Acceptance during a later pass/retry fills the trip', sev: S.normal, steps: [
    { action: 'A driver comes online during the cooldown and accepts on the next retry.', expected: 'dispatch_status→"filled" normally; the waiting/retry state ends.' },
  ]},

  // ── DRT · Real-time ────────────────────────────────────────────────────
  { phase: 'DRT', id: 'DRT.1', title: 'Offer arrives sub-second via Realtime (two sessions)', preconditions: 'VITE_SUPABASE_* set; trip_offers in the publication.', sev: S.major, steps: [
    { action: 'Driver online in Browser A; agent posts a matching trip in Browser B.', expected: 'The IncomingOfferModal appears in A within ~1–2s with no manual refresh (trip_offers INSERT → invalidate ["offeredTrips"] → refetch).' },
  ]},
  { phase: 'DRT', id: 'DRT.2', title: 'Agent dispatch status updates live', sev: S.normal, steps: [
    { action: 'Agent watches the trip detail while the engine advances offers.', expected: 'The DispatchStatusPanel updates live ("Offering to driver 3 of 8 — 42s", "Widening…", "Unfilled") via the existing trips Realtime channel — no refresh.' },
  ]},
  { phase: 'DRT', id: 'DRT.3', title: 'Realtime is a SIGNAL, not a source (rule #1)', sev: S.critical, steps: [
    { action: 'Inspect the realtime handler / network: after a socket event, confirm the rendered data comes from a REST refetch, not the socket payload.', expected: 'The socket event only triggers invalidateQueries; all rendered data passes through the edge-fn transforms + per-viewer redaction. No DB row is rendered straight from the socket.' },
  ]},
  { phase: 'DRT', id: 'DRT.4', title: 'Polling fallback when the socket is unavailable', sev: S.major, steps: [
    { action: 'Block the WebSocket (or unset the Supabase env). Post a trip / advance an offer.', expected: 'Surfaces still update on the React Query polling cadence (~3–10s). Nothing breaks or goes blank — Realtime is additive.' },
  ]},
  { phase: 'DRT', id: 'DRT.5', title: 'Token refresh keeps the channel alive', sev: S.normal, steps: [
    { action: 'Stay signed in past the ~1h access-token window (or force a refresh).', expected: 'The realtime connection re-auths (setRealtimeAuth from onTokenChange); offer/status events keep arriving.' },
  ]},

  // ── DPH · Push (FCM) ───────────────────────────────────────────────────
  { phase: 'DPH', id: 'DPH.1', title: 'Backgrounded driver gets the offer as a push', preconditions: 'FCM configured; driver granted notification permission + registered a device token.', sev: S.major, steps: [
    { action: 'Driver is online but the app is backgrounded / screen locked. They become the current offer.', expected: 'An FCM push fires within the 60s window with the trip summary; tapping it opens the IncomingOfferModal with the remaining time.' },
  ]},
  { phase: 'DPH', id: 'DPH.2', title: 'Unfilled fires a push/notification to the agent', sev: S.normal, steps: [
    { action: 'A trip goes Unfilled.', expected: 'A trip_unfilled notification (and push if configured) reaches the posting agent.' },
  ]},
  { phase: 'DPH', id: 'DPH.3', title: 'Push is a no-op when unconfigured (graceful)', sev: S.normal, steps: [
    { action: 'Run with FCM env unset.', expected: 'No push attempts/errors; offers still arrive in-app via Realtime/polling. The app works fully without push.' },
  ]},
  { phase: 'DPH', id: 'DPH.4', title: 'Device token registration + permission decline', sev: S.minor, steps: [
    { action: 'Driver grants notification permission first time online.', expected: 'A device_tokens row is registered (POST /devices).' },
    { action: 'Driver declines permission.', expected: 'No token registered; in-app delivery still works; no repeated nag.' },
  ]},

  // ── DSW · Mode swap & drain ────────────────────────────────────────────
  { phase: 'DSW', id: 'DSW.1', title: 'Each trip freezes its mode at POST (graceful drain)', sev: S.critical, steps: [
    { action: 'Platform=auto; post trip T1 (enters offer loop). Admin flips to manual. Post trip T2.', expected: 'T1 keeps running the AUTO engine to completion; T2 uses the MANUAL applicants flow. The flip never re-routes an in-flight trip.' },
  ]},
  { phase: 'DSW', id: 'DSW.2', title: 'Driver availability UI swaps on flip', sev: S.major, steps: [
    { action: 'Driver online (auto). Admin flips to manual. Driver reloads home.', expected: 'The OnlineToggle is replaced by the vacancy UI. The driver\'s existing presence stops being offered (drains).' },
    { action: 'Flip back to auto; reload.', expected: 'OnlineToggle returns; vacancy UI hidden.' },
  ]},
  { phase: 'DSW', id: 'DSW.3', title: 'Agent trip surfaces swap (applicants vs dispatch status)', sev: S.major, steps: [
    { action: 'Open a manual trip\'s detail vs an auto trip\'s detail.', expected: 'Manual → applicants list + pick. Auto → live DispatchStatusPanel (no applicants list).' },
  ]},
  { phase: 'DSW', id: 'DSW.4', title: 'Launch default is Manual (zero behaviour change at deploy)', sev: S.major, steps: [
    { action: 'Fresh deploy / read app_settings.dispatch_algorithm.', expected: 'Defaults to "manual" — the platform behaves exactly as today until an admin explicitly flips to auto.' },
  ]},

  // ── DSEC · Security / RLS / PII ────────────────────────────────────────
  { phase: 'DSEC', id: 'DSEC.1', title: 'The global token never leaves the server', sev: S.blocker, steps: [
    { action: 'Inspect EVERY presence/offer response (online, offline, heartbeat, presence, offered list) for the string "token".', expected: 'No global token in any payload. Only a derived status + (where shown) a location-relative position.' },
  ]},
  { phase: 'DSEC', id: 'DSEC.2', title: 'driver_presence RLS — a driver can\'t read others\' presence', sev: S.critical, steps: [
    { action: 'As driver A, attempt to read driver B\'s presence row directly (PostgREST / any client).', expected: 'RLS blocks — only owner/admin may SELECT; writes are service-role only. Aggregate "nearby" counts come from the edge fn, never raw rows.' },
  ]},
  { phase: 'DSEC', id: 'DSEC.3', title: 'trip_offers RLS scoping', sev: S.critical, steps: [
    { action: 'As a driver, attempt to read trip_offers rows for a trip you were not offered / not the poster of.', expected: 'Only the offered driver, the trip poster, and admins can SELECT. No cross-driver offer visibility.' },
  ]},
  { phase: 'DSEC', id: 'DSEC.4', title: 'Passenger OTP stays stripped on auto-assigned trips', sev: S.critical, steps: [
    { action: 'After an offer-accept, inspect GET /trips responses.', expected: 'passenger_otp_hash is never present (same redaction as the manual path). OTP only surfaces via the agent\'s designated reveal.' },
  ]},
  { phase: 'DSEC', id: 'DSEC.5', title: 'Algorithm toggle is admin-only end-to-end', sev: S.critical, steps: [
    { action: 'Non-admin sends PUT /admin/app-settings { dispatch_algorithm:"auto" } directly.', expected: '403 (requireAdmin). The platform algorithm cannot be changed by a driver/agent.' },
  ]},

  // ── DED · Edge cases & failure modes ───────────────────────────────────
  { phase: 'DED', id: 'DED.1', title: 'GPS lost mid-session → heartbeat lapse → grace', sev: S.major, steps: [
    { action: 'Go online, then lose GPS / network for > stale timeout.', expected: 'The cron moves the driver to grace (token kept), then expires it if they don\'t return. They are not offered trips while stale.' },
  ]},
  { phase: 'DED', id: 'DED.2', title: 'Rapid online/offline toggling', sev: S.normal, steps: [
    { action: 'Tap Go Online / Go Offline several times quickly.', expected: 'State stays consistent (last action wins); no duplicate presence rows; token is kept across a quick offline→online within grace.' },
  ]},
  { phase: 'DED', id: 'DED.3', title: 'Two drivers go online at the same instant', sev: S.major, steps: [
    { action: 'Fire two POST /drivers/online concurrently.', expected: 'Each gets a distinct token (sequence is race-free); no duplicate/again-used token.' },
  ]},
  { phase: 'DED', id: 'DED.4', title: 'Concurrent advance: poll + cron don\'t double-advance', sev: S.major, steps: [
    { action: 'Force a viewer poll and the cron to advance the same lapsed offer simultaneously.', expected: 'FOR UPDATE SKIP LOCKED ⇒ exactly one advance; the offer moves to one next-driver, not two; no duplicate trip_offers.' },
  ]},
  { phase: 'DED', id: 'DED.5', title: 'Two drivers accept "simultaneously" (stale offer race)', sev: S.critical, steps: [
    { action: 'Driver A is offered; the offer lapses and advances to B; A (stale modal) and B both tap Accept ~together.', expected: 'Exactly one wins (the current_offer_driver_id at the moment of the transaction). The other gets 409. Never two assigned drivers.' },
  ]},
  { phase: 'DED', id: 'DED.6', title: 'No eligible drivers at all on post', sev: S.normal, steps: [
    { action: 'Post an auto trip with zero online drivers anywhere in range.', expected: 'Engine widens then enters waiting/retry, eventually Unfilled — never errors or hangs in "offering" with a null offer.' },
  ]},
  { phase: 'DED', id: 'DED.7', title: 'Driver deactivated while online', sev: S.major, steps: [
    { action: 'Admin deactivates a currently-online driver.', expected: 'They are dropped from the eligible pool (not offered new trips). An in-flight accepted trip is left alone per existing policy.' },
  ]},
  { phase: 'DED', id: 'DED.8', title: 'Cron down / delayed', sev: S.normal, steps: [
    { action: 'Simulate the minute cron not running, with active viewers.', expected: 'On-read advancement still moves offers (viewers poll). Grace expiry is delayed but recovers when the cron resumes; no stuck "offering" forever while viewed.' },
  ]},
  { phase: 'DED', id: 'DED.9', title: 'Clock skew / negative countdown guard', sev: S.minor, steps: [
    { action: 'With a slightly skewed client clock, observe the 60s offer ring and the grace countdown.', expected: 'Never shows negative; clamps to 0; the server deadline (not the client clock) is authoritative for accept/advance.' },
  ]},
  { phase: 'DED', id: 'DED.10', title: 'Going online with no vehicle', sev: S.normal, steps: [
    { action: 'Driver with no active vehicle goes online (vehicle_id null).', expected: 'Allowed at presence level (server accepts null), but define expected behaviour for accepting a trip without a vehicle — the accept/start path should still require a vehicle (verify it is enforced where the trip needs one).' },
  ]},
  { phase: 'DED', id: 'DED.11', title: 'Config blip never strands the driver in Auto UI', sev: S.major, steps: [
    { action: 'Make GET /config fail (500/timeout) on the driver app.', expected: 'useDispatchAlgorithm fails safe to "manual" → the vacancy UI shows. The driver is never stuck in a broken Auto surface.' },
  ]},
];

// ── Qase API helpers ───────────────────────────────────────────────────────
async function qase(method, pathSuffix, body) {
  const res = await fetch(`https://api.qase.io/v1${pathSuffix}`, {
    method,
    headers: { Token: TOKEN, accept: 'application/json', 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await res.text();
  let json;
  try { json = JSON.parse(txt); } catch { json = { raw: txt }; }
  if (!res.ok || json.status === false) throw new Error(`Qase ${method} ${pathSuffix} → ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
  return json.result;
}
async function listAll(kind) {
  const out = [];
  let offset = 0;
  while (true) {
    const r = await qase('GET', `/${kind}/${PROJECT}?limit=100&offset=${offset}`);
    const ents = r?.entities || [];
    out.push(...ents);
    if (ents.length < 100) break;
    offset += 100;
  }
  return out;
}

async function main() {
  if (DRY) {
    const preview = {
      project: PROJECT || '<not set>',
      suites: PHASES.length,
      cases: SCENARIOS.length,
      steps: SCENARIOS.reduce((n, s) => n + s.steps.length, 0),
      plan: PHASES.map((p) => ({ suite: p.title, cases: SCENARIOS.filter((s) => s.phase === p.code).map((s) => `${s.id} · ${s.title}`) })),
    };
    const outPath = path.resolve(__dirname, '..', 'qase-import-dispatch-preview.json');
    fs.writeFileSync(outPath, JSON.stringify(preview, null, 2));
    console.log(`✓ Dry-run preview → ${outPath}`);
    console.log(`  Suites: ${preview.suites} · Cases: ${preview.cases} · Steps: ${preview.steps}`);
    // sanity: every scenario maps to a known suite
    const codes = new Set(PHASES.map((p) => p.code));
    const orphans = SCENARIOS.filter((s) => !codes.has(s.phase));
    if (orphans.length) { console.error(`✗ ${orphans.length} scenario(s) reference an unknown suite code`); process.exit(1); }
    return;
  }

  console.log(`→ Importing into ${PROJECT}: ${PHASES.length} suites, ${SCENARIOS.length} cases.`);
  const existingSuites = await listAll('suite');
  const suiteIdByCode = new Map();
  for (const p of PHASES) {
    const existing = existingSuites.find((s) => s.title === p.title);
    if (existing) { suiteIdByCode.set(p.code, existing.id); console.log(`  ✓ Suite kept: ${p.title}`); }
    else { const created = await qase('POST', `/suite/${PROJECT}`, { title: p.title, description: p.description }); suiteIdByCode.set(p.code, created.id); console.log(`  + Suite created: ${p.title}`); }
  }

  const existingCases = await listAll('case');
  const caseByTitle = new Map(existingCases.map((c) => [c.title, c]));
  for (const s of SCENARIOS) {
    const title = `${s.id} · ${s.title}`;
    const payload = {
      title,
      description: s.preconditions ? `**Preconditions:** ${s.preconditions}` : undefined,
      suite_id: suiteIdByCode.get(s.phase),
      automation: 0,
      priority: s.pri ?? P.high,
      severity: s.sev ?? S.normal,
      type: 1,
      is_flaky: 0,
      steps: s.steps.map((st, i) => ({ action: st.action, expected_result: st.expected, position: i + 1 })),
    };
    const existing = caseByTitle.get(title);
    if (existing) { await qase('PATCH', `/case/${PROJECT}/${existing.id}`, payload); console.log(`  ~ Case updated: ${title}`); }
    else { const created = await qase('POST', `/case/${PROJECT}`, payload); console.log(`  + Case created: ${title} (id=${created.id})`); }
  }
  console.log(`\n✓ Import complete. View at https://app.qase.io/project/${PROJECT}`);
}

main().catch((err) => { console.error(err.message || err); process.exit(1); });
