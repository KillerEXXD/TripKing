import type { Page, Route } from '@playwright/test';

/**
 * Shared helpers for the E2E specs. The REST API is stubbed at the network layer
 * (`page.route('**\/api\/**', …)`) — the specs never touch the deployed Supabase functions —
 * and the dev server's `/api` proxy never gets a request. Per-path overrides let each test
 * tailor the responses for the screens it touches.
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

export const AGENT_USER = {
  id: 'u-e2e-agent',
  role: 'trip_manager',
  phone: '+919876500001',
  email: null,
  display_name: 'E2E Agent',
  preferred_language: 'en',
  is_active: true,
};

export const ADMIN_USER = {
  id: 'u-e2e-admin',
  role: 'admin',
  phone: '+919876500002',
  email: null,
  display_name: 'E2E Admin',
  preferred_language: 'en',
  is_active: true,
};

const CITY = { id: 'city-e2e', name: 'Vellore', state: 'TN', lat: 12.92, lng: 79.13, sort_order: 1, is_active: true };
const CITY_DEST = { id: 'city-e2e-2', name: 'Chennai', state: 'TN', lat: 13.08, lng: 80.27, sort_order: 2, is_active: true };

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

export const AGENT_VERIFICATION_APPROVED: Verification = {
  kyc_status: 'approved',
  steps: { details: 'done', documents: 'done', video_call: 'done' },
  steps_done: 3,
  steps_total: 3,
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

export function agentRow(verification: Verification = AGENT_VERIFICATION_APPROVED) {
  return {
    id: 'a-e2e',
    user_id: AGENT_USER.id,
    full_name: 'E2E Agent',
    phone: AGENT_USER.phone,
    email: null,
    business_name: 'E2E Travels',
    business_city: CITY,
    profile_photo_url: '',
    kyc_status: verification.kyc_status,
    rating_avg: 0,
    rating_count: 0,
    total_trips_posted: 0,
    verification,
  };
}

export function openTripRow(over: Record<string, unknown> = {}) {
  return {
    id: 't-e2e',
    posted_by_user_id: AGENT_USER.id,
    from_city: CITY,
    to_city: CITY_DEST,
    pickup_at: '2026-06-01T08:00:00Z',
    pickup_place: { id: 'p1', name: 'Vellore CMC' },
    drop_place: { id: 'p2', name: 'Chennai Airport' },
    car_type_id: 'ct-sedan',
    car_type: { id: 'ct-sedan', label: 'Sedan' },
    passenger_count: 2,
    distance_km: 140,
    total_fare: 4200,
    rate_per_km: 14,
    driver_payout: 3500,
    driver_bata: 300,
    commission_pct: 10,
    gst_pct: 5,
    status: 'open',
    applicant_count: 0,
    show_fare_to_passenger: true,
    extras_paid_by_passenger: true,
    posted_at: '2026-05-13T10:00:00Z',
    created_at: '2026-05-13T10:00:00Z',
    updated_at: '2026-05-13T10:00:00Z',
    ...over,
  };
}

function envelope(data: unknown) {
  return { success: true, data, meta: null, error: null };
}

export interface StubConfig {
  /** The user returned by /auth/me + /auth/verify-otp. */
  user?: typeof DRIVER_USER;
  /** Per-path overrides. Return the unwrapped data; the helper envelopes it. */
  paths?: Record<string, () => unknown>;
}

/**
 * Stub every REST call (the dev `/api/*` proxy paths). The auth endpoints are mocked from
 * `config.user`; everything else takes per-path overrides, falling through to an empty list
 * for the long tail of list endpoints the home/profile pages also hit.
 */
export async function stubApi(page: Page, config: StubConfig = {}): Promise<void> {
  const user = config.user ?? DRIVER_USER;
  const paths = config.paths ?? {};
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route: Route) => {
      const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
      const fulfill = (data: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope(data)) });
      const override = paths[path];
      if (override) return fulfill(override());
      switch (path) {
        case '/auth/request-otp':
          return fulfill({ dev_otp: '12345' });
        case '/auth/verify-otp':
          return fulfill({ user, access_token: 'e2e-access', refresh_token: 'e2e-refresh' });
        case '/auth/refresh':
          return fulfill({ access_token: 'e2e-access', refresh_token: 'e2e-refresh' });
        case '/auth/me':
          return fulfill(user);
        case '/auth/logout':
          return fulfill({});
        default:
          return fulfill([]);
      }
    },
  );
}

async function signInWithRole(page: Page, localPhone: string): Promise<void> {
  await page.goto('/signin');
  await page.getByLabel('Mobile number').fill(localPhone);
  await page.getByRole('button', { name: /send otp/i }).click();
  await page.getByLabel('OTP code').fill('123456');
  await page.getByRole('button', { name: /verify & continue/i }).click();
  // After verify, the app navigates away from /signin — it may land on /onboarding
  // (explicit post-verify navigate) or /  (re-render after isAuthenticated flips).
  // Either is fine; the specs goto() the screen they actually care about next.
  await page.waitForURL((url) => !url.pathname.startsWith('/signin'));
  await page.goto('/');
}

export const signInAsDriver = (page: Page) => signInWithRole(page, '9876500000');
export const signInAsAgent = (page: Page) => signInWithRole(page, '9876500001');
export const signInAsAdmin = (page: Page) => signInWithRole(page, '9876500002');
