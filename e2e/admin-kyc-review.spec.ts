import { test, expect } from '@playwright/test';
import { ADMIN_USER, driverRow, signInAsAdmin, stubApi, VERIFICATION_DOCS_SUBMITTED, VERIFICATION_APPROVED } from './helpers';

/**
 * An admin opens the KYC review queue, sees a driver with `docs_submitted`, clicks Approve,
 * and the badge flips to `Approved`. The PATCH /drivers/:id/kyc stub mutates a closure
 * variable so the React Query refetch on invalidation reflects the new status.
 */
test.describe('admin KYC review flow', () => {
  test('admin approves a driver from the queue and the badge flips to Approved', async ({ page }) => {
    // Driver row that the queue should pick up. Mutate this in-place on PATCH so the refetch
    // after the mutation reflects the new state.
    const driver = {
      ...driverRow(VERIFICATION_DOCS_SUBMITTED),
      id: 'd-e2e-pending',
      full_name: 'KYC Pending Driver',
      kyc_status: 'docs_submitted',
    };

    await stubApi(page, {
      user: ADMIN_USER,
      paths: {
        '/drivers': () => [driver],
        '/agents': () => [],
        [`/drivers/${driver.id}/kyc`]: () => {
          // PATCH handler — flip status and echo the row back. The route helper doesn't
          // distinguish methods; both GET and PATCH hit this, which is fine because the
          // GET path falls through the `/drivers` override and never reaches here.
          driver.kyc_status = 'approved';
          return { ...driver, verification: VERIFICATION_APPROVED };
        },
      },
    });

    await signInAsAdmin(page);
    await page.goto('/administration/kyc');

    // The queue defaults to Drivers + "Needs review" filter — the docs_submitted row should appear.
    await expect(page.getByRole('heading', { name: /^kyc review$/i })).toBeVisible();
    const card = page.locator('.rounded-2xl').filter({ hasText: 'KYC Pending Driver' }).first();
    await expect(card.getByText(/docs submitted/i)).toBeVisible();

    // Approve. The mutation invalidates the drivers query; the refetch picks up kyc_status:'approved'.
    await card.getByRole('button', { name: 'Approve' }).click();

    // The "Needs review" filter excludes approved rows — the empty-state appears after the refetch.
    await expect(page.getByText(/no drivers match this filter/i)).toBeVisible({ timeout: 10_000 });

    // Switch to the Approved filter — the driver is now there with the Approved badge.
    await page.getByRole('button', { name: 'Approved' }).click();
    const approvedCard = page.locator('.rounded-2xl').filter({ hasText: 'KYC Pending Driver' }).first();
    await expect(approvedCard).toBeVisible();
    await expect(approvedCard.getByText(/^approved$/i)).toBeVisible();
  });
});
