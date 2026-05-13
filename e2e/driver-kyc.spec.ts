import { test, expect } from '@playwright/test';
import { driverRow, signInAsDriver, stubApi, VERIFICATION_APPROVED, VERIFICATION_DOCS_SUBMITTED } from './helpers';

/**
 * The driver "Get verified" journey, against a stubbed API: sign in → the Home banner points at
 * the next step → /profile shows the 5-step checklist → /verify/documents renders the document
 * fields → when the driver is approved, the banner is gone and the checklist collapses to "Verified".
 * (Uploading files / running the video call need real Storage + an admin and are covered by
 * scripts/test-kyc-flow.cjs, not here.)
 */
test.describe('driver Get-verified flow', () => {
  test('an unverified driver is guided through the checklist; an approved one is done', async ({ page }) => {
    let verification = VERIFICATION_DOCS_SUBMITTED;
    await stubApi(page, { paths: { '/drivers/me': () => driverRow(verification) } });

    // sign in → driver home
    await signInAsDriver(page);

    // the Home banner names the next outstanding step (documents are done → "Add your vehicle")
    const banner = page.getByRole('link', { name: /get verified to start earning/i });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Add your vehicle');

    // /profile → the 5-step checklist
    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: /get verified to start earning/i })).toBeVisible();
    for (const step of ['Your details', 'Identity documents', 'Add your vehicle', 'Vehicle photos & papers', 'Video verification']) {
      await expect(page.getByText(step, { exact: true })).toBeVisible();
    }

    // /verify/documents → the document step renders Aadhaar + driving licence + selfie + submit
    await page.goto('/verify/documents');
    await expect(page.getByRole('heading', { name: 'Identity documents' })).toBeVisible();
    await expect(page.getByText('Driving licence')).toBeVisible();
    await expect(page.getByText('Licence number')).toBeVisible();
    await expect(page.getByLabel(/aadhaar — last 4 digits/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /submit for verification/i })).toBeDisabled();

    // flip to approved → the banner disappears and the checklist collapses to "Verified"
    verification = VERIFICATION_APPROVED;
    await page.goto('/');
    await expect(page.getByRole('link', { name: /get verified to start earning/i })).toHaveCount(0);
    await page.goto('/profile');
    await expect(page.getByText(/verified — you can apply to and post trips/i)).toBeVisible();
  });
});
