---
description: Investigate a TripKing bug by number — pulls the bug_report row + comments + attachments + the reporter's api_metrics in a ±2h window, and prints a markdown dump
allowed-tools: Bash, Read, Edit, Write, Grep, Glob
argument-description: Bug number (e.g. /bug 12 or /bug BUG-012)
---

# Investigate bug $ARGUMENTS

You're triaging a bug submitted through the in-app reporter (the `bug_reports`
table; see `supabase/migrations/027_bug_reports.sql`). Follow the 6-step flow
TripKing uses for triage. Don't fix anything without explicit approval.

## Step 1 — Pull the data

Run the investigation script:

```bash
node scripts/investigate-bug.cjs $ARGUMENTS
```

The script queries via the Supabase Management API (no DB password needed —
reads the access token from the Supabase CLI's Windows Credential Manager
entry, exactly like `scripts/db.cjs`). It prints a markdown dump containing:
- The bug row (status, priority, category, reporter, page, route, app version).
- Description / steps / expected / actual.
- Console logs / breadcrumbs / context / query-cache snapshot.
- Attachments (storage paths — pull signed URLs from `GET /bug-reports/:id`).
- Comments thread.
- The reporter's `api_metrics` rows in a ±2h window around `created_at`.

If a screenshot is referenced, pull its signed URL via the `/bug-reports/:id`
endpoint (admin Bearer) and view it.

## Step 2 — Deep investigation (answer all 3)

**Q1. Why now?** Run `git log --oneline -20` and `git log --all --oneline -- <affected-files>`. If it's a regression, name the breaking commit. If latent, explain what condition changed.

**Q2. Is Sentry catching it?** Check the `sentry_replay_url`, then `/sentry`. If not captured, identify where `captureDataError` should be added and include that in the fix.

**Q3. What else needs retesting?** Resolved/verified bugs touching the same files or code paths — list them.

## Step 3 — Explain

Present a `## BUG-NNN Investigation` summary with **Title**, **Status**, **Priority**, **Reporter**, **Issue**, **Root cause**, **Why it broke**, **Sentry coverage**, **Cross-bug impact**, **Affected files**.

## Step 4 — Ask for approval

Ask: **"Should I proceed to fix this bug?"** Wait for confirmation.

## Step 5 — Fix on approval

1. Minimal change. Match existing patterns.
2. Add a regression test in `__tests__/` (CLAUDE.md TEST POLICY).
3. If Q1 found a previous-fix collision, add a second test protecting the original scenario so we don't ping-pong.
4. `npm run typecheck && npm run test:run && npm run build` — all green.
5. `git add` only the files you actually changed (never `git add -A` blindly), commit `fix: BUG-NNN — <description>`, **do not push** unless asked.

## Step 6 — Resolve in the tracker

Open `/administration/bugs?bugId=<uuid>` (or update via the API):

```bash
# Using the admin Bearer
curl -s -X PATCH "$VITE_API_BASE_URL/bug-reports/<bug_id>" \
  -H "authorization: Bearer $ADMIN_BEARER" -H "content-type: application/json" \
  -d '{"status":"resolved","resolution_notes":"**Root cause:** ...\n\n**Fix:** ...\n\n**Files modified:**\n- `path/to/file.ts`"}'
```

The PATCH fires a `bug_resolved` notification to the reporter automatically.
Add retest steps inside `resolution_notes`.
