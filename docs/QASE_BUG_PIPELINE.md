# Qase ↔ TripKing bug pipeline

End-to-end: a failing Playwright test → Qase Defect → internal `bug_reports` row → admin notification → Claude Code `/bug N` investigation.

## The data flow

```
┌─────────────────┐     ┌─────────────────┐     ┌──────────────────────┐
│ npm run test:e2e│ ──▶ │ Qase Run + Cases│ ──▶ │ Qase Defects         │
│ (Playwright)    │     │ (per automation │     │ (auto on failure;    │
│                 │     │  _id mapping)   │     │  attachments inline) │
└─────────────────┘     └────────┬────────┘     └──────────┬───────────┘
                                 │                          │
                                 │                          │ project webhook
                                 ▼                          ▼
                        view in app.qase.io          POST /webhook-qase
                                                    (HMAC-SHA256 signed)
                                                            │
                                                            ▼
                                                ┌──────────────────────┐
                                                │ bug_reports row      │
                                                │  • qase_defect_id    │
                                                │  • context.qase_*    │
                                                │  • reporter=qa_bot   │
                                                └──────────┬───────────┘
                                                           │
                                          fan-out          │
                                          notifications    ▼
                                                ┌──────────────────────┐
                                                │ admin Bell           │
                                                │ /administration/bugs │
                                                │ + /bug N (Claude)    │
                                                └──────────────────────┘
```

## One-time Qase project setup

1. **Generate a webhook secret.** `openssl rand -hex 32` (or any 32+ byte random string).
2. **Set it on the edge function:** `npx supabase secrets set QASE_WEBHOOK_SECRET=<value> --project-ref saxcbebqxgatiktsebxw`.
3. **In the Qase UI** (https://app.qase.io/project/TRIPKINGAP/settings/webhooks):
   - Click **Add webhook**.
   - URL: `https://saxcbebqxgatiktsebxw.supabase.co/functions/v1/webhook-qase`
   - Secret: paste the same value from step 1.
   - Events: tick **Defect created**, **Defect updated**, **Defect resolved**. (Other events are ignored by the function.)
   - Click **Test webhook** — the Qase UI sends a sample POST; check the function logs for a 200.
4. **Save.** From now on, every Qase defect mirrors into `bug_reports`.

## How a failed test becomes a bug

1. Playwright test fails (e.g. `R6.3 — Transfer amount > released balance is blocked` raises an expect failure).
2. The Qase reporter (configured in `qase.config.json`) does two things on failure:
   - Posts the result to the Qase case keyed by the test's `qase` annotation.
   - Because `defect: true` is set, also creates a **Qase Defect** — with title = test name, description = stack trace, attachments = Playwright trace .zip + screenshots + video + `browser-errors.txt`.
3. Qase fires the project webhook → `POST /webhook-qase`.
4. The function:
   - Verifies the `X-Qase-Signature` HMAC against the raw body using `QASE_WEBHOOK_SECRET`.
   - Maps Qase severity → bug priority (blocker/critical → critical, major → high, normal → medium, minor/trivial → low).
   - Upserts a `bug_reports` row by `qase_defect_id` (partial-unique). Re-deliveries of the same defect update instead of inserting.
   - Fans out a `bug_reported` notification to every admin user (only on first insert — repeats don't re-bell).
5. Admin sees the bug at `/administration/bugs`. Claude Code's `/bug N` skill pulls the row + its full context (Qase defect URL, automation_id, trace attachment links) into Claude's investigation.

## Resolving the loop

When a dev marks a Qase Defect as resolved (or the linked test starts passing and Qase auto-resolves), Qase fires `defect.resolved`. The webhook flips the matching `bug_reports.status` to `resolved` and stamps `resolution_notes`. The reporter sees the row close from their end without anyone duplicating work.

## What's NOT wired (and why)

- **Re-uploading Qase attachments into our Storage bucket.** Qase serves them via permanent URLs and `uploadAttachments: true` keeps the originals attached to the Qase defect indefinitely. The `bug_reports.context.attachments` array holds the URLs — clickable from the admin UI. If/when Qase trials lapse, we can backfill via a one-shot script.
- **Two-way sync.** Closing a `bug_reports` row does NOT close the Qase defect. Add `PATCH /admin/bug-reports/{id}` → Qase API call later if it becomes painful.
- **Per-environment routing.** Qase has one webhook URL. The function logs every webhook to `api_metrics` so you can grep by `qase_run_id` to find e2e regressions per environment.

## Verifying

```bash
# Local smoke against the deployed function (the test signs payloads with QASE_WEBHOOK_SECRET):
WEBHOOK_QASE_API_BASE=https://saxcbebqxgatiktsebxw.supabase.co/functions/v1 \
  QASE_WEBHOOK_SECRET=<value> \
  node scripts/test-webhook-qase.cjs

# End-to-end (deliberately fail a Playwright test):
QASE_TESTOPS_API_TOKEN=<token> npm run test:e2e -- referral-qase-demo
# → red test in terminal
# → new Defect at https://app.qase.io/project/TRIPKINGAP/defects
# → within ~5s a new row at https://trip-king.vercel.app/administration/bugs
# → admin bell rings
```
