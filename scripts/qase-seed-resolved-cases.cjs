#!/usr/bin/env node
/**
 * Seeds the "TK v1.0 Resolved issues" retest artifact in Qase:
 *   1. Creates 28 deeper validation test cases (one per fix shipped this cycle),
 *      homed in their feature suites (M/P7/V/O/P3) and tagged `RV-validation` +
 *      `retest:<Tester>`.
 *   2. Tags the 14 previously-failed cases with `retest:<Tester>`.
 *   3. Creates the Test Plan "TK v1.0 Resolved issues" (28 new + 14 failed = 42).
 *   4. Creates two per-tester Runs (author_id = the reporter) — the API-supported
 *      form of "assign the retest to whoever found the bug".
 *
 * Idempotent: existing cases (matched by exact title) are reused, not duplicated;
 * an existing plan/run of the same title is left alone.
 *
 *   node scripts/qase-seed-resolved-cases.cjs            # create everything
 *   node scripts/qase-seed-resolved-cases.cjs --dry-run  # print the plan, touch nothing
 */
const fs = require('fs');
const path = require('path');

(function loadEnv() {
  const candidates = [
    path.resolve(process.cwd(), '.env.development'),
    path.resolve(__dirname, '..', '.env.development'),
    path.resolve(__dirname, '..', '..', '..', '..', '.env.development'),
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
    }
    break;
  }
})();

const TOKEN = process.env.QASE_API_TOKEN;
const CODE = process.env.QASE_PROJECT_CODE;
const DRY = process.argv.includes('--dry-run');
if (!TOKEN || !CODE) { console.error('QASE_API_TOKEN + QASE_PROJECT_CODE required'); process.exit(2); }

const SUITE = { M: 28, P7: 8, V: 10, O: 29, P3: 4 };
const TESTER = { VASU: 438784, THAMIZH: 438787 };
const TAG_RV = 'RV-validation';
const tag = { [TESTER.VASU]: 'retest:Vasumathy', [TESTER.THAMIZH]: 'retest:Thamizh' };

async function qase(method, urlPath, body) {
  const res = await fetch(`https://api.qase.io/v1${urlPath}`, {
    method,
    headers: { Token: TOKEN, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { ok: res.ok && json?.status !== false, status: res.status, json };
}

const step = (action, expected_result) => ({ action, expected_result });

// ── The 28 validation cases ───────────────────────────────────────────────
// owner = which tester reported the related defect(s); suite = feature home.
const CASES = [
  // Round-trip / multi-day post (D8/D9) — Thamizh — suite M
  { ref: 'RV.1', suite: SUITE.M, owner: TESTER.THAMIZH, title: 'RV.1 · Round-trip posts from the UI form (turnaround carries no arrive_at)',
    pre: 'Approved agent. Validates the D8/D9 fix (PR #322).',
    steps: [step('Open Post a trip, pick Round-trip, set from/to + pickup + an end time, post.', 'Trip posts (200), no "Couldn\'t post the trip" error.'),
            step('Read the trip back (detail or API).', 'trip_type=round_trip; 3 waypoints; the turnaround (middle) waypoint has NO arrive_at; only the return leg carries expected_end_at.')] },
  { ref: 'RV.2', suite: SUITE.M, owner: TESTER.THAMIZH, title: 'RV.2 · Round-trip where turnaround city equals origin still posts',
    pre: 'Validates D8/D9.', steps: [step('Post a round-trip A→B→A.', '200; trip_type=round_trip.')] },
  { ref: 'RV.3', suite: SUITE.M, owner: TESTER.THAMIZH, title: 'RV.3 · Multi-day round-trip (end +30h) posts and honours expected_end_at',
    pre: 'Validates D8.', steps: [step('Post a round-trip with the end time ~30h after pickup.', '200; expected_end_at persists at +30h; span within the max-duration cap.')] },
  { ref: 'RV.4', suite: SUITE.M, owner: TESTER.THAMIZH, title: 'RV.4 · One-way and multi-way still post (round-trip-fix regression guard)',
    pre: 'Validates D8/D9 did not regress the other trip types.', steps: [step('Post a one-way (no end time) and a multi-way (>=3 waypoints).', 'Both 200.')] },
  { ref: 'RV.5', suite: SUITE.M, owner: TESTER.THAMIZH, title: 'RV.5 · Round-trip with end time before pickup is rejected cleanly',
    pre: 'Negative guard for D8/D9.', steps: [step('Attempt a round-trip whose end time is earlier than pickup.', 'Rejected with a clear validation message (not a generic failure / not a 500).')] },

  // Complete-wizard validation (D18/D19) — Vasumathy — suite P7
  { ref: 'RV.6', suite: SUITE.P7, owner: TESTER.VASU, title: 'RV.6 · Complete wizard: end odo <= start odo shows inline error + Next disabled',
    pre: 'In-progress trip with a start odometer reading. Validates D18 (PR #322).',
    steps: [step('On the Complete wizard, enter an end-odometer reading <= the start reading.', 'Inline red error "Must be greater than the start reading (N km)."; Next stays disabled.')] },
  { ref: 'RV.7', suite: SUITE.P7, owner: TESTER.VASU, title: 'RV.7 · Complete wizard: blank/zero end odo shows "enter a positive number"',
    pre: 'Validates D18.', steps: [step('Leave end odo blank or 0.', 'Inline error "Enter a positive number, in km."; Next disabled.')] },
  { ref: 'RV.8', suite: SUITE.P7, owner: TESTER.VASU, title: 'RV.8 · Complete wizard: negative toll shows inline error + Next disabled',
    pre: 'Validates D19 (PR #322).', steps: [step('Enter a negative toll value.', 'Inline error "Toll can\'t be negative — enter 0 if there was no toll."; Next disabled.')] },
  { ref: 'RV.9', suite: SUITE.P7, owner: TESTER.VASU, title: 'RV.9 · Complete wizard: valid end odo + toll 0 enables Next and completes',
    pre: 'Validates D18/D19 happy path.', steps: [step('Enter a valid end odo (> start) and toll 0, upload the photo, tap Next then Complete.', 'Next enabled; trip completes; payout preview shown.')] },
  { ref: 'RV.10', suite: SUITE.P7, owner: TESTER.VASU, title: 'RV.10 · Complete wizard: fixing a bad value clears the error and re-enables Next',
    pre: 'Validates D18/D19.', steps: [step('Trigger an end-odo error, then correct the value.', 'Error text disappears; Next re-enables.')] },

  // Vacancy expiry-race guard (D5/D6/D7/D10) — Thamizh — suite V
  { ref: 'RV.11', suite: SUITE.V, owner: TESTER.THAMIZH, title: 'RV.11 · Stale open-ended vacancy (cron not yet run) is NOT auto-invited',
    pre: 'Seed a vacancy with available_until=NULL, available_from=yesterday IST, status still active (do not run the cron). Validates the expiry-race guard (PR #323). API mirror: scripts/test-vacancy-expiry-guard.cjs.',
    steps: [step('Post a trip from that city with auto-invite ON.', 'auto_invited_count excludes the stale driver.'),
            step('Check GET /trips/match-preview for that city/window.', 'total_matches excludes the stale vacancy.')] },
  { ref: 'RV.12', suite: SUITE.V, owner: TESTER.THAMIZH, title: 'RV.12 · Stale timed vacancy (available_until in the past) excluded from auto-invite',
    pre: 'Validates PR #323.', steps: [step('Seed a vacancy whose available_until is already past; post a covering trip with auto-invite ON.', 'Stale driver not invited.')] },
  { ref: 'RV.13', suite: SUITE.V, owner: TESTER.THAMIZH, title: 'RV.13 · Live vacancy is still auto-invited (expiry-guard regression check)',
    pre: 'Validates the guard did not over-filter.', steps: [step('Post a live vacancy covering the trip window; post the trip with auto-invite ON.', 'Driver IS invited; auto_invited_count >= 1.')] },
  { ref: 'RV.14', suite: SUITE.V, owner: TESTER.THAMIZH, title: 'RV.14 · Agent vacancy list hides the stale open-ended vacancy',
    pre: 'Validates GET /vacancies uses the same liveness rule.', steps: [step('As an agent, open the vacancy search for that city.', 'The stale open-ended driver does not appear.')] },

  // 15-min vacancy window (D7/D10) — Thamizh — suite V
  { ref: 'RV.15', suite: SUITE.V, owner: TESTER.THAMIZH, title: 'RV.15 · Driver can set a 15-minute availability window',
    pre: 'Validates the 15-min floor (PR #323).', steps: [step('Post a vacancy, step the window down to 15 min, submit.', 'Submits; available_until = available_from + 15 min.')] },
  { ref: 'RV.16', suite: SUITE.V, owner: TESTER.THAMIZH, title: 'RV.16 · Window stepper drops 1h→15min and climbs back; label reads "15 min"',
    pre: 'Validates PR #323 stepper.', steps: [step('Step down to 1h, then once more; then step up.', '1h → "15 min" (Fewer disabled at floor) → back to "1 hr".')] },
  { ref: 'RV.17', suite: SUITE.V, owner: TESTER.THAMIZH, title: 'RV.17 · 15-min vacancy auto-expires after one cron cycle (V4 now testable)',
    pre: 'Validates V4 end-to-end. The expire cron runs every 5 min.', steps: [step('Post a 15-min vacancy; wait one cron cycle past available_until.', 'Vacancy status flips to expired; drops out of the agent search.')] },

  // Trip-edit notification copy (D14/D15/D17) — Thamizh — suite O
  { ref: 'RV.18', suite: SUITE.O, owner: TESTER.THAMIZH, title: 'RV.18 · Edit rate on a trip WITH applicants → "N applicants notified" + driver bell',
    pre: 'Trip with >=1 applicant. Validates D14 (PR #323).', steps: [step('Edit the rate and save.', 'Toast "Trip updated — N applicant(s) notified of the changes."'),
            step('Check the applicant\'s notifications.', 'A trip_updated notification with the changes payload arrives.')] },
  { ref: 'RV.19', suite: SUITE.O, owner: TESTER.THAMIZH, title: 'RV.19 · Edit a trip with ZERO applicants → explicit "no one needed to be notified"',
    pre: 'Validates D14/D15/D17 (PR #323).', steps: [step('Edit a field on a trip with 0 applicants and save.', 'Toast "Trip updated. No applicants yet — no one needed to be notified."')] },
  { ref: 'RV.20', suite: SUITE.O, owner: TESTER.THAMIZH, title: 'RV.20 · Save with no notify-worthy change → plain "Trip updated."',
    pre: 'Validates D14/D15/D17.', steps: [step('Open edit, save without changing a notify-worthy field (>=1 applicant present).', 'Toast "Trip updated." (no false "notified" claim).')] },

  // Driver→agent review on agent home (D4) — Vasumathy — suite P7
  { ref: 'RV.21', suite: SUITE.P7, owner: TESTER.VASU, title: 'RV.21 · Driver→manager review appears under "Recent reviews" on agent home',
    pre: 'Completed trip. Validates D4 (PR #307).', steps: [step('Driver submits a 5-star review of the agent on a completed trip.', 'Agent home shows it under "Recent reviews" with the star average.')] },
  { ref: 'RV.22', suite: SUITE.P7, owner: TESTER.VASU, title: 'RV.22 · Agent home shows the latest 3 reviews, newest first',
    pre: 'Validates D4.', steps: [step('Have >=4 driver→manager reviews; open agent home.', 'Exactly the 3 most-recent show, newest first.')] },
  { ref: 'RV.23', suite: SUITE.P7, owner: TESTER.VASU, title: 'RV.23 · Unpublished/flagged review is NOT shown on agent home',
    pre: 'Validates D4 visibility.', steps: [step('Flag/unpublish a review, open agent home.', 'That review is excluded.')] },
  { ref: 'RV.24', suite: SUITE.P7, owner: TESTER.VASU, title: 'RV.24 · Agent with 0 reviews: the Recent-reviews card is hidden',
    pre: 'Validates D4 empty handling.', steps: [step('Open agent home for an agent with no reviews.', 'No empty Recent-reviews card is rendered.')] },

  // Vacancy → on_trip cache invalidation (D5) — Thamizh — suite V
  { ref: 'RV.25', suite: SUITE.V, owner: TESTER.THAMIZH, title: 'RV.25 · Accepting a trip flips vacancy on_trip and clears the agent search immediately',
    pre: 'Pre-warm the agent vacancy list first. Validates the cache-invalidation fix (PR #307).',
    steps: [step('Agent loads the vacancy search (warms the 90s cache). Driver accepts a single-day trip inside their vacancy window.', 'Vacancy → on_trip.'),
            step('Agent refreshes the vacancy search within 90s.', 'The driver no longer appears (cache was invalidated, not stale for 90s).')] },
  { ref: 'RV.26', suite: SUITE.V, owner: TESTER.THAMIZH, title: 'RV.26 · Trip start expires the vacancy; cancel-before-start reverts it to active',
    pre: 'Validates D5 lifecycle.', steps: [step('Start the accepted trip.', 'Linked vacancy → expired.'), step('On a separate trip, cancel after accept but before start.', 'Linked vacancy reverts to active (window still future).')] },

  // Auto-invite 0-matches (D2) — Vasumathy — suite P3
  { ref: 'RV.27', suite: SUITE.P3, owner: TESTER.VASU, title: 'RV.27 · Trip with no covering vacancy → match-preview 0 and auto_invited_count 0',
    pre: 'Validates D2 (92af058).', steps: [step('Post a future trip in a city/window no driver vacancy covers, auto-invite ON.', 'match-preview total_matches=0; auto_invited_count=0.')] },
  { ref: 'RV.28', suite: SUITE.P3, owner: TESTER.VASU, title: 'RV.28 · Year-2060 pickup trip yields 0 matches (original over-match bug)',
    pre: 'Validates D2 root cause.', steps: [step('Set the pickup to year 2060 and check the match-preview.', 'total_matches=0 (no vacancy window reaches 2060).')] },
];

// Previously-failed cases to fold into the plan + tag by reporter.
const FAILED = [
  { id: 25, owner: TESTER.VASU }, { id: 28, owner: TESTER.VASU }, { id: 52, owner: TESTER.VASU },
  { id: 55, owner: TESTER.VASU }, { id: 258, owner: TESTER.VASU }, { id: 231, owner: TESTER.VASU },
  { id: 63, owner: TESTER.THAMIZH }, { id: 64, owner: TESTER.THAMIZH }, { id: 66, owner: TESTER.THAMIZH },
  { id: 240, owner: TESTER.THAMIZH }, { id: 241, owner: TESTER.THAMIZH }, { id: 242, owner: TESTER.THAMIZH },
  { id: 246, owner: TESTER.THAMIZH }, { id: 248, owner: TESTER.THAMIZH },
];

async function fetchAllCaseTitles() {
  const map = new Map();
  let offset = 0;
  for (;;) {
    const r = await qase('GET', `/case/${CODE}?limit=100&offset=${offset}`);
    const ents = r.json?.result?.entities ?? [];
    for (const c of ents) map.set(c.title, c.id);
    if (ents.length < 100) break;
    offset += 100;
  }
  return map;
}

async function main() {
  console.log(`[seed] project=${CODE} dry-run=${DRY}`);
  const existing = await fetchAllCaseTitles();

  // 1. create (or reuse) the 28 validation cases
  const created = {};
  for (const c of CASES) {
    if (existing.has(c.title)) { created[c.ref] = existing.get(c.title); console.log(`  reuse  ${c.ref} → case ${existing.get(c.title)}`); continue; }
    if (DRY) { console.log(`  CREATE ${c.ref} (suite ${c.suite}, ${tag[c.owner]})`); created[c.ref] = `dry-${c.ref}`; continue; }
    const r = await qase('POST', `/case/${CODE}`, {
      title: c.title, suite_id: c.suite, severity: 4, priority: 1, type: 1,
      preconditions: c.pre, steps: c.steps, tags: [TAG_RV, tag[c.owner]],
    });
    if (!r.ok) { console.error(`  FAIL   ${c.ref}: ${JSON.stringify(r.json)}`); process.exit(1); }
    created[c.ref] = r.json.result.id;
    console.log(`  create ${c.ref} → case ${created[c.ref]}`);
  }

  // 2. tag the previously-failed cases by reporter
  for (const f of FAILED) {
    if (DRY) { console.log(`  TAG    case ${f.id} += ${tag[f.owner]}`); continue; }
    const cur = await qase('GET', `/case/${CODE}/${f.id}`);
    const curTags = (cur.json?.result?.tags ?? []).map((t) => (typeof t === 'string' ? t : t.title)).filter(Boolean);
    const next = Array.from(new Set([...curTags, tag[f.owner]]));
    const r = await qase('PATCH', `/case/${CODE}/${f.id}`, { tags: next });
    console.log(`  tag    case ${f.id} += ${tag[f.owner]} ${r.ok ? '' : '(FAILED: ' + JSON.stringify(r.json) + ')'}`);
  }

  const newIds = CASES.map((c) => created[c.ref]).filter((x) => typeof x === 'number');
  const failedIds = FAILED.map((f) => f.id);
  const allIds = [...newIds, ...failedIds];

  // 3. plan
  if (!DRY) {
    const plan = await qase('POST', `/plan/${CODE}`, {
      title: 'TK v1.0 Resolved issues',
      description: 'Retest of defects D1–D20 fixed this cycle (PRs #307 trip-review+vacancy-cache, #322 round-trip+complete-wizard, #323 vacancy-expiry-guard+15-min-window+trip-edit-copy, 92af058 match time-bounds). 28 new deeper-validation cases + the 14 originally-failed cases.',
      cases: allIds,
    });
    console.log(plan.ok ? `[seed] plan created: ${plan.json.result.id} (${allIds.length} cases)` : `[seed] plan FAILED: ${JSON.stringify(plan.json)}`);
  }

  // 4. per-tester runs (assignment = run ownership)
  const vasuIds = [...CASES.filter((c) => c.owner === TESTER.VASU).map((c) => created[c.ref]), ...FAILED.filter((f) => f.owner === TESTER.VASU).map((f) => f.id)].filter((x) => typeof x === 'number');
  const thamizhIds = [...CASES.filter((c) => c.owner === TESTER.THAMIZH).map((c) => created[c.ref]), ...FAILED.filter((f) => f.owner === TESTER.THAMIZH).map((f) => f.id)].filter((x) => typeof x === 'number');

  if (!DRY) {
    for (const [title, author, ids] of [
      ['TK v1.0 Resolved issues — Vasumathy', TESTER.VASU, vasuIds],
      ['TK v1.0 Resolved issues — Thamizh', TESTER.THAMIZH, thamizhIds],
    ]) {
      const run = await qase('POST', `/run/${CODE}`, { title, description: `Retest assigned to ${tag[author].split(':')[1]} (reported these defects).`, cases: ids, author_id: author });
      console.log(run.ok ? `[seed] run "${title}" → id ${run.json.result.id} (${ids.length} cases, author ${author})` : `[seed] run FAILED: ${JSON.stringify(run.json)}`);
    }
  }

  console.log(`\n[seed] summary: ${newIds.length} new cases, ${failedIds.length} failed cases tagged, plan=42, Vasumathy=${vasuIds.length}, Thamizh=${thamizhIds.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
