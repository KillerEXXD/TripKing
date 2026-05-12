import type { Page } from '@playwright/test';

/**
 * Shared helpers for the E2E specs. The REST API is stubbed at the network layer
 * (`page.route('**\/api\/**', …)`) — the specs never touch the deployed Supabase functions —
 * and the dev server's `/api` proxy never gets a request. `getDriverMe` is invoked per
 * request to `GET /drivers/me`, so a spec can flip the verification state and reload.
 */

export const DRIVER_USER = {
  id: 'u-e2e-driver',
  role: 'driver',
  phone: '+919876500000',
  email: null,
  display_name: 'E2E Driver',
  preferred_language: 'en',
  is_active: true,
};

const CITY = { id: 'city-e2e', name: 'Vellore', state: 'TN', lat: 12.92, lng: 79.13, sort_order: 1, is_active: true };

type Verification = {
  kyc_status: string;
  steps: Record<string, string>;
  steps_done: number;
  steps_total: number;
  video_verification: unknown;
  kyc_rejection_reason: string | null;
};

export const VERIFICATION_DOCS_SUBMITTED: Verification = {
  kyc_status: 'docs_submitted',
  steps: { details: 'done', documents: 'done', vehicle: 'todo', vehicle_photos: 'todo', video_call: 'todo' },
  steps_done: 2,
  steps_total: 5,
  video_verification: null,
  kyc_rejection_reason: null,
};

export const VERIFICATION_APPROVED: Verification = {
  kyc_status: 'approved',
  steps: { details: 'done', documents: 'done', vehicle: 'done', vehicle_photos: 'done', video_call: 'done' },
  steps_done: 5,
  steps_total: 5,
  video_verification: null,
  kyc_rejection_reason: null,
};

/** A `GET /drivers/me` row in the snake_case shape the API speaks. */
export function driverRow(verification: Verification) {
  return {
    id: 'd-e2e',
    user_id: DRIVER_USER.id,
    full_name: 'E2E Driver',
    phone: DRIVER_USER.phone,
    email: null,
    home_city: CITY,
    current_city: CITY,
    current_lat: null,
    current_lng: null,
    current_location_at: null,
    profile_photo_url: '',
    kyc_status: verification.kyc_status,
    rating_avg: 0,
    rating_count: 0,
    rating_distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
    top_tags: [],
    manager_top_tags: [],
    total_trips_completed: 0,
    vehicles: [],
    verification,
  };
}

function envelope(data: unknown) {
  return { success: true, data, meta: null, error: null };
}

/** Stub every REST call (the dev `/api/*` proxy paths). Object-returning endpoints are mocked explicitly; everything else gets an empty list. */
export async function stubApi(page: Page, getDriverMe: () => object): Promise<void> {
  // Match only request paths under `/api/` (NOT dev source files like `/src/lib/api/client.ts`).
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
    const fulfill = (data: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope(data)) });
    switch (path) {
      case '/auth/request-otp':
        return fulfill({ dev_otp: '12345' });
      case '/auth/verify-otp':
        return fulfill({ user: DRIVER_USER, access_token: 'e2e-access', refresh_token: 'e2e-refresh' });
      case '/auth/refresh':
        return fulfill({ access_token: 'e2e-access', refresh_token: 'e2e-refresh' });
      case '/auth/me':
        return fulfill(DRIVER_USER);
      case '/auth/logout':
        return fulfill({});
      case '/drivers/me':
        return fulfill(getDriverMe());
      default:
        return fulfill([]); // safe for the list endpoints the home/profile pages hit
    }
  });
}

/** Run the /signin phone-OTP flow (the dev placeholder accepts any code) and land on the role home. */
export async function signInAsDriver(page: Page): Promise<void> {
  await page.goto('/signin');
  await page.getByLabel('Mobile number').fill('9876500000');
  await page.getByRole('button', { name: /send otp/i }).click();
  await page.getByLabel('OTP code').fill('123456');
  await page.getByRole('button', { name: /verify & continue/i }).click();
  await page.waitForURL('**/onboarding');
  await page.goto('/');
}
