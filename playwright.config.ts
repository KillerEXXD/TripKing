import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config — end-to-end browser tests under `e2e/`.
 *
 * `npm run test:e2e` boots a Vite dev server on a dedicated port (4399 — `npm run dev` defaults to
 * 3002, which collides with other worktrees) and runs the specs against it. The dev server's
 * `/api/*` proxy forwards to the deployed Supabase edge functions, so when the browser hits the
 * REST API it lands on REAL data — no stubs. Specs build their preconditions via `e2e/helpers-api.ts`
 * (`mintDriver`, `postTrip`, …) which calls the same Supabase host directly via Playwright's
 * `request` context. Two writers, one DB: parallel-safe by `e2e-…` naming + nightly purge cron
 * (migration 054). See `docs/TEST_POLICY.md` §"E2E preconditions are real".
 *
 * `PLAYWRIGHT_API_BASE` (default = the dev Supabase) overrides where setup calls land — useful
 * for pointing CI at a dedicated tripking-e2e project if one is provisioned later.
 *
 * `serviceWorkers: 'block'` keeps the PWA SW out of the way during runs. `webServer.reuseExisting`
 * reuses a dev server already on 4399 from a prior run. CI: 2 retries, 1 worker, no `.only`.
 */
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 4399);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  // When QASE_TESTOPS_API_TOKEN is set, playwright-qase-reporter posts each test's result
  // into a fresh Qase test run in project TRIPKINGAP, mapping scenario ids (e.g. "R10.4")
  // to cases via their `automation_id`. Without the env, the terminal reporter alone is
  // used so dev runs don't depend on Qase. See e2e/QASE-RUNNER.md.
  reporter: process.env.QASE_TESTOPS_API_TOKEN
    ? [['list'], ['playwright-qase-reporter']]
    : process.env.CI
      ? [['list'], ['html', { open: 'never' }]]
      : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    serviceWorkers: 'block',
    // Slow-mo for demos: `PW_SLOWMO=2000 npm run test:e2e -- --headed --workers=1`
    // pauses 2 s between every Playwright action so a human can follow along.
    launchOptions: { slowMo: Number(process.env.PW_SLOWMO ?? 0) },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Mobile viewport for "what does this look like on a phone?" runs.
    // Run with: `npm run test:e2e -- --project=mobile --headed --workers=1`
    { name: 'mobile', use: { ...devices['iPhone 14 Pro Max'] } },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
