# QA — how to run the E2E tests (no terminal, no Node)

You don't need anything installed. The whole thing runs in GitHub Actions; you just click a button.

## One-time setup (5 minutes, only the first QA does this)

A repo admin needs to add **one secret** so the runner can post results to Qase:

1. Open https://github.com/KillerEXXD/TripKing/settings/secrets/actions
2. Click **New repository secret**.
3. **Name:** `QASE_TESTOPS_API_TOKEN`
4. **Secret:** the Qase API token (the same value in `.env.development` as `QASE_API_TOKEN`; generate one at https://app.qase.io → Profile → API tokens if you don't have it).
5. Click **Add secret**.

That's it — every QA tester reuses the same secret going forward.

## How to run the tests

1. Open https://github.com/KillerEXXD/TripKing/actions/workflows/e2e-qase.yml
2. Click the green **Run workflow** dropdown on the right.
3. Pick your inputs:
   - **Branch:** `main` (or a feature branch if you're testing a PR)
   - **grep:** test filter — leave as `referral-qase-demo` for the 3 sample tests, blank for everything
   - **project:** `mobile` (iPhone viewport / WebKit / Safari engine) or `chromium` (desktop)
   - **post_to_qase:** keep **true** (posts results into Qase + auto-creates Defects on failure)
4. Click **Run workflow**.
5. Refresh after ~5 s — a new run appears in the list. Click into it to watch progress.

## What you'll see (~3 minutes)

- **Live log** in the run page — terminal output streaming in real time.
- **Step summary** at the top — pass/fail counts, project + filter used, link to the Qase run.
- **Artifacts panel** (bottom of the page) — download `playwright-report-NNN.zip`. Unzip and open `index.html` in your browser to see:
  - Every test's step-by-step actions
  - Screenshots taken at failure
  - Video of the actual browser run (mobile mode = iPhone-size frame)
  - Network log of every API call
- **Qase run** at https://app.qase.io/run/TRIPKINGAP — green/red per case, mapped to the original `Rx.x` from the matrix.

## When something fails

The pipeline does the rest automatically:

1. Playwright marks the case ❌ in Qase.
2. A **Qase Defect** is auto-created with the trace, video, screenshots, console errors attached.
3. Within ≤5 min the `cron-qase-poll` mirrors the Defect into our internal bug tracker.
4. Admin gets a 🔔 bell with link to the bug at `https://trip-king.vercel.app/administration/bugs`.
5. Dev fixes → marks Qase Defect resolved → bug auto-closes here too.

You don't have to file the bug. You just run the test, point dev at the BUG-NNN number in the Slack standup.

## Will I see the browser?

**No** — GitHub Actions runs headless on a Linux VM. You don't watch the test "drive" the screen.

But you get the equivalent (better, actually): the HTML report has a **time-travel viewer**. Open the failed test → click any step → see exactly what the DOM looked like at that moment, hover the timeline to scrub through frames. It's like a recorded session you can pause, zoom into, inspect.

If you DO want to watch a test drive a live browser (training / demo), a dev needs to run it locally with `--headed --slow-mo=2000`. That's a one-off, not a recurring workflow.

## Common questions

**Q: Can I run only one test?**
A: Put its title (or part of it) in the `grep` field. e.g. `R6.3` or `transfer`.

**Q: Can I run against the live deployed app instead of a local dev server?**
A: Not yet — current setup runs against a local dev server (boots inside the job) with stubbed API. Talk to dev if you want a "live-API" mode added.

**Q: How long does a run take?**
A: ~3 min for the 3 demo tests. ~10 min for all 15 critical journeys (once those are added). ~30 min for full nightly regression.

**Q: What if Qase doesn't show the result?**
A: Check the run's "Summary" tab — if "Qase posting: skipped" the secret is missing or `post_to_qase: false`. Check the live log for `[INFO] qase:` lines to confirm it tried.

**Q: Can I cancel a stuck run?**
A: Yes — open the run page → top-right **Cancel workflow** button.

**Q: How do I trigger the same run every night?**
A: Already wired — the workflow has `schedule: '30 2 * * *'` (02:30 UTC = 08:00 IST). Runs the default config (mobile, all specs, post to Qase). You'll see the results at https://app.qase.io each morning.

