import { test, expect } from '@playwright/test';
import { mintAdmin, mintDriver, setKyc, loginAs } from './helpers-api';

/**
 * Admin KYC review: an admin drills into a driver who is at `ready_for_approval`, clicks
 * Approve, and the page shows the "Approved" success banner.
 *
 * The Approve button only enables when the driver's status is `ready_for_approval` (all
 * steps green). We setKyc straight there via admin PATCH — the upstream steps (docs upload,
 * video call) require real Storage + a video session, covered by `scripts/test-kyc-flow.cjs`.
 *
 * Note: the older test (PR #205) asserted the QUEUE-LIST card interaction with an in-card
 * Approve button. The current UI puts Approve only on the detail page, so this spec drills
 * straight to /administration/kyc/driver/:id. Queue-list rendering is asserted at component
 * level instead.
 */
test.describe('admin KYC review flow', () => {
  test('admin approves a ready_for_approval driver and the banner flips to Approved', async ({ page, request }) => {
    const admin = await mintAdmin(request);
    const driver = await mintDriver(request, { adminToken: admin.token, kyc: 'pending' });
    await setKyc(request, admin.token, 'driver', driver.driverId, 'ready_for_approval');
    await loginAs(page, admin);

    await page.goto(`/administration/kyc/driver/${driver.driverId}`);

    const approveBtn = page.getByRole('button', { name: 'Approve', exact: true });
    await expect(approveBtn).toBeEnabled({ timeout: 10_000 });
    await approveBtn.click();

    await expect(page.getByText(/Approved — the applicant can apply to and post trips/i)).toBeVisible({ timeout: 10_000 });
  });
});
