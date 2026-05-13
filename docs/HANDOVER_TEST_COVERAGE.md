# Handover — improve-test-coverage

**Branch:** `improve-test-coverage` (5 commits, pushed to origin)
**PR:** https://github.com/KillerEXXD/TripKing/pull/new/improve-test-coverage
**Plan:** `C:\Users\ravee\.claude\plans\how-many-tests-we-melodic-pine.md`

## What shipped (phases A → E)

| Phase | Commit | Summary |
|---|---|---|
| A | `b198bc6` | v8 coverage baseline + thresholds + Husky pre-push gate (added `@vitest/coverage-v8` devDep, scoped `coverage.include` to `src/**`, swapped pre-push from `test:run` → `test:coverage`). |
| B | `27dda4d` | 7 service tests (trips/vacancies/alerts/notifications/videoVerifications/places/auth) — 46 cases. |
| C | `dc2dcd3` | 8 hook tests (useAdminConfig/useAlerts/useNotifications/useReviews/useVacancies/useVehicles/useVideoVerification/usePassengers) — 35 cases. |
| D | `69664d7` | HomeForRole + myApplicationsStore (the two 0%-coverage files) — 10 cases. |
| E | `ee070f0` | 3 new Playwright specs (sign-in-otp, driver-apply, agent-post-trip) + `e2e/helpers.ts` refactor to accept `{ user, paths }` and support agent sign-in. |

**Coverage:** 83.76 / 71.63 / 67.05 / 83.76 → **87.70 / 73.64 / 71.79 / 87.70**.
**Floor (thresholds in [vitest.config.ts](../vitest.config.ts)):** 85 statements / 71 branches / 69 functions / 85 lines. Pre-push fails if a PR drops below.
**Test totals:** ~94 frontend test files (~576 cases), 6 Playwright specs, 14 backend smoke scripts unchanged.

## What's left (phases F, G, and the deferred E spec)

All three are independent — pick any. Each is one PR-sized commit.

### Phase F — Deno edge-function unit tests (stretch)
- Add `supabase/functions/__tests__/` using `deno test`. Start with the shared helpers: `withTiming` ([supabase/functions/_shared/timing.ts](../supabase/functions/_shared/timing.ts) — currently 0% in coverage), `rateLimit.ts`, response envelopes.
- Wire a `npm run test:edge` script that delegates to `deno test`.
- **Do NOT** add to Husky gate — Deno isn't a required tool for frontend devs.
- **Prereq:** `deno` installed locally (not currently a project assumption).

### Phase G — a11y assertions
- Add `vitest-axe` + `@axe-core/playwright` (CLAUDE.md "ask before adding a dep" — confirm with user).
- Seed 4–6 page tests: `HomePage.test.tsx`, `SignInPage.test.tsx`, `PostTripPage.test.tsx`, `AdminConfigPage.test.tsx`. Assert `expect(await axe(container)).toHaveNoViolations()`.
- Add a11y checks to 2 E2E specs (agent-post-trip + driver-apply) via `@axe-core/playwright`.

### Deferred from Phase E — admin-kyc-review.spec.ts
- Was scoped in but skipped: the agent/admin auth stubs and KYC-console flow are substantially heavier than the other 3 specs.
- **Needs:** `ADMIN_USER` constant, `/drivers?kyc_status=` list stub, `/drivers/:id/kyc` PATCH stub, `signInAsAdmin` helper.
- **Spec flow:** admin signs in → `/administration/kyc` shows the queue → click a row → approve → assert the row's status flips.

## Working notes / gotchas

- **Test naming**: tests live in `__tests__/` folders beside the source. Coverage `include` is `src/**/*.{ts,tsx}`; the `exclude` skips `src/types/**` (re-exports), `src/components/ui/**` (shadcn primitives), `src/test/`, `src/main.tsx`, `src/version.ts`, and `**/__tests__/**`. See [vitest.config.ts](../vitest.config.ts).
- **Strict transforms**: stubbing trip rows for E2E ran into the strict transforms — incomplete rows make `transformTrip` throw and React Query surfaces the ErrorState. For E2E, assert on page headings + URL transitions, not on transformed-card content. The `openTripRow()` helper in [e2e/helpers.ts](../e2e/helpers.ts) is a reasonably complete row to build on if a future spec needs richer card assertions.
- **SignIn race**: after `verifyOtp`, the explicit `navigate('/onboarding')` races with the inline `<Navigate to="/" />` re-render (both fire when `isAuthenticated` flips). Either is fine — `signInWithRole` now waits for "any URL that isn't `/signin`" rather than asserting `/onboarding` specifically.
- **Pre-push gate**: now runs `npm run test:coverage` (incl. threshold check). Takes ~35 s. If you add a feature and coverage dips, the gate will fail — write the test in the same commit.
- **Unrelated WIP**: `src/pages/TripDetailPage.tsx` is modified in your working tree (user-edits from before this session) and was **not** included in any commit. It still shows as `M` in `git status`.

## Recipe for any of the remaining phases

```powershell
git checkout main
git pull
git checkout -b <phase>-<short-name>
# … add tests / code …
npm run typecheck
npm run test:coverage    # confirm thresholds still pass
npm run test:e2e         # if you touched e2e/
git add <files>
git commit -m "..."
git push -u origin <branch>
```

If a phase raises coverage materially (≥1% on any metric), bump the thresholds in [vitest.config.ts](../vitest.config.ts) by ~baseline-2% to ratchet the floor up.
