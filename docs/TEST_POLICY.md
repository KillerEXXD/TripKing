# TripKing test policy

> **This policy is mandatory.** Tests ship in the SAME commit as the code they cover. The pre-push gate enforces both coverage thresholds and the existence of test files. PRs without tests for new code are not merged.

## What to write, by change type

| Change | Required tests |
|---|---|
| **New hook / util / service / transform** | Unit test in `__tests__/` next to the source — happy path + at least one error/edge case |
| **New component** | Testing-Library render test — covers loading / empty / error states + the user interaction it adds |
| **New page route** | Page test (mocks hooks) — render, primary action, loading + error states. **Add `axe(container)` assertion** for a11y |
| **New API service** | Service test with `apiClient` mocked, asserting URL, method, params, and that the transform is applied |
| **New transform** | Strict-mode test — throws on missing required fields (not defaults them) |
| **New edge function** | (1) `withTiming` wrapper, (2) Deno unit tests in `supabase/functions/_shared/__tests__/` for any new `_shared` helper it uses, (3) `scripts/test-*.cjs` smoke against the deployed URL, (4) OpenAPI entry, (5) `k6` load entry if hot path |
| **New user flow spanning ≥3 pages** | One Playwright spec in `e2e/` |
| **Bug fix** | A **regression test that fails on the pre-fix code** — proves the fix works AND prevents reintroduction. No regression test = the fix didn't happen |
| **Refactor (no behavior change)** | No new tests required, but existing tests must stay green — they ARE the safety net for the refactor |
| **Type-only / docs / comments** | None |

## Coverage gates (Husky pre-push enforces)

- `vitest.config.ts` thresholds: **85 statements / 71 branches / 69 functions / 85 lines**. PR drops below → push fails. Fix by writing the missing test, not by lowering the threshold.
- Ratchet up when a PR raises coverage materially (≥1% on any metric): bump thresholds by `baseline − 2%`. Locks the gain in.
- `npm run test:run` + `npm run test:coverage` + `tsc --noEmit` + `npm run build` all gate every push.
- `scripts/check-tests-required.cjs` runs in pre-push too: when a `src/**` source file is modified, it must have a `__tests__/` file in the same change-set (commit range vs `origin/main`). Skip path documented below.
- Deno edge-fn tests (`npm run test:edge`) and Playwright (`npm run test:e2e`) are NOT in the Husky gate — run them locally before opening a PR that touches edge fns or user flows.

### Escape hatch (use sparingly, document in commit message)

Set `TRIPKING_SKIP_TEST_GATE=1` to bypass the test-required check ONLY for:
- Pure docs / comment / type-only changes
- Refactors that preserve coverage (the coverage gate still runs)
- Generated code (e.g. OpenAPI types)

Setting this on a feature/bugfix is a policy violation — the reviewer will reject the PR.

## Quality bar (not just quantity)

- **No mocked databases in integration tests** — burned us before; mocked tests passed while prod migrations failed.
- **E2E preconditions are real, not stubbed.** Playwright specs in `e2e/` create their setup state via real API calls (`mintDriver()`, `mintAgent()`, `postTrip()` from `e2e/helpers-api.ts`) — never by stubbing `GET /trips/:id/applicants` to return canned rows. Stubs lie; we've shipped bugs to prod where the API drifted but the stub stayed green. **Permitted carve-out:** stubbing a specific HTTP **error response** (4xx / 5xx) to verify the UI's error path — tag the test with a `@stub-error` block comment and keep the rationale next to it. Forcing the real error from the backend (e.g. drain the wallet to ₹0 to get a real `402`) is preferred when feasible. This rule does **not** apply to vitest unit / component tests — those SHOULD mock their service layer. Test data hygiene: all minted accounts use `display_name` prefix `e2e-…`; migration 054 runs nightly `pg_cron` to purge rows >7 days old.
- **a11y is a test requirement, not a polish phase** — every new page test gets `expect(await axe(container)).toHaveNoViolations()`. Fix violations at the source; don't disable rules.
- **A test that exercises code without asserting outcomes doesn't count.** Mocks set up + render + zero assertions = bad test. Reviewers check this carefully.

## Process

- Coverage report (`npm run test:coverage`) is the truth — sort by lowest coverage to find what needs tests next.
- A bug that escapes to prod and has no regression test = file an issue with the `regression-test-missing` label.
- Test files live in `__tests__/` next to source. Not in a parallel `tests/` tree.
- Never inflate coverage with assertion-free tests. The pre-push gate measures lines, not value — review catches the rest.

## Anti-patterns we've already paid for

- `useEffect` for derived state (compute during render instead) — has bitten us in re-render loops.
- Business math in transforms or components (fares, eligibility, payouts) — server-side only. If a field is missing, fix the API, don't fabricate a fallback.
- "I'll write the test in a follow-up PR" — the follow-up never lands; tests rot.
- Disabling axe rules instead of fixing the violation — the rule exists for a reason.
