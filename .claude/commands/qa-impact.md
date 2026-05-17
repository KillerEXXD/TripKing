---
description: Process the QA-impact queue — for every PR queued by the PostToolUse hook, audit the diff, then add or update matching Qase manual cases via scripts/qase-import.cjs.
---

Process the queue of PR create/merge events captured by the PostToolUse hook (`.claude/hooks/scripts/qa-impact-enqueue.js`). For each unprocessed entry, decide whether the PR changes user-visible behaviour, and if so add or update the matching Qase cases.

## Step 1 — Load the queue

Read `.claude/qa-impact-queue.jsonl`. Each line is JSON:
```json
{ "pr": 263, "action": "merge", "url": "...", "queuedAt": "2026-05-18T03:14:00.000Z", "processed": false }
```

If the file doesn't exist or all entries have `processed: true` → say "QA-impact queue is empty — nothing to process." and stop.

Otherwise, take the unprocessed entries, group by PR number, and process the most-significant action per PR (merge > create — if both are queued for the same PR, the merge diff is canonical).

## Step 2 — For each PR, audit the diff

Use `mcp__github__get_pull_request` (owner `KillerEXXD`, repo `TripKing` by default; check the URL for other repos) to pull the PR title + body + base/head SHAs. Then `mcp__github__get_pull_request_files` for the file list + per-file patch.

Categorise the change. **Skip Qase work** (mark `processed: true` with `reason: "no QA impact"`) for any PR whose ONLY touched files match:
- `**/*.md` / `docs/**` (documentation)
- `.claude/**` / `.github/**` (skills, CI, hooks)
- `scripts/**` (operator tooling) — UNLESS `scripts/qase-import*.cjs` itself
- `**/__tests__/**` / `e2e/**` (tests only — no behaviour change)
- `*.css` / `tailwind.config.*` purely visual tokens
- DB migrations (`supabase/migrations/`) that ONLY add tables/indexes with no user-visible consumer in the same PR

**Do Qase work** for PRs that touch:
- `src/pages/**` or `src/components/**` (user-visible UI)
- `src/hooks/**` (data flow visible to user)
- `supabase/functions/**` excluding `_shared/timing.ts` etc. (behaviour change)
- A new route in `src/AppRoutes.tsx`
- A new env var that the user must configure

## Step 3 — Map to Qase cases

Open `scripts/qase-import.cjs`. The PHASES array defines the suites — pick the right one:

| Suite | When the PR fits here |
|---|---|
| `P0`–`P8` (Phases) | Changes touching the trip lifecycle phases (onboarding/KYC, posting, discovery, invite, selection, passenger, in-progress, completion, notifications) |
| `V` (Vacancy lifecycle) | Vacancy state transitions, expiry crons, overlap rules |
| `R` (Referral program) | Referral ledger, accruals, withdrawals, fraud rules |
| `N` (Navigation & Breadcrumbs) | Back-button paths, page header tone continuity, deep-linking |

If the PR fits an existing case: UPDATE the case (refine steps/expected to match the shipped behaviour, append the PR number to its preconditions or step). If it's a new scenario: ADD a new case in the right phase, using the next available id (e.g. `N13` if N12 is the highest).

Follow the existing scenario shape exactly:
```js
{ phase: 'N', id: 'N13', title: '<scenario title>', preconditions: '<optional context>', steps: [
  { action: '<numbered step the QA tester performs>', expected: '<what they should see>' },
  ...
]}
```

## Step 4 — Push to Qase

After editing `scripts/qase-import.cjs`, run live:
```bash
node scripts/qase-import.cjs
```

The importer is idempotent (PATCHes by title within suite). Confirm the output shows `+ Case created:` or `~ Case updated:` for the cases you touched.

## Step 5 — Mark the queue entries processed

For each PR you just handled, rewrite the queue file with `processed: true` + `processedAt` + `qaseCases: [<ids or titles>]` on the entries. Keep the history in the file so a future `/qa-impact` doesn't re-process; the reminder hook only counts entries with `processed: false`.

## Step 6 — Commit + report

If `scripts/qase-import.cjs` changed:
1. Commit on a fresh branch `chore/qase-pr-<N>-cases` off `origin/main`, push, create + merge a PR via the github MCP. Use a body that lists the cases added/updated and the source PR.
2. Report a one-paragraph summary per PR processed: PR #N → verdict (no impact / N cases updated / M cases added) → Qase IDs touched.

If the only change was marking queue entries processed (i.e., all PRs were skip-worthy docs/CI): no commit needed; just report `Processed N PRs — none impacted Qase cases.`

## Step 7 — Notify

End with a single line: `✅ QA-impact queue cleared (N PRs processed, M Qase cases touched).` This is the user's signal that the audit is done.

## Rules

- **Never auto-add a case you're not confident about.** When in doubt about whether the change needs QA coverage, mark `processed: true` with `reason: "needs operator review"` and surface the PR in the report so the user can decide.
- **Don't duplicate cases.** Search the existing PHASES/SCENARIOS for a close title before adding a new one. Update beats add.
- **Don't touch infra files** (CI/hooks/scripts other than the importer) — those don't need QA cases.
- **The importer is the only Qase-editing path.** Don't call the Qase API directly from this skill.
