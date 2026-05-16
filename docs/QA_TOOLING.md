# QA tooling — Qase

We track manual test cycles in [Qase](https://app.qase.io/project/TRIPKINGAP) (project code `TRIPKINGAP`). The interactive HTML doc at https://trip-king-tour.vercel.app/docs/manual-qa-invite-flow.html remains the human-readable reference; **Qase is the system of record** for who tested what when.

## Layout

- 9 **suites** — one per phase (P0 Onboarding → P8 Notifications).
- 58 **test cases** — one per scenario (P0.1, P0.2, …, P8.3). Each carries the step-by-step Action / Expected from the HTML doc.
- 102 **steps** total.

## Tester workflow

1. Sign in at https://app.qase.io.
2. Pick the **TripKingApp** project.
3. **Test Runs → Create test run**. Name it `Cycle YYYY-MM-DD — <tester initials>`. Pick the suites you'll run this cycle (most cycles include all 9).
4. Walk the cases. For each step: tick **Pass**, **Fail**, or **Blocked**. Failed steps prompt for a defect.
5. When you hit a bug — **Report defect** from inside the failing step. Qase sends it to TripKing's internal bug tracker (see "Bug routing" below).
6. When done, click **Complete** on the run. Qase records duration, pass rate, defect count.

## Bug routing (Qase → TripKing internal `bug_reports`)

TripKing has its own `bug_reports` table + `/administration/bugs` triage queue (migration `027_bug_reports.sql`). We do NOT route bugs to GitHub Issues — they go to the internal tracker so engineers see them in the same queue as bugs filed via the in-app FAB.

A Qase webhook fires when a defect is created → a new `qase-webhook` edge function maps the payload → calls `POST /bug-reports` with the test-run + scenario context → engineers triage from `/administration/bugs`. (See PR `feat/qase-webhook` once it's merged.)

## Updating cases when the doc changes

The HTML doc and the Qase cases share the same source — `scripts/qase-import.cjs` carries the embedded scenario data. To sync:

1. Edit the HTML doc in `TripKing-tour` AND the matching data in `scripts/qase-import.cjs` (paired changes).
2. Run `node scripts/qase-import.cjs --dry-run` and inspect `qase-import-preview.json`.
3. Run `node scripts/qase-import.cjs` to PATCH existing cases (idempotent by title within suite).

Test-run history is preserved across re-imports.

## Env

`.env.development` (gitignored):

```
QASE_API_TOKEN=...        # Profile → API tokens in Qase
QASE_PROJECT_CODE=TRIPKINGAP
```

Rotate the token any time it appears outside `.env.development` (e.g. pasted in chat). Settings → API tokens → Revoke + Create new.

## Playwright integration (planned)

When we wire up the official `playwright-qase-reporter`, automated E2E runs will populate test results in Qase alongside manual cycles — one dashboard for both. Tracked in a follow-up PR.
