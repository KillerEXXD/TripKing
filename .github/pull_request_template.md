<!--
  TripKing PR template. The test-policy checklist is MANDATORY — reviewers
  reject PRs that skip required boxes without justification. See
  docs/TEST_POLICY.md for the full rules.
-->

## Summary
<!-- 1–3 bullets: what changed and why -->

## Type of change
<!-- Tick one -->
- [ ] Feature
- [ ] Bug fix
- [ ] Refactor (no behavior change)
- [ ] Docs / comments only
- [ ] Edge function / OpenAPI / migration
- [ ] Chore / config

## Test policy checklist
> `docs/TEST_POLICY.md` — tests ship in the SAME commit as the code. Tick every applicable box.

- [ ] **New hooks / utils / services / transforms** → unit tests added in `__tests__/` next to source (happy path + at least one error/edge case)
- [ ] **New components** → render test covering loading / empty / error + the interaction this PR adds
- [ ] **New page routes** → page test + `expect(await axe(container)).toHaveNoViolations()` a11y assertion
- [ ] **New API services** → service test with `apiClient` mocked (URL + method + params + transform applied)
- [ ] **New transforms** → strict-mode test asserting throw on missing required fields
- [ ] **New edge function** → `withTiming` wrapper + Deno tests for new `_shared/*` + `scripts/test-*.cjs` smoke + OpenAPI + k6 entry if hot
- [ ] **New user flow ≥3 pages** → Playwright spec in `e2e/`
- [ ] **Bug fix** → regression test that FAILS on pre-fix code (run it against the old SHA to verify)
- [ ] Coverage thresholds in `vitest.config.ts` not lowered. If coverage went up ≥1%, thresholds bumped by `baseline − 2%`
- [ ] No mocked databases in integration tests
- [ ] No `useEffect`-for-derived-state, no client-side business math, no `any` without a guard

## Test plan
<!-- Bulleted list of how you verified this works -->
- [ ] `npm run test:coverage` — green, no threshold drop
- [ ] `npm run test:e2e` — green (if you touched E2E or any user flow)
- [ ] `npm run test:edge` — green (if you touched any edge function)
- [ ] Manual: <!-- screen-by-screen for UI; curl/MCP for backend -->

## Out of scope
<!-- What this PR intentionally doesn't address -->

## Notes for the reviewer
<!-- Anything non-obvious -->
