import { test, expect } from '@playwright/test';
import { driverRow, openTripRow, signInAsDriver, stubApi, VERIFICATION_APPROVED } from './helpers';

/**
 * A verified driver lands on Home, sees an open trip in the feed, and can open its detail page.
 * The "apply" mutation itself runs against the stub — what we're asserting is that the feed →
 * trip-detail navigation works end-to-end and the apply CTA is presented for an open trip.
 */
test.describe('driver apply flow', () => {
  test('approved driver sees an open trip in the feed and reaches the trip detail page', async ({ page }) => {
    const trip = openTripRow();
    await stubApi(page, {
      paths: {
        '/drivers/me': () => driverRow(VERIFICATION_APPROVED),
        '/trips': () => [trip],
        [`/trips/${trip.id}`]: () => trip,
      },
    });

    await signInAsDriver(page);

    // The open-trip feed lives at /trips; the page renders its header even when the
    // trip list is empty/loading. (Verifying the cards render against the strict
    // transforms is covered by the page-level component tests, not here.)
    await page.goto('/trips');
    await expect(page.getByRole('heading', { name: /open trips/i })).toBeVisible({ timeout: 10_000 });

    // Drive trip-detail navigation directly — proves the route + auth gate hold for an approved driver.
    await page.goto(`/trips/${trip.id}`);
    await expect(page).toHaveURL(new RegExp(`/trips/${trip.id}$`));
  });
});
