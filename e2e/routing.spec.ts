import { test, expect, type Page } from '@playwright/test';
import { mintAdmin, mintAgent, mintDriver, loginAs } from './helpers-api';

/**
 * Routing-shape contract for the `tripkingapp.com/` (marketing) + `tripkingapp.com/app/*` (app)
 * split shipped in PR #301. This spec is intentionally NOT a user-journey spec — it asserts
 * *where things live*, so a regression in `AppRoutes.tsx` or `vercel.json` lights up here
 * before any feature spec gets to it.
 *
 * Three concerns, three sections:
 *
 *  1. Public surface at root — `/`, `/for-agents`, `/passenger`. No auth, marketing copy.
 *  2. Direct `/app/*` paths — every protected route resolves WITHOUT a 308. If a relative
 *     child path under `<Route path="/app">` ever drifts back to an absolute `/foo`, this
 *     section catches it.
 *  3. Legacy 308 redirects — every path from the `vercel.json` redirects block returns a
 *     308 (or 301) to its `/app/*` destination. Catches the day someone deletes a redirect
 *     thinking "nobody uses /signin anymore" — old notification deep-links would break.
 *
 * Preconditions are real (docs/TEST_POLICY.md §"E2E preconditions are real").
 *
 * Qase IDs:  TBD on first import — these are new cases, the importer will assign numbers.
 */

// 308s only fire on the deployed Vercel preview/prod. In local Playwright runs against
// `npm run dev`, the Vercel layer is absent and old paths just 404. Skip-marker:
const SKIP_REDIRECTS_LOCAL = !process.env.PLAYWRIGHT_TEST_BASE_URL?.includes('vercel.app')
  && !process.env.PLAYWRIGHT_TEST_BASE_URL?.includes('tripkingapp.com');

test.describe('Routing: public surface at root', () => {
  test('GET / renders the marketing site (no app shell, no auth required)', async ({ page }) => {
    await page.goto('/');
    // WebsitePage's hero <h1>. The app's role-aware home is NOT an h1 (it's a "Hi <name>"
    // block + tile grid) — so an h1 on `/` proves we landed on marketing.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // App chrome must NOT be present at `/`. BottomNav has role="navigation" name="Primary".
    await expect(page.getByRole('navigation', { name: /primary/i })).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe('/');
  });

  test('GET /for-agents renders the agent-facing landing page', async ({ page }) => {
    await page.goto('/for-agents');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/for-agents');
  });

  test('GET /passenger renders the public passenger portal placeholder (no auth needed)', async ({ page }) => {
    await page.goto('/passenger');
    expect(new URL(page.url()).pathname).toBe('/passenger');
    // Don't assert specific copy — the page renders without crashing and without bouncing
    // to /app/signin (which is the failure we care about here).
    await expect(page.getByRole('navigation', { name: /primary/i })).toHaveCount(0);
  });
});

test.describe('Routing: anonymous user is bounced from /app/* to /app/signin', () => {
  test('GET /app (anonymous) → /app/signin', async ({ page }) => {
    await page.goto('/app');
    await expect(page.getByLabel('Mobile number')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/app/signin');
  });

  test('GET /app/trips (anonymous) → /app/signin', async ({ page }) => {
    await page.goto('/app/trips');
    await expect(page.getByLabel('Mobile number')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/app/signin');
  });

  test('GET /app/signin (anonymous) renders the sign-in form directly', async ({ page }) => {
    await page.goto('/app/signin');
    await expect(page.getByLabel('Mobile number')).toBeVisible();
    await expect(page.getByRole('button', { name: /send otp/i })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/app/signin');
  });
});

test.describe('Routing: direct /app/* paths resolve for a signed-in user (no redirect)', () => {
  // One driver covers driver-only paths; one agent covers agent-only paths; one admin
  // covers /app/administration/*. Minted once per test (Playwright isolates contexts).

  async function assertPathRenders(page: Page, path: string) {
    await page.goto(path);
    // The bottom nav lives on every authed route — if it's present, the app shell mounted.
    await expect(page.getByRole('navigation', { name: /primary/i })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(path);
  }

  test('driver routes: /app, /app/trips, /app/my-trips, /app/profile, /app/wallet, /app/referrals, /app/notifications', async ({ page, request }) => {
    const admin = await mintAdmin(request);
    const driver = await mintDriver(request, { adminToken: admin.token, kyc: 'approved' });
    await loginAs(page, driver);
    for (const p of ['/app', '/app/trips', '/app/my-trips', '/app/profile', '/app/wallet', '/app/referrals', '/app/notifications']) {
      await assertPathRenders(page, p);
    }
  });

  test('agent routes: /app/posted-trips, /app/vacancies, /app/trips/new, /app/analytics', async ({ page, request }) => {
    const admin = await mintAdmin(request);
    const agent = await mintAgent(request, { adminToken: admin.token, kyc: 'approved' });
    await loginAs(page, agent);
    for (const p of ['/app/posted-trips', '/app/vacancies', '/app/trips/new', '/app/analytics']) {
      await assertPathRenders(page, p);
    }
  });

  test('admin routes: /app/administration, /app/administration/{config,kyc,vehicles,reviews,translations,drivers,dashboard}', async ({ page, request }) => {
    const admin = await mintAdmin(request);
    await loginAs(page, admin);
    for (const p of [
      '/app/administration',
      '/app/administration/config',
      '/app/administration/kyc',
      '/app/administration/vehicles',
      '/app/administration/reviews',
      '/app/administration/translations',
      '/app/administration/drivers',
      '/app/administration/dashboard',
    ]) {
      await assertPathRenders(page, p);
    }
  });
});

test.describe('Routing: legacy paths 308 to /app/*', () => {
  test.skip(SKIP_REDIRECTS_LOCAL, 'Vercel redirects only run on deployed previews/prod');

  // For each legacy path, we do a raw fetch (no Playwright navigation, which auto-follows
  // redirects) and assert the response chain: first hop is 308/301 with the right Location;
  // following the redirect lands at the expected `/app/*` (or `/` for /website).
  async function assertRedirect(page: Page, from: string, to: string) {
    // page.request.get follows the project's baseURL automatically; maxRedirects:0
    // gives us the raw 308 instead of the final body.
    const res = await page.request.get(from, { maxRedirects: 0 });
    expect([301, 308]).toContain(res.status());
    const location = res.headers()['location'];
    expect(location).toBe(to);
  }

  test('/website → /', async ({ page }) => {
    await assertRedirect(page, '/website', '/');
  });

  test('/signin → /app/signin', async ({ page }) => {
    await assertRedirect(page, '/signin', '/app/signin');
  });

  test('/onboarding → /app/onboarding', async ({ page }) => {
    await assertRedirect(page, '/onboarding', '/app/onboarding');
  });

  test('/trips → /app/trips', async ({ page }) => {
    await assertRedirect(page, '/trips', '/app/trips');
  });

  test('/trips/:id → /app/trips/:id (regression: notification deep-link)', async ({ page }) => {
    await assertRedirect(page, '/trips/abc-123-def', '/app/trips/abc-123-def');
  });

  test('/profile → /app/profile', async ({ page }) => {
    await assertRedirect(page, '/profile', '/app/profile');
  });

  test('/my-trips → /app/my-trips', async ({ page }) => {
    await assertRedirect(page, '/my-trips', '/app/my-trips');
  });

  test('/vacancies → /app/vacancies', async ({ page }) => {
    await assertRedirect(page, '/vacancies', '/app/vacancies');
  });

  test('/notifications → /app/notifications', async ({ page }) => {
    await assertRedirect(page, '/notifications', '/app/notifications');
  });

  test('/administration → /app/administration', async ({ page }) => {
    await assertRedirect(page, '/administration', '/app/administration');
  });

  test('/administration/config → /app/administration/config', async ({ page }) => {
    await assertRedirect(page, '/administration/config', '/app/administration/config');
  });

  test('/wallet → /app/wallet', async ({ page }) => {
    await assertRedirect(page, '/wallet', '/app/wallet');
  });

  test('/referrals → /app/referrals', async ({ page }) => {
    await assertRedirect(page, '/referrals', '/app/referrals');
  });

  test('/analytics → /app/analytics', async ({ page }) => {
    await assertRedirect(page, '/analytics', '/app/analytics');
  });

  test('/alerts → /app/alerts', async ({ page }) => {
    await assertRedirect(page, '/alerts', '/app/alerts');
  });

  test('/queue/in-progress → /app/queue/in-progress', async ({ page }) => {
    await assertRedirect(page, '/queue/in-progress', '/app/queue/in-progress');
  });

  test('/vehicles/new → /app/vehicles/new', async ({ page }) => {
    await assertRedirect(page, '/vehicles/new', '/app/vehicles/new');
  });

  test('/verify/documents → /app/verify/documents', async ({ page }) => {
    await assertRedirect(page, '/verify/documents', '/app/verify/documents');
  });
});
