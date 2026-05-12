---
description: Run every TripKing edge-function smoke test (scripts/test-*.cjs) against the deployed functions and report pass/fail
---

TripKing's edge functions have no CI — the `scripts/test-*.cjs` smoke tests are the verification. Run them all against the **deployed** functions and report.

## Step 1 — Run every smoke

Every `scripts/test-*.cjs` honours `VITE_API_BASE_URL` (it appends `/functions/v1`), so one env var drives them all. The QA project is `saxcbebqxgatiktsebxw`:

```bash
B=https://saxcbebqxgatiktsebxw.supabase.co
for f in scripts/test-*.cjs; do
  echo "=== $f ==="
  VITE_API_BASE_URL="$B" node "$f" 2>&1 | tail -3
done
```

The scripts are: `test-admin-config.cjs` · `test-admin-places.cjs` · `test-alerts.cjs` · `test-analytics.cjs` · `test-auth.cjs` · `test-drivers.cjs` (covers `/agents` too) · `test-notifications.cjs` · `test-places.cjs` · `test-reviews.cjs` · `test-trips.cjs` · `test-vacancies.cjs` · `test-vehicles.cjs`. Each prints `[test-X] all checks passed` (exit 0) or `[test-X] N check(s) failed` (exit 1). They create real throwaway Supabase auth users on the QA project via the `/auth` dev-OTP path (`otp:'12345'` / `'123456'`) — that's expected, no cleanup needed.

(`test-trips.cjs` exercises a full lifecycle: auth → post a trip → driver bootstrap → apply → "my applications" → assign → by-otp → start → live location → "trips I'm driving" → complete, plus the PII-redaction matrix and the alert-match notification. `test-admin-places.cjs` / `test-analytics.cjs` / `test-admin-config.cjs` sign in as `role:'admin'`. `test-places.cjs` hits the live geocoder via `GET /places/search`.)

## Step 2 — If any fail

For each failed script, re-run it WITHOUT `| tail -3` to see which checks failed and why, then diagnose:
- A `DB_ERROR` / 500 → likely a missing migration or a broken edge-function deploy → check `git log`, re-`npx supabase functions deploy <name> --project-ref saxcbebqxgatiktsebxw --no-verify-jwt`, re-run.
- A 401 where 200 was expected → the `/auth` dev flow changed, or the function now requires a Bearer it didn't before (e.g. `GET /trips` is Bearer-required).
- A flaky `GET /places/search` (geocoder rate-limited / slow) → re-run; the script degrades those assertions to "200 + array" so it usually self-heals.
- A 429 → the rate limiter (`check_rate_limit`) tripping under repeated runs — wait a minute and re-run.

## Step 3 — Report

```
## TripKing edge-function smokes — [date], base = …saxcbebqxgatiktsebxw…

| Suite | Result |
|-------|--------|
| test-trips.cjs | ✅ 38/38 |
| test-vacancies.cjs | ✅ 29/29 |
| … | … |

Total: X/12 suites green.

### Failures (if any)
- `test-Y.cjs`: [which check, the error, the likely cause + the fix]
```

If all 12 are green: "All edge-function smokes green."
