# Playwright ↔ Qase — how it hooks up

## What's wired

- `playwright-qase-reporter` (devDep) — reads the `qase` annotation on each test and
  POSTs the result to Qase via the v1 API.
- `qase.config.json` — project = `TRIPKINGAP`, mode = `testops`, environment = `dev`.
- `playwright.config.ts` — adds the reporter to the reporter list **only when
  `QASE_TESTOPS_API_TOKEN` is set**. Local runs without the env behave exactly as before.
- Each spec maps to a Qase case by its `automation_id` (the scenario id from the QA
  matrix — `R10.4`, `R6.1`, etc.). When we mirrored the 120 manual cases into Qase via
  `scripts/build-qa-referral.cjs --sync-qase`, we set `automation_id = scenario.id`,
  so the reporter finds the right case with no extra wiring.

## Run locally (no Qase posting)

```bash
npm run test:e2e -- referral-qase-demo
```

3 tests run; you see pass/fail in the terminal; nothing posts to Qase.

## Run with Qase posting

```bash
# token from app.qase.io (Profile → API tokens) — same one in .env.development as QASE_API_TOKEN
QASE_TESTOPS_API_TOKEN=<token> npm run test:e2e -- referral-qase-demo
```

The reporter:
1. Creates a fresh test run in project `TRIPKINGAP` titled "Playwright run — referral demo".
2. For each test, looks at the `qase` annotation (`{ type: 'qase', description: 'R10.4' }`).
3. Finds the Qase case where `automation_id == 'R10.4'` and posts pass/fail + duration +
   any failure logs to it.
4. Closes the run on completion. You can view it at
   `https://app.qase.io/run/TRIPKINGAP`.

The run reuses the existing cases; it doesn't create or update case definitions
(those live in `scripts/qa-referral-cases.json` over in the TripKing-tour repo —
single source of truth).

## How to add a new spec mapped to a Qase case

1. Pick an `automation_id` from the matrix (e.g. `R4.7`).
2. Wrap the test:

```ts
test('R4.7 — first cash-funded trip accrues ₹50', {
  annotation: [{ type: 'qase', description: 'R4.7' }],
}, async ({ page }) => {
  // ...stub, sign in, drive flow, assert...
});
```

3. Run with the env. Result lands on the right case in Qase.

## What's NOT wired

- The reporter does NOT create new cases or modify case bodies. Definitions stay in
  `qa-referral-cases.json` (tour repo). Run the build script there if you need to
  update case text.
- The reporter does NOT auto-tag the run with the git SHA — set `QASE_TESTOPS_RUN_TITLE`
  before the run if you want that, or post-process via the Qase UI.
- Real Razorpay / UPI / cron-bound cases (R7.1, R10.7) are intentionally not in the
  demo. See the tier-split conversation in the README for which 12-ish cases are
  worth automating fully and which stay manual.
