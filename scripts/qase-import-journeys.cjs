#!/usr/bin/env node
/**
 * Qase importer for the J1–J15 critical-journey E2E suite.
 *
 * Sister to scripts/qase-import.cjs (which handles the manual R/P/V cases).
 * This one defines the 15 automated journeys in e2e/journeys-critical.spec.ts
 * as Qase cases under a single "Critical Journeys (E2E)" suite, and tags each
 * with automation_id = "J1".."J15" so playwright-qase-reporter can bind
 * test results to them via the `qase('J1')` annotation on each spec.
 *
 * Idempotent: re-running upserts by title within the suite (same pattern as
 * the manual importer). Safe to run after every J* spec edit.
 *
 * Usage:
 *   node scripts/qase-import-journeys.cjs --dry-run
 *   node scripts/qase-import-journeys.cjs
 *
 * Env (read from .env.development):
 *   QASE_API_TOKEN     — required
 *   QASE_PROJECT_CODE  — required (e.g. TRIPKINGAP)
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
  if (!TOKEN) { console.error('QASE_API_TOKEN not set. Use --dry-run for a preview without API calls.'); process.exit(1); }
  if (!PROJECT) { console.error('QASE_PROJECT_CODE not set (e.g. TRIPKINGAP).'); process.exit(1); }
}

const SUITE = {
  title: 'J · Critical Journeys (E2E)',
  description: 'The 15 most-critical end-to-end journeys for the trip marketplace. Automated in e2e/journeys-critical.spec.ts (Playwright, real-API setup via helpers-api.ts). Each case binds to its spec via automation_id = J1..J15 + the qase("J1") annotation. Skipped tests (J2/J8/J9/J10) are tracked here for visibility — implementations are noted on each case.',
};

// title is what appears in Qase. automation_id is the binding key for the reporter.
// description (per-case) summarises what the spec asserts so non-coders can review the catalogue.
const CASES = [
  { automation_id: 'J1', title: 'J1 · Auth — phone → OTP → home', priority: 3, severity: 1,
    description: 'Smoke pointer to e2e/sign-in-otp.spec.ts (the full journey assertion lives there). Drift detector: this fails the moment the sign-in spec is deleted.' },
  { automation_id: 'J2', title: 'J2 · Agent posts trip with auto-invite ON; matching drivers receive invitations', priority: 3, severity: 1,
    description: 'Mints agent + candidate driver (with active vacancy in pickup city), posts trip with autoInviteMatches:true, asserts trip_invitations row created for candidate. SKIPPED today — flakey on Supabase auth rate limit during rapid mint sequence. Covered by scripts/test-auto-invite.cjs.' },
  { automation_id: 'J3', title: 'J3 · Driver applies organically; trip → has_applicants', priority: 3, severity: 1,
    description: 'Driver POST /trips/:id/applicants, asserts trip.status="has_applicants" and an acceptanceId comes back.' },
  { automation_id: 'J4', title: 'J4 · Agent selects driver — handshake phase 2 → status=selected, no OTP yet', priority: 3, severity: 1,
    description: 'Agent POST /trips/:id/assign with the acceptance, asserts trip.status="selected" and passenger_otp is still null (OTP is only generated when the driver accepts).' },
  { automation_id: 'J5', title: 'J5 · Driver accepts selection — handshake phase 3 → status=accepted + passenger OTP generated', priority: 3, severity: 1,
    description: 'Driver POST /trips/:id/accept, asserts status="accepted", passenger_otp matches /^\\d{4,6}$/, and the poster sees the plaintext OTP per the redaction rule.' },
  { automation_id: 'J6', title: 'J6 · Driver starts trip with correct passenger OTP → status=in_progress', priority: 3, severity: 1,
    description: 'Driver POST /trips/:id/start with the OTP, asserts trip.status="in_progress".' },
  { automation_id: 'J7', title: 'J7 · Driver completes trip — dual-side platform fees charged (₹50 driver + ₹50 agent)', priority: 3, severity: 1,
    description: 'Driver POST /trips/:id/complete, asserts 200 and trip.status="completed". Fees come off the promo balance first (both sides have ₹1000 launch credit) per §11 default priority. Side effect of "no error raised" is the contract assertion.' },
  { automation_id: 'J8', title: 'J8 · Insufficient wallet blocks completion → 402 INSUFFICIENT_WALLET_BALANCE_DRIVER', priority: 3, severity: 1,
    description: 'Drains the driver wallet via POST /admin/wallet/set-balance (all sub-balances → 0), runs through accept+start, attempts complete, asserts 402 with code INSUFFICIENT_WALLET_BALANCE_DRIVER, AND asserts atomicity (trip stays in_progress, not flipped). SKIPPED in some runs pending consistent admin-token availability. Conceptually covered by scripts/test-platform-fee.cjs.' },
  { automation_id: 'J9', title: 'J9 · Cash-funded completion accrues ₹50 pending referral to referrer', priority: 3, severity: 2,
    description: 'Requires: referrer signs up, referee uses referrer code, referee runs 20 promo-funded trips to exhaust launch credit, then a 21st cash-funded trip generates the first ₹50 pending accrual. SKIPPED — ~30s of API calls, larger than the per-PR gate budget. Covered by scripts/test-referral-accrual.cjs.' },
  { automation_id: 'J10', title: 'J10 · Promo-funded completion accrues ₹0 to referrer (anti-abuse §7.3)', priority: 3, severity: 2,
    description: 'Same setup as J9; asserts that promo-funded fees do NOT accrue to the referrer. SKIPPED — same reason as J9. Covered by scripts/test-referral-accrual.cjs.' },
  { automation_id: 'J11', title: 'J11 · Fresh-driver transfer-to-wallet blocked at one of the guard layers', priority: 3, severity: 2,
    description: 'Driver with no referral activity POSTs /referrals/me/transfer-to-wallet. Asserts response in [402, 403, 404, 422] — exact code depends on which guard fires first (NO_REFERRALS / NEW_USER_DELAY / INSUFFICIENT_BALANCE / VALIDATION).' },
  { automation_id: 'J12', title: 'J12 · Fresh-driver UPI withdrawal blocked at one of the guard layers', priority: 3, severity: 2,
    description: 'Driver with no released earnings POSTs /referrals/me/withdraw. Asserts response in [402, 403, 404, 422]. Happy-path withdrawal needs the 20-trip accrual loop and is covered by scripts/test-referral-accrual.cjs.' },
  { automation_id: 'J13', title: 'J13 · Agent cancels trip — status → cancelled, applicants notified', priority: 3, severity: 1,
    description: 'Driver applies, agent POST /trips/:id/cancel, asserts trip.status="cancelled".' },
  { automation_id: 'J14', title: 'J14 · Driver-posted trip with auto-invite ON excludes the poster from their own invite list', priority: 3, severity: 1,
    description: 'Driver-poster has an active vacancy themselves (so they\'d qualify for auto-invite if exclusion were broken). They post a trip with autoInviteMatches:true; the invites GET excludes their own user_id. Regression check for the "don\'t invite yourself" rule.' },
  { automation_id: 'J15', title: 'J15 · Reject an applicant — trip stays has_applicants if others remain, else open', priority: 3, severity: 1,
    description: 'Two drivers apply, agent rejects A. Asserts the reject call returns 200 and (because B still applied) trip.status stays has_applicants. The "else open" branch is implicit in the contract; the multi-applicant arm is the regression-prone one.' },
];

async function qase(method, pathSuffix, body) {
  const res = await fetch(`https://api.qase.io/v1${pathSuffix}`, {
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
    const outPath = path.resolve(__dirname, '..', 'qase-import-journeys-preview.json');
    fs.writeFileSync(outPath, JSON.stringify({ project: PROJECT || '<not set>', suite: SUITE.title, cases: CASES.map((c) => ({ automation_id: c.automation_id, title: c.title })) }, null, 2));
    console.log(`✓ Dry-run preview written to ${outPath}`);
    console.log(`  Suite: ${SUITE.title} · Cases: ${CASES.length}`);
    return;
  }

  console.log(`→ Importing into project ${PROJECT}: 1 suite, ${CASES.length} cases.`);

  // Suite — idempotent by title.
  const existingSuites = await listAll('suite');
  let suite = existingSuites.find((s) => s.title === SUITE.title);
  if (suite) {
    console.log(`  ✓ Suite kept: ${SUITE.title} (id=${suite.id})`);
  } else {
    suite = await qase('POST', `/suite/${PROJECT}`, { title: SUITE.title, description: SUITE.description });
    console.log(`  + Suite created: ${SUITE.title} (id=${suite.id})`);
  }

  // Cases — idempotent by title within the project. Set automation_id so the reporter binds.
  const existingCases = await listAll('case');
  const caseByTitle = new Map(existingCases.map((c) => [c.title, c]));

  for (const c of CASES) {
    const payload = {
      title: c.title,
      description: c.description,
      suite_id: suite.id,
      automation: 2,                 // 0=manual, 1=to-be-automated, 2=automated
      priority: c.priority || 3,     // Qase: 1=low, 2=medium, 3=high
      severity: c.severity || 1,     // 1=blocker, 2=critical, 3=major, 4=normal
      type: 1,                       // 1=functional
      is_flaky: 0,
      automation_id: c.automation_id,
    };
    const existing = caseByTitle.get(c.title);
    if (existing) {
      await qase('PATCH', `/case/${PROJECT}/${existing.id}`, payload);
      console.log(`  ~ Case updated: ${c.title} (id=${existing.id}, automation_id=${c.automation_id})`);
    } else {
      const created = await qase('POST', `/case/${PROJECT}`, payload);
      console.log(`  + Case created: ${c.title} (id=${created.id}, automation_id=${c.automation_id})`);
    }
  }

  console.log(`\n✓ Import complete. View at https://app.qase.io/project/${PROJECT}`);
  console.log(`  Next run of e2e-qase.yml will bind J* results via automation_id.`);
}

main().catch((err) => { console.error(err.message || err); process.exit(1); });
