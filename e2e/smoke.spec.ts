import { test, expect } from '@playwright/test';

/** The app boots and the public, no-auth pages render. */
test.describe('public pages', () => {
  test('the marketing site loads at /', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('the sign-in page shows the phone form', async ({ page }) => {
    await page.goto('/app/signin');
    await expect(page.getByLabel('Mobile number')).toBeVisible();
    await expect(page.getByRole('button', { name: /send otp/i })).toBeVisible();
  });
});
