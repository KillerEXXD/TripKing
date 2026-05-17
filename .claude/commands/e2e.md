---
description: Run Playwright E2E on demand. Usage — `/e2e full` (all 34 specs, ~5 min) or `/e2e smoke` (6 happy-path tests, ~90s).
---

Run the TripKing Playwright E2E suite on demand. The argument selects scope:

- **`/e2e full`** — every spec in `/e2e` (34 tests across 10 files, mobile project). ~3–5 min wall clock. Use before merging a risky branch or when investigating a regression.
- **`/e2e smoke`** — only the linear happy path through the J* journey suite (J1, J3, J5, J6, J7, J13 — sign-in → apply → accept → start → complete → cancel). ~60–90s. Use for a fast sanity check.

If no argument is passed, default to **smoke** and tell the user so.

## Step 1 — Run

The E2E suite hits the deployed Supabase functions (real API per [docs/TEST_POLICY.md](docs/TEST_POLICY.md)), so no dev server is needed — but `playwright.config.ts` still spins one up to satisfy navigation specs. The runs are independent (each spec mints fresh e2e-* users), so the suite parallelises safely.

**Full:**
```bash
npx playwright test --project=mobile --reporter=list
```

**Smoke:**
```bash
npx playwright test --project=mobile --reporter=list \
  --grep "J1 ·|J3 —|J5 —|J6 —|J7 —|J13 —"
```

(The grep matches the Qase-prefixed titles in [e2e/journeys-critical.spec.ts](e2e/journeys-critical.spec.ts). If a J* title gets renamed and the grep stops matching, fall back to running the full file: `--grep "J(1|3|5|6|7|13)"`.)

If the run takes more than 6 minutes, abort and re-run with `--workers=4` to parallelise more aggressively.

## Step 2 — Report

```
## TripKing E2E — [date] · scope=[full|smoke]

| Result | Count |
|--------|-------|
| ✅ Passed | X |
| ❌ Failed | X |
| ⏭️  Skipped | X |
| ⏱️  Duration | Xm Xs |

### Failures (if any)
For each failure: test title · file:line · error message (1–2 lines) · likely cause + suggested fix.

### Skipped tests
List skipped J* tests with the reason from the test.skip() call so the user remembers why (e.g. J9/J10 = needs 20-trip promo-exhaust loop).
```

If everything's green: "All E2E green — Xm Xs."

## Step 3 — On failure

For each failed test:
1. Look at the assertion + the error stack from the Playwright output.
2. Check if it's a real regression (a recent commit broke a flow) vs a known flake (Supabase auth rate limit on the mint sequence — J2 has this issue).
3. If it's a flake, suggest: "Re-run just this spec: `npx playwright test --grep '<title>' --retries=2`".
4. If it's a real regression, identify the recent commit (`git log --oneline -10 origin/main -- src/`) most likely responsible and suggest the fix.

Don't auto-create Qase Defects from these local runs — that's the GitHub Actions path's job (via `playwright-qase-reporter` with `QASE_TESTOPS_API_TOKEN`). Local runs are for the developer's feedback loop.

## Notes

- The scheduled cloud runs (02:30 UTC + 14:30 UTC via `e2e-qase.yml`) post results to Qase TRIPKINGAP and auto-create Defects on failure. This skill is the on-demand equivalent — fastest feedback, no Qase posting.
- The smoke set deliberately skips: J2 (auto-invite, flakey on rate limit), J4 (handshake phase 2 — covered by J5), J8 (insufficient-wallet, slow setup), J9/J10 (20-trip accrual loop), J11/J12 (fresh-driver guards), J14/J15 (edge cases). Reach for `/e2e full` when those matter.
