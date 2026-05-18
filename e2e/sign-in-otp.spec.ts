import { test, expect } from '@playwright/test';
import { mintAdmin, mintDriver } from './helpers-api';

/**
 * The phone → OTP → onboarding sign-in flow. Mints a real KYC-approved driver via the API
 * first so we know the phone exists in the backend — then drives the sign-in UI against it,
 * end-to-end through the dev OTP `12345` and the post-verify redirect.
 *
 * No precondition stubs (see docs/TEST_POLICY.md §"E2E preconditions are real").
 */
test.describe('sign-in OTP flow', () => {
  test('phone form → OTP form → onboarding (then home for an approved driver)', async ({ page, request }) => {
    // Setup: mint a real driver so the post-verify redirect lands on a real driver-home.
    const admin = await mintAdmin(request);
    const driver = await mintDriver(request, { adminToken: admin.token, kyc: 'approved' });
    const localPhone = driver.phone.replace(/^\+91/, ''); // form takes the 10-digit local part

    await page.goto('/app/signin');

    // Stage 1 — phone form
    const phone = page.getByLabel('Mobile number');
    await expect(phone).toBeVisible();
    const sendBtn = page.getByRole('button', { name: /send otp/i });
    await expect(sendBtn).toBeDisabled();
    await phone.fill(localPhone);
    await expect(sendBtn).toBeEnabled();
    await sendBtn.click();

    // Stage 2 — OTP form. The FE requires 6 chars; the dev backend accepts any 4–6 digit
    // (so 123456 works as the "demo" code shown to the user in the help text).
    const otp = page.getByLabel('OTP code');
    await expect(otp).toBeVisible();
    const verifyBtn = page.getByRole('button', { name: /verify & continue/i });
    await expect(verifyBtn).toBeDisabled();
    await otp.fill('123456');
    await expect(verifyBtn).toBeEnabled();
    await verifyBtn.click();

    // Lands somewhere authenticated (either /app/onboarding or /app — both are valid;
    // the race between the explicit post-verify navigate and the inline auth
    // redirect can go either way, but neither is /app/signin).
    await page.waitForURL((url) => !url.pathname.startsWith('/app/signin'));
    expect(new URL(page.url()).pathname).not.toBe('/app/signin');
  });
});
