import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config — end-to-end browser tests under `e2e/`.
 *
 * `npm run test:e2e` boots a Vite dev server on a dedicated port (4399 — `npm run dev` defaults to
 * 3002, which collides with other worktrees) and runs the specs against it. The specs stub the REST
 * API at the network layer (Playwright `page.route` on the `/api` paths), so they're deterministic
 * and don't need the deployed Supabase functions; `serviceWorkers: 'block'` keeps the PWA service
 * worker out of the way so those route handlers always win. `webServer.reuseExistingServer` reuses
 * a dev server already on 4399 (e.g. from a prior run). CI: 2 retries, 1 worker, no `.only`, HTML report.
 */
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 4399);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    serviceWorkers: 'block',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
