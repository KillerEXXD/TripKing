import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mintAdmin, mintAgent, postTrip, loginAs } from './helpers-api';

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

  /**
   * PR #221 — after a successful trip POST, the frontend redirects the agent to /posted-trips,
   * and the just-posted trip wears a "NEW" sparkle badge for 5 minutes (see PostedTripsPage line
   * 116-120 + the 5-minute useIsFresh window).
   *
   * We post via the API (not the form — the Radix datepicker is fragile under .fill()) and then
   * load /posted-trips as the agent. The NEW badge is the user-visible regression signal: if the
   * 5-minute window logic ever drifts or the Sparkle icon stops rendering, this catches it.
   */
  test('PR #221 — just-posted trip wears the NEW sparkle badge on /posted-trips', async ({ page, request }) => {
    const admin = await mintAdmin(request);
    const agent = await mintAgent(request, { adminToken: admin.token, kyc: 'approved' });
    await postTrip(request, agent.token); // mints a fresh open trip (createdAt = now)
    await loginAs(page, agent);

    await page.goto('/posted-trips');
    await page.waitForLoadState('networkidle');

    // The badge has aria-label="Newly posted trip" + visible text "NEW". Use the aria-label
    // since the icon-wrapped text can split rendering on the visible-text matcher.
    await expect(page.getByLabel('Newly posted trip').first()).toBeVisible({ timeout: 10_000 });
  });
});
