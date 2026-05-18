import { test, expect } from '@playwright/test';
import { mintAdmin, mintDriver, mintVehicle, loginAs } from './helpers-api';

/**
 * The driver "Get verified" journey, asserted in two real states (pending vs approved).
 * Each test mints a fresh driver in the target state — avoids brittle mid-test cache
 * invalidation that mixing both states in one test would require.
 *
 * The intermediate `docs_submitted` state requires real Storage uploads — covered by
 * `scripts/test-kyc-flow.cjs`, not here.
 */
test.describe('driver Get-verified flow', () => {
  test('pending driver — home banner points at the checklist; profile lists all 5 steps', async ({ page, request }) => {
    const admin = await mintAdmin(request);
    const driver = await mintDriver(request, { adminToken: admin.token, kyc: 'pending' });
    await loginAs(page, driver);

    await page.goto('/app');
    await expect(page.getByRole('link', { name: /get verified to start earning/i })).toBeVisible();

    await page.goto('/app/profile');
    await expect(page.getByRole('heading', { name: /get verified to start earning/i })).toBeVisible();
    for (const step of ['Your details', 'Identity documents', 'Add your vehicle', 'Vehicle photos & papers', 'Video verification']) {
      await expect(page.getByText(step, { exact: true })).toBeVisible();
    }

    await page.goto('/app/verify/documents');
    await expect(page.getByRole('heading', { name: 'Identity documents' })).toBeVisible();
    await expect(page.getByText('Driving licence')).toBeVisible();
    await expect(page.getByText('Licence number')).toBeVisible();
    await expect(page.getByLabel(/aadhaar — last 4 digits/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /submit for verification/i })).toBeDisabled();
  });

  test('approved driver — banner gone; checklist collapses to "Verified"', async ({ page, request }) => {
    const admin = await mintAdmin(request);
    const driver = await mintDriver(request, { adminToken: admin.token, kyc: 'approved' });
    // Add a vehicle so the home page doesn't redirect to the "Add your vehicle" interstitial,
    // which aborts the goto and made this test ERR_ABORTED in PR #205.
    await mintVehicle(request, driver.token);
    await loginAs(page, driver);

    await page.goto('/app');
    await expect(page.getByRole('link', { name: /get verified to start earning/i })).toHaveCount(0);

    await page.goto('/app/profile');
    await expect(page.getByText(/verified — you can apply to and post trips/i)).toBeVisible();
  });
});
