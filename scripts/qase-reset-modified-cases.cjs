#!/usr/bin/env node
/**
 * For every Qase test run that's still open (status=active) and contains a result
 * for one of the cases this feature touched, mark that result status='untested'
 * and append a comment noting why. Idempotent — re-running on already-untested
 * results is a no-op (Qase will just rewrite the same status with the same
 * comment appended to its history).
 *
 * Modified cases: P6.1 (Start trip with odometer + OTP), P7.1 (Complete trip
 * happy path — now wizard-driven), P7.2 (Complete-without-start blocked).
 *
 * Usage:
 *   QASE_API_TOKEN=… QASE_PROJECT_CODE=TRIPKINGAP node scripts/qase-reset-modified-cases.cjs
 *   --dry-run prints what would change without writing.
 */
const TOKEN = process.env.QASE_API_TOKEN;
const PROJECT = process.env.QASE_PROJECT_CODE;
const DRY = process.argv.includes('--dry-run');

if (!TOKEN || !PROJECT) {
  console.error('QASE_API_TOKEN + QASE_PROJECT_CODE required.');
  process.exit(1);
}

const MODIFIED_TITLES = [
  'P6.1 · Start trip with odometer photo + reading + OTP',
  'P7.1 · Complete trip via the 2-step wizard (happy path, no overage, no toll)',
  'P7.2 · Complete without start (blocked)',
];
const COMMENT = 'Reset to Untested — case was updated for the trip-completion feature (PRs #288/#289/#293/#296/#297/#298). Please re-run before re-marking passed.';

async function qase(method, path, body) {
  const url = `https://api.qase.io/v1${path}`;
  const res = await fetch(url, {
    method,
    headers: { Token: TOKEN, accept: 'application/json', 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await res.text();
  let json;
  try { json = JSON.parse(txt); } catch { json = { raw: txt }; }
  if (!res.ok || json.status === false) {
    throw new Error(`Qase ${method} ${path} → ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
  }
  return json.result;
}

async function listAll(path) {
  const out = [];
  let offset = 0;
  while (true) {
    const r = await qase('GET', `${path}${path.includes('?') ? '&' : '?'}limit=100&offset=${offset}`);
    const ents = r?.entities || [];
    out.push(...ents);
    if (ents.length < 100 || ents.length === 0) break;
    offset += 100;
  }
  return out;
}

(async () => {
  console.log(`→ Resetting Qase results for ${MODIFIED_TITLES.length} modified cases in ${PROJECT}${DRY ? ' (dry-run)' : ''}`);

  // 1. Resolve case ids by title.
  const cases = await listAll(`/case/${PROJECT}`);
  const targets = cases.filter((c) => MODIFIED_TITLES.includes(c.title));
  if (targets.length === 0) {
    console.error('No cases matched — title strings may be stale.');
    process.exit(1);
  }
  for (const c of targets) console.log(`  · case "${c.title}" → id ${c.id}`);
  const caseIds = new Set(targets.map((c) => c.id));

  // 2. List active test runs.
  const runs = await listAll(`/run/${PROJECT}`);
  const active = runs.filter((r) => !r.is_completed);
  console.log(`  ${active.length} active run(s) of ${runs.length} total`);

  let touched = 0;
  for (const run of active) {
    // 3. Pull results for this run. Qase API: GET /result/<code>?run=<id>
    const results = await listAll(`/result/${PROJECT}?run=${run.id}`);
    for (const r of results) {
      const cid = r.case_id ?? r.case?.id;
      if (!caseIds.has(cid)) continue;
      // Only touch results that aren't already untested.
      if (r.status === 'untested' || r.status === 'in_progress' || r.status === 'blocked') continue;
      console.log(`  ${DRY ? '[dry]' : '→'} run #${run.id} (${run.title}) · case ${cid} · was=${r.status} → untested`);
      if (!DRY) {
        await qase('PATCH', `/result/${PROJECT}/${run.id}/${r.hash}`, {
          status: 'untested',
          comment: COMMENT,
        });
      }
      touched++;
    }
  }
  console.log(`\n✓ ${touched} result(s) ${DRY ? 'would be ' : ''}reset.`);
})().catch((err) => { console.error(err.message || err); process.exit(1); });
