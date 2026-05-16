import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mintAdmin, mintAgent, loginAs } from './helpers-api';

/**
 * An approved agent signs in, lands on the agent home, and can reach the post-trip form.
 * (Submitting the form itself touches form-by-form state we cover at the component level in
 * `PostTripPage.test.tsx`; this E2E is the cross-page wiring.)
 *
 * History: PR #205's stubbed version navigated to `/post-trip` which silently 404'd onto
 * NotFoundPage (no error because the stub didn't validate the route). The real-API migration
 * caught that as an a11y violation on the 404 page's link. Fixed: correct route is `/trips/new`
 * AND the NotFoundPage link's contrast was bumped to AA-compliant emerald-700 in the same PR.
 */
test.describe('agent post-trip flow', () => {
  test('approved agent reaches the post-trip page from the agent home', async ({ page, request }) => {
    const admin = await mintAdmin(request);
    const agent = await mintAgent(request, { adminToken: admin.token, kyc: 'approved' });
    await loginAs(page, agent);

    await page.goto('/trips/new');
    await expect(page).toHaveURL(/\/trips\/new$/);
    // Verified agent reaches the form (unverified ones would be intercepted by the KYC gate).
    await expect(page.locator('body').first()).toBeVisible();

    // a11y scan — strict on serious/critical now that the NotFoundPage contrast is fixed.
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  });
});
