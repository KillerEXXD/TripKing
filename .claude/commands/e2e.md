---
description: Trigger the cloud Playwright E2E run (GitHub Actions → Qase). Usage — `/e2e full` (all 34 specs, ~5 min) or `/e2e smoke` (6 happy-path tests, ~90s). Default: full.
---

Dispatch the `e2e-qase.yml` GitHub Actions workflow on `KillerEXXD/TripKing` with the requested scope, then watch it to completion and report the result. **All runs are cloud-side** — results post to Qase TRIPKINGAP and any failure auto-creates a Qase Defect that mirrors into `/administration/bugs` within ~5 min. Never run Playwright locally from this skill.

Argument:
- **`/e2e full`** (default) — runs all 34 specs across 10 files, mobile project. ~3–5 min.
- **`/e2e smoke`** — runs only J1/J3/J5/J6/J7/J13 (linear happy path). ~60–90s.

If no argument is passed, default to **full** and tell the user.

## Step 1 — Dispatch the workflow

Use the github MCP (`mcp__github__list_workflow_runs` + the run-workflow endpoint). The repo is `KillerEXXD/TripKing`, workflow file is `e2e-qase.yml`, ref is `main`. Inputs:
- `scope`: `full` or `smoke` (from the argument)
- `project`: `mobile` (default)
- `post_to_qase`: `true`

If the github MCP exposes a `run_workflow` / `workflow_dispatch` tool, use it. Otherwise fall back to telling the user to click "Run workflow" in the Actions UI with the scope they wanted, and skip to Step 3 once they confirm it ran.

Capture the new run's `id` and `html_url` immediately after dispatch (the new run shows up in `list_workflow_runs` within ~5s of triggering).

## Step 2 — Watch to completion

Poll `mcp__github__list_workflow_runs` (or the specific run's status) every 30–45s until `status` is `completed`. Show the user a one-line tick on each poll so they know it's still running:

```
[14:32:10] queued → in_progress
[14:32:55] in_progress (90s elapsed)
[14:33:40] in_progress (135s elapsed)
[14:34:25] completed → success
```

Don't poll faster than every 30s — GH Actions API rate-limits aggressive polling. If the run exceeds **8 minutes** (full) or **3 minutes** (smoke), keep waiting but flag it as "slower than expected — possible flake".

## Step 3 — Report

Once `completed`, pull the run's test summary. The job's annotations (`mcp__github__list_workflow_run_artifacts` + the playwright-report artifact, or the run logs) carry the per-test pass/fail counts.

```
## TripKing E2E (cloud) — [date] · scope=[full|smoke]

| Result | Count |
|--------|-------|
| Conclusion | success / failure |
| ✅ Passed | X |
| ❌ Failed | X |
| ⏭️  Skipped | X |
| ⏱️  Duration | Xm Xs |

🎯 Qase run: https://app.qase.io/run/TRIPKINGAP
🔗 GH run: <html_url>

### Failures (if any)
- <test title> · <file>:<line>
  Error: <1-line message>
  Likely cause: <best guess from the assertion + recent commits>

### Auto-created Qase Defects
- For each failure, a Qase Defect is created within ~5 min and the bug-pipeline mirrors it into /administration/bugs (or the cron-qase-poll fallback if the webhook didn't fire). Tell the user to check `/administration/bugs` for a fresh row tagged `qase-defect`.
```

If everything's green: "All E2E green — Xm Xs. Results posted to Qase."

## Step 4 — On failure

For each failing test:
1. Pull the run's failure annotation (test title + assertion line).
2. Cross-reference recent commits (`mcp__github__list_commits` on `main`, last 10) for a likely cause — a flow-touching change in the same area.
3. Suggest the next step: "Re-run just this spec via `/e2e smoke`" or "this looks like a real regression in <commit hash> — read the diff first".

Never re-dispatch automatically on failure — let the user decide.

## Notes

- The scheduled runs (02:30 UTC + 14:30 UTC) call this same workflow with no `scope` input → defaults to the full suite. Cloud-side every time, results in Qase every time.
- The `QASE_TESTOPS_API_TOKEN` repo secret is what makes the Qase posting work; if it's missing, the workflow still runs but results don't reach Qase. Surface that as WARNING in the report if observed.
- There is no "local-only" path — this skill is exclusively cloud. The old `npx playwright test` muscle memory still works on the developer's box but is intentionally not what `/e2e` invokes.
