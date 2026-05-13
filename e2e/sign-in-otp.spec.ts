import { test, expect } from '@playwright/test';
import { driverRow, stubApi, VERIFICATION_APPROVED } from './helpers';

/**
 * The phone → OTP → onboarding sign-in flow. The dev `/auth` accepts any 4–6 digit code,
 * so we drive the form visibly and assert the stage transitions and the post-verify
 * redirect. (Real SMS / `auth_otps` lands later — see CLAUDE.md §6.)
 */
test.describe('sign-in OTP flow', () => {
  test('phone form → OTP form → onboarding (then home for an approved driver)', async ({ page }) => {
    await stubApi(page, { paths: { '/drivers/me': () => driverRow(VERIFICATION_APPROVED) } });

    await page.goto('/signin');

    // Stage 1 — phone form
    const phone = page.getByLabel('Mobile number');
    await expect(phone).toBeVisible();
    const sendBtn = page.getByRole('button', { name: /send otp/i });
    await expect(sendBtn).toBeDisabled();
    await phone.fill('9876500000');
    await expect(sendBtn).toBeEnabled();
    await sendBtn.click();

    // Stage 2 — OTP form
    const otp = page.getByLabel('OTP code');
    await expect(otp).toBeVisible();
    const verifyBtn = page.getByRole('button', { name: /verify & continue/i });
    await expect(verifyBtn).toBeDisabled();
    await otp.fill('123456');
    await expect(verifyBtn).toBeEnabled();
    await verifyBtn.click();

    // Lands somewhere authenticated (either /onboarding or / — both are valid;
    // the race between the explicit post-verify navigate and the inline auth
    // redirect can go either way, but neither is /signin).
    await page.waitForURL((url) => !url.pathname.startsWith('/signin'));
    expect(new URL(page.url()).pathname).not.toBe('/signin');
  });
});
