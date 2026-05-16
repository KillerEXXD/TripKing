/**
 * Demo specs — three referral-program cases from the QA matrix, each mapped to a Qase
 * case via the `qase` annotation. The `playwright-qase-reporter` (configured in
 * playwright.config.ts when QASE_TESTOPS_API_TOKEN is set) reads the annotation and
 * posts the result to the matching case via the v1 API.
 *
 * The reporter matches on `automation_id` — which we set to the scenario id (e.g. "R10.4")
 * when we created the Qase cases. So `{ type: 'qase', description: 'R10.4' }` lands on
 * the right case in Qase. (See QA-RUNNER.md in this folder.)
 *
 * All three tests stub the API at the network layer via the existing `stubApi` helper —
 * no real Supabase needed. Run locally: `npm run test:e2e -- referral-qase-demo`.
 */
import { test, expect } from '@playwright/test';
import { signInAsDriver, stubApi } from './helpers';

const qase = (id: string) => [{ type: 'qase', description: id }];

const EMPTY_DASHBOARD = {
  user_id: 'u1',
  summary: {
    lifetime_earned_paise: 0, reversed_paise: 0, transferred_paise: 0, withdrawn_paise: 0,
    net_paise: 0, withdrawable_paise: 0, pending_paise: 0,
    counts: { total_referred: 0, qualified: 0, earning_active: 0, cap_reached: 0,
      signed_up: 0, verification_pending: 0, verified: 0, verification_rejected: 0,
      paid_trips_started: 0, suspended: 0, rejected: 0, expired: 0 },
  },
  recent_ledger: [],
};

// ₹1,000 released so all four presets (₹100 / ₹250 / ₹500 / ₹1,000) are visible —
// the panel filters out any preset > maxRupees, so any lower balance hides some buttons.
const READY_DASHBOARD = {
  ...EMPTY_DASHBOARD,
  summary: {
    ...EMPTY_DASHBOARD.summary,
    lifetime_earned_paise: 100000,
    withdrawable_paise: 100000,
    counts: { ...EMPTY_DASHBOARD.summary.counts, total_referred: 3, qualified: 1 },
  },
};

test.describe('Referral program — Qase mapping demo', () => {
  /** R10.4 — pure UI copy assertion. No state needed beyond an authed session. */
  test('R10.4 — Referral home headline + subheadline match spec §22', {
    annotation: qase('R10.4'),
  }, async ({ page }) => {
    await stubApi(page, { paths: { '/referrals/me': () => EMPTY_DASHBOARD } });
    await signInAsDriver(page);
    await page.goto('/referrals');

    // Spec §22 headline (we lower-cased "referring" in the implementation).
    await expect(page.getByRole('heading', { level: 1, name: /earn by referring verified drivers and agents/i })).toBeVisible();

    // Sub-heading must call out the 3 gates: verified → launch credits exhausted → eligible paid trips.
    const sub = page.getByText(/once they become verified, finish their launch credits, and start completing eligible paid trips, you earn ₹50 per trip until your referral cap is reached/i);
    await expect(sub).toBeVisible();
  });

  /** R6.1 — Transfer panel shows the four preset amounts. */
  test('R6.1 — Transfer-to-wallet shows ₹100 / ₹250 / ₹500 / ₹1,000 presets', {
    annotation: qase('R6.1'),
  }, async ({ page }) => {
    await stubApi(page, { paths: { '/referrals/me': () => READY_DASHBOARD } });
    await signInAsDriver(page);
    await page.goto('/referrals');

    const panel = page.getByLabel('Transfer to trip wallet');
    await expect(panel).toBeVisible();
    for (const r of ['₹100', '₹250', '₹500', '₹1,000']) {
      await expect(panel.getByRole('button', { name: r, exact: true })).toBeVisible();
    }
    // Anti-circular warning copy from spec §22.
    await expect(panel.getByText(/cannot be withdrawn later and will not generate further referral rewards/i)).toBeVisible();
  });

  /** R6.3 — Server-side guard: transfer amount > released balance → 422 + UI surfaces error. */
  test('R6.3 — Transfer amount > released balance is blocked', {
    annotation: qase('R6.3'),
  }, async ({ page }) => {
    // Released ₹500. User picks the ₹500 preset → submits → server returns 422
    // (simulating a race where balance dropped between page-load and submit, or a
    // server-side ledger drift). UI must surface the error and not silently no-op.
    // Note: register stubApi() FIRST, then the more-specific route — Playwright
    // dispatches routes in reverse registration order, so the specific one wins.
    await stubApi(page, { paths: {
      '/referrals/me': () => ({ ...READY_DASHBOARD, summary: { ...READY_DASHBOARD.summary, withdrawable_paise: 50000 } }),
    }});
    await page.route(/\/api\/referrals\/me\/transfer-to-wallet/, async (route) => {
      await route.fulfill({
        status: 422, contentType: 'application/json',
        body: JSON.stringify({ success: false, data: null, error: { code: 'INSUFFICIENT_BALANCE', message: 'Released balance is ₹100' } }),
      });
    });
    await signInAsDriver(page);
    await page.goto('/referrals');

    const panel = page.getByLabel('Transfer to trip wallet');
    await panel.getByRole('button', { name: '₹500', exact: true }).click();
    await panel.getByRole('button', { name: /^transfer ₹500$/i }).click();

    // Sonner toast surfaces the error message.
    await expect(page.getByText(/insufficient|released balance is ₹100|couldn’t transfer|couldn't transfer/i)).toBeVisible({ timeout: 5000 });
  });
});
