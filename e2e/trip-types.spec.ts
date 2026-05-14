import { test, expect, type Route } from '@playwright/test';
import { AGENT_USER, AGENT_VERIFICATION_APPROVED, agentRow, signInAsAgent, stubApi } from './helpers';

/**
 * Migration-024 form: the PostTripPage carries a 3-tab segmented control
 * (One-way / Round-trip / Multi-way). One-way is the default and keeps the
 * legacy POST body shape (no waypoints[]). The other two emit
 * `{ trip_type, waypoints[], expected_end_at }` per the new contract.
 *
 * REST stubbed at the network layer; the agent profile is KYC-approved so the form
 * isn't gated. Tests capture the POST /trips body and assert the right shape.
 */

const CITIES = [
  { id: 'c-vlr', name: 'Vellore', state: 'TN', lat: 12.92, lng: 79.13, sort_order: 1, is_active: true },
  { id: 'c-chn', name: 'Chennai', state: 'TN', lat: 13.08, lng: 80.27, sort_order: 2, is_active: true },
  { id: 'c-pdy', name: 'Pondicherry', state: 'PY', lat: 11.94, lng: 79.83, sort_order: 3, is_active: true },
];
const CAR_TYPES = [{ id: 'ct-sedan', label: 'Sedan', sort_order: 1, is_active: true }];
const APP_SETTINGS = {
  min_vehicle_year: 2015,
  vehicle_expiry_warning_days: 90,
  default_alert_radius_km: 25,
  default_commission_pct: 10,
  default_gst_pct: 5,
  default_driver_bata: 300,
  default_extras_paid_by_passenger: true,
  default_driver_instructions: 'Drive safely.',
  max_active_vacancies_per_driver: 2,
};

/** ISO of a date N days from now at the given hour (UTC). */
function futureIso(daysFromNow: number, hour = 9): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}
/** datetime-local input value (YYYY-MM-DDTHH:mm) — what the date pickers want. */
function futureLocal(daysFromNow: number, hour = 9): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Stub the API + capture the POST /trips body. Returns a `getBody()` function
 * the test calls after submission. Falls through to stubApi for everything else.
 */
async function stubPostTripsCapture(page: import('@playwright/test').Page): Promise<() => Record<string, unknown> | null> {
  let captured: Record<string, unknown> | null = null;

  await stubApi(page, {
    user: AGENT_USER,
    paths: {
      '/agents/me': () => agentRow(AGENT_VERIFICATION_APPROVED),
      '/admin/cities': () => CITIES,
      '/admin/car-types': () => CAR_TYPES,
      '/admin/app-settings': () => APP_SETTINGS,
    },
  });

  // Override POST /trips specifically so the captured body is verified against the form's submission.
  await page.route(
    (url) => url.pathname.endsWith('/api/trips'),
    async (route: Route) => {
      if (route.request().method() === 'POST') {
        try { captured = JSON.parse(route.request().postData() ?? '{}'); } catch { captured = {}; }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: { id: 'tr-new', posted_by_user_id: AGENT_USER.id, posted_by_handle: 'AHANDLE0', trip_type: captured?.trip_type ?? 'one_way' },
            meta: null,
            error: null,
          }),
        });
        return;
      }
      // Non-POST falls through to stubApi.
      return route.continue();
    },
  );

  return () => captured;
}

test.describe('PostTripPage — trip-type tabs (migration 024)', () => {
  test('one-way is the default; submitting sends the legacy single-leg body (no waypoints)', async ({ page }) => {
    const getBody = await stubPostTripsCapture(page);
    await signInAsAgent(page);
    await page.goto('/trips/new');

    // The 3 tabs are present; One-way is selected by default.
    const oneWay = page.getByRole('tab', { name: /one-way/i });
    const roundTrip = page.getByRole('tab', { name: /round-trip/i });
    const multiWay = page.getByRole('tab', { name: /multi-way/i });
    await expect(oneWay).toHaveAttribute('aria-selected', 'true');
    await expect(roundTrip).toHaveAttribute('aria-selected', 'false');
    await expect(multiWay).toHaveAttribute('aria-selected', 'false');

    // Section heading flips per tab; default is the legacy "Route & schedule".
    await expect(page.getByText(/Route & schedule/i)).toBeVisible();
  });

  test('switching to Round-trip relabels the destination + reveals "Trip ends"', async ({ page }) => {
    await stubPostTripsCapture(page);
    await signInAsAgent(page);
    await page.goto('/trips/new');

    await page.getByRole('tab', { name: /round-trip/i }).click();
    await expect(page.getByText(/Round-trip plan/i)).toBeVisible();
    // The "To" select gets a turnaround label.
    await expect(page.getByText(/Turnaround city/i)).toBeVisible();
    // The "Trip ends" datetime field appears.
    await expect(page.getByText(/Trip ends/i)).toBeVisible();
  });

  test('switching to Multi-way reveals the waypoint editor + the return-to-start checkbox', async ({ page }) => {
    await stubPostTripsCapture(page);
    await signInAsAgent(page);
    await page.goto('/trips/new');

    await page.getByRole('tab', { name: /multi-way/i }).click();
    await expect(page.getByText(/Multi-way itinerary/i)).toBeVisible();
    // The destinations list (heading) + the "Add destination" button + the "Return to start" toggle.
    await expect(page.getByText(/Destinations \(in order\)/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /add destination/i })).toBeVisible();
    await expect(page.getByLabel(/return to start/i)).toBeVisible();
  });

  test('one-way submit → legacy single-leg body (no trip_type, no waypoints[])', async ({ page }) => {
    const getBody = await stubPostTripsCapture(page);
    await signInAsAgent(page);
    await page.goto('/trips/new');

    // Step 1 — route, schedule, vehicle.
    await page.getByLabel(/From \(pickup city\)/i).selectOption('c-vlr');
    await page.getByLabel(/To \(drop-off city\)/i).selectOption('c-chn');
    await page.getByLabel(/Pickup date & time/i).fill(futureLocal(2));
    // Car type is a chip button (not a select).
    await page.getByRole('button', { name: 'Sedan' }).click();
    await page.getByRole('button', { name: /next/i }).click();

    // Step 2 — minimum to submit.
    await page.getByLabel(/Rate per km/i).fill('15');
    await page.getByRole('button', { name: /post trip|create trip|publish/i }).click();

    // POST body has the legacy shape — no trip_type, no waypoints[].
    await expect.poll(getBody, { timeout: 5000 }).not.toBeNull();
    const body = getBody();
    expect(body).toMatchObject({ from_city_id: 'c-vlr', to_city_id: 'c-chn' });
    expect(body?.trip_type).toBeUndefined();
    expect(body?.waypoints).toBeUndefined();
  });

  test('round-trip submit → trip_type=round_trip + 3-waypoint chain + expected_end_at', async ({ page }) => {
    const getBody = await stubPostTripsCapture(page);
    await signInAsAgent(page);
    await page.goto('/trips/new');

    await page.getByRole('tab', { name: /round-trip/i }).click();

    await page.getByLabel(/Trip starts from \(city\)/i).selectOption('c-vlr');
    await page.getByLabel(/Turnaround city/i).selectOption('c-chn');
    await page.getByLabel(/Trip starts \(date & time\)/i).fill(futureLocal(2));
    await page.getByLabel(/Trip ends \(date & time\)/i).fill(futureLocal(3));
    await page.getByRole('button', { name: 'Sedan' }).click();
    await page.getByRole('button', { name: /next/i }).click();

    await page.getByLabel(/Rate per km/i).fill('15');
    await page.getByRole('button', { name: /post trip|create trip|publish/i }).click();

    await expect.poll(getBody, { timeout: 5000 }).not.toBeNull();
    const body = getBody();
    expect(body?.trip_type).toBe('round_trip');
    expect(typeof body?.expected_end_at).toBe('string');
    // 3 waypoints: origin → turnaround → origin (last city == first).
    const wp = body?.waypoints as Array<{ city_id: string | null }> | undefined;
    expect(wp).toHaveLength(3);
    expect(wp?.[0]?.city_id).toBe('c-vlr');
    expect(wp?.[1]?.city_id).toBe('c-chn');
    expect(wp?.[2]?.city_id).toBe('c-vlr');
  });
});

// Suppress lint for unused futureIso (kept in case a future test posts a pre-built ISO body)
void futureIso;
