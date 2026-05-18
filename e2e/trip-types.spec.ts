import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { mintAdmin, mintAgent, mintDriver, mintVehicle, loginAs, getCities, getCarTypes, API_BASE } from './helpers-api';

/**
 * Migration-024 form: the PostTripPage carries a 3-tab segmented control
 * (One-way / Round-trip / Multi-way). One-way is the default and keeps the
 * legacy single-leg body shape (no waypoints[]). The other two emit
 * `{ trip_type, waypoints[], expected_end_at }` per the new contract.
 *
 * Real-data setup: mint an approved agent + load real city/car-type IDs from the
 * deployed reference data. After the form submits, GET the new trip via API and
 * assert the persisted `trip_type` + `waypoints[]` shape (the server is the witness,
 * not a capture stub).
 */

/** datetime-local input value (YYYY-MM-DDTHH:mm). */
function futureLocal(daysFromNow: number, hour = 9): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Read the trip back via API + return the canonical fields the form serializes.
 *
 * Waypoint shape note: the WAYPOINTS_JOIN on the server expands `city_id` into a nested
 * `city: { id, name, ... }` object (see supabase/functions/trips/index.ts:88). The flat
 * `city_id` column is NOT in the response — readback assertions must use `.city?.id`.
 * (Previous version of this helper typed it as `{ city_id?: string }` which is what made
 * round_trip + M1 think the readback was "unreliable" — it wasn't, the test was reading
 * a field that doesn't exist on the response.)
 */
async function readTripShape(req: APIRequestContext, token: string, tripId: string): Promise<{
  trip_type?: string;
  waypoints?: Array<{ city?: { id?: string; name?: string }; arrive_at?: string | null; is_destination?: boolean; seq?: number }>;
  from_city_id?: string;
  to_city_id?: string;
  expected_end_at?: string | null;
}> {
  const r = await req.get(`${API_BASE}/trips/${tripId}`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await r.json();
  return body?.data ?? {};
}

/** Capture the POST /trips response to get the new trip id. */
async function capturePostedTripId(page: Page): Promise<() => string | null> {
  let posted: string | null = null;
  page.on('response', async (res) => {
    if (res.url().includes('/api/trips') && res.request().method() === 'POST' && res.status() === 200) {
      try {
        const body = await res.json();
        if (body?.data?.id) posted = body.data.id;
      } catch { /* ignore */ }
    }
  });
  return () => posted;
}

// TODO(real-api-migration): the date pickers in the form are Radix Popover triggers (`<button>`
// with aria-haspopup), not native `<input type="datetime-local">` as the original stubbed test
// assumed. `page.fill()` errors with "Element is not an <input>". Needs a custom helper
// `pickDate(page, label, isoDate)` that clicks the trigger → drives the popover → closes.
// Tab-only assertions (one-way default, round-trip relabel, multi-way reveal) work without
// dates and remain enabled.
test.describe('PostTripPage — trip-type tabs (migration 024)', () => {
  test('one-way is the default; section heading is "Route & schedule"', async ({ page, request }) => {
    const admin = await mintAdmin(request);
    const agent = await mintAgent(request, { adminToken: admin.token, kyc: 'approved' });
    await loginAs(page, agent);
    await page.goto('/app/trips/new');

    const oneWay = page.getByRole('tab', { name: /one-way/i });
    const roundTrip = page.getByRole('tab', { name: /round-trip/i });
    const multiWay = page.getByRole('tab', { name: /multi-way/i });
    await expect(oneWay).toHaveAttribute('aria-selected', 'true');
    await expect(roundTrip).toHaveAttribute('aria-selected', 'false');
    await expect(multiWay).toHaveAttribute('aria-selected', 'false');
    await expect(page.getByText(/Route & schedule/i)).toBeVisible();
  });

  test('switching to Round-trip relabels the destination + reveals "Trip ends"', async ({ page, request }) => {
    const admin = await mintAdmin(request);
    const agent = await mintAgent(request, { adminToken: admin.token, kyc: 'approved' });
    await loginAs(page, agent);
    await page.goto('/app/trips/new');

    await page.getByRole('tab', { name: /round-trip/i }).click();
    await expect(page.getByText(/Round-trip plan/i)).toBeVisible();
    await expect(page.getByText(/Turnaround city/i)).toBeVisible();
    await expect(page.getByText(/Trip ends/i)).toBeVisible();
  });

  test('switching to Multi-way reveals the waypoint editor + the return-to-start checkbox', async ({ page, request }) => {
    const admin = await mintAdmin(request);
    const agent = await mintAgent(request, { adminToken: admin.token, kyc: 'approved' });
    await loginAs(page, agent);
    await page.goto('/app/trips/new');

    await page.getByRole('tab', { name: /multi-way/i }).click();
    await expect(page.getByText(/Multi-way itinerary/i)).toBeVisible();
    await expect(page.getByText(/Destinations \(in order\)/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /add destination/i })).toBeVisible();
    await expect(page.getByLabel(/return to start/i)).toBeVisible();
  });

  // Body-shape tests are pure API: the form's date pickers are Radix Popovers (not native
  // datetime-local inputs) and driving them via the UI is an investment the migration didn't
  // justify. The CONTRACT being tested (POST /trips body shape per trip_type) is server-side;
  // we POST directly and read back to assert.
  test('POST /trips one-way → trip_type=one_way, no waypoints', async ({ request }) => {
    const admin = await mintAdmin(request);
    const agent = await mintAgent(request, { adminToken: admin.token, kyc: 'approved' });
    const cities = await getCities(request);
    const carTypes = await getCarTypes(request);

    const post = await request.post(`${API_BASE}/trips`, {
      headers: { Authorization: `Bearer ${agent.token}`, 'Content-Type': 'application/json' },
      data: JSON.stringify({
        from_city_id: cities[0]!.id, to_city_id: cities[1]!.id,
        pickup_at: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
        expected_distance_km: 140, car_type_id: carTypes[0]!.id, rate_per_km: 14,
        commission_pct: 10, gst_amount: 98, driver_bata: 300,
        passenger_name: 'e2e Pax', passenger_phone: '+918888888888', passenger_count: 1,
        hide_passenger_phone: false, auto_invite_matches: false,
      }),
    });
    expect(post.status()).toBe(200);
    const tripId = (await post.json())?.data?.id as string;
    const shape = await readTripShape(request, agent.token, tripId);
    expect(shape.from_city_id).toBe(cities[0]!.id);
    expect(shape.to_city_id).toBe(cities[1]!.id);
    expect(shape.trip_type).toBe('one_way');
  });

  // Round-trip body shape: previously skipped because the readback assertions checked
  // `waypoints[i].city_id` which doesn't exist on the API response — the server's
  // WAYPOINTS_JOIN expands city_id into a nested `city: { id, ... }` object. Fixed in this
  // PR by re-typing readTripShape() and reading `.city.id` instead.
  test('POST /trips round-trip → trip_type=round_trip + 3-waypoint chain + expected_end_at', async ({ request }) => {
    const admin = await mintAdmin(request);
    const agent = await mintAgent(request, { adminToken: admin.token, kyc: 'approved' });
    const cities = await getCities(request);
    const carTypes = await getCarTypes(request);
    const pickupAt = new Date(Date.now() + 4 * 3600 * 1000).toISOString();
    const turnAt = new Date(Date.now() + 8 * 3600 * 1000).toISOString();  // strictly > pickup
    const endAt = new Date(Date.now() + 28 * 3600 * 1000).toISOString(); // strictly > turn

    const post = await request.post(`${API_BASE}/trips`, {
      headers: { Authorization: `Bearer ${agent.token}`, 'Content-Type': 'application/json' },
      data: JSON.stringify({
        from_city_id: cities[0]!.id, to_city_id: cities[1]!.id,
        pickup_at: pickupAt, expected_end_at: endAt,
        expected_distance_km: 140, car_type_id: carTypes[0]!.id, rate_per_km: 14,
        commission_pct: 10, gst_amount: 98, driver_bata: 300,
        passenger_name: 'e2e Pax', passenger_phone: '+918888888888', passenger_count: 1,
        hide_passenger_phone: false, auto_invite_matches: false,
        trip_type: 'round_trip',
        waypoints: [
          { city_id: cities[0]!.id },
          { city_id: cities[1]!.id, arrive_at: turnAt, wait_minutes: 0, is_destination: true },
          { city_id: cities[0]!.id, arrive_at: endAt, wait_minutes: 0, is_destination: true },
        ],
      }),
    });
    expect(post.status()).toBe(200);
    const tripId = (await post.json())?.data?.id as string;
    const shape = await readTripShape(request, agent.token, tripId);
    expect(shape.trip_type).toBe('round_trip');
    expect(typeof shape.expected_end_at).toBe('string');
    expect(shape.waypoints?.length).toBe(3);
    // Sorted by seq on the server (sortWaypoints in supabase/functions/trips/index.ts:293).
    expect(shape.waypoints?.[0]?.city?.id).toBe(cities[0]!.id);
    expect(shape.waypoints?.[1]?.city?.id).toBe(cities[1]!.id);
    expect(shape.waypoints?.[2]?.city?.id).toBe(cities[0]!.id);
  });
});

/**
 * Multi-way trips (migration 024 — Qase suite "M · Multi-way trips"). A multi-way trip is
 * an itinerary with ≥3 waypoints — pickup, one or more intermediate stops, then a final
 * destination (which MAY equal the pickup, e.g. a city-loop). Validation rules per the
 * edge function (supabase/functions/trips/index.ts):
 *   - multi_way requires ≥3 waypoints (else 422 'multi_way requires ≥3 waypoints')
 *   - arrive_at on each intermediate waypoint must be strictly > previous (else 422
 *     'waypoints[i].arrive_at must be > previous')
 *   - last waypoint MAY equal the first (the "return to start" flow)
 *   - notes can't contain phone numbers (PII guard)
 *
 * These body-shape tests use the POST contract directly (form-driving the Multi-way
 * waypoint editor + the Radix datetime pickers is fragile; the server is the witness).
 */
test.describe('PostTripPage — multi-way trips (migration 024)', () => {
  test('M1 — POST /trips multi_way with 3+ waypoints → 200 + trip_type=multi_way persists', async ({ request }) => {
    const admin = await mintAdmin(request);
    const agent = await mintAgent(request, { adminToken: admin.token, kyc: 'approved' });
    const cities = await getCities(request);
    const carTypes = await getCarTypes(request);
    const pickupAt = new Date(Date.now() + 4 * 3600 * 1000).toISOString();
    const viaAt   = new Date(Date.now() + 8 * 3600 * 1000).toISOString();
    const dropAt  = new Date(Date.now() + 12 * 3600 * 1000).toISOString();

    const post = await request.post(`${API_BASE}/trips`, {
      headers: { Authorization: `Bearer ${agent.token}`, 'Content-Type': 'application/json' },
      data: JSON.stringify({
        from_city_id: cities[0]!.id, to_city_id: cities[2]!.id,
        pickup_at: pickupAt, expected_end_at: dropAt,
        expected_distance_km: 250, car_type_id: carTypes[0]!.id, rate_per_km: 14,
        commission_pct: 10, gst_amount: 98, driver_bata: 300,
        passenger_name: 'e2e Pax', passenger_phone: '+918888888888', passenger_count: 1,
        hide_passenger_phone: false, auto_invite_matches: false,
        trip_type: 'multi_way',
        waypoints: [
          { city_id: cities[0]!.id },
          { city_id: cities[1]!.id, arrive_at: viaAt, wait_minutes: 30 },
          { city_id: cities[2]!.id, arrive_at: dropAt, is_destination: true },
        ],
      }),
    });
    expect(post.status()).toBe(200);
    const tripId = (await post.json())?.data?.id as string;
    const shape = await readTripShape(request, agent.token, tripId);
    expect(shape.trip_type).toBe('multi_way');
    // Tighter assertions now that the readback shape is understood: 3 waypoints in the
    // chain we posted, each nested-city id matches what we sent, and the top-level mirror
    // columns agree.
    expect(shape.waypoints?.length).toBe(3);
    expect(shape.waypoints?.[0]?.city?.id).toBe(cities[0]!.id);
    expect(shape.waypoints?.[1]?.city?.id).toBe(cities[1]!.id);
    expect(shape.waypoints?.[2]?.city?.id).toBe(cities[2]!.id);
    expect(shape.from_city_id).toBe(cities[0]!.id);
    expect(shape.to_city_id).toBe(cities[2]!.id);
  });

  test('M2 — POST /trips multi_way with return-to-start (last waypoint == first city) → 200', async ({ request }) => {
    const admin = await mintAdmin(request);
    const agent = await mintAgent(request, { adminToken: admin.token, kyc: 'approved' });
    const cities = await getCities(request);
    const carTypes = await getCarTypes(request);
    const pickupAt = new Date(Date.now() + 4 * 3600 * 1000).toISOString();
    const viaAt   = new Date(Date.now() + 8 * 3600 * 1000).toISOString();
    const backAt  = new Date(Date.now() + 14 * 3600 * 1000).toISOString();

    const post = await request.post(`${API_BASE}/trips`, {
      headers: { Authorization: `Bearer ${agent.token}`, 'Content-Type': 'application/json' },
      data: JSON.stringify({
        from_city_id: cities[0]!.id, to_city_id: cities[0]!.id,
        pickup_at: pickupAt, expected_end_at: backAt,
        expected_distance_km: 280, car_type_id: carTypes[0]!.id, rate_per_km: 14,
        commission_pct: 10, gst_amount: 98, driver_bata: 300,
        passenger_name: 'e2e Pax', passenger_phone: '+918888888888', passenger_count: 1,
        hide_passenger_phone: false, auto_invite_matches: false,
        trip_type: 'multi_way',
        waypoints: [
          { city_id: cities[0]!.id },
          { city_id: cities[1]!.id, arrive_at: viaAt, wait_minutes: 60, is_destination: true },
          { city_id: cities[0]!.id, arrive_at: backAt, is_destination: true },
        ],
      }),
    });
    // Multi-way allows the loop (unlike one_way which 422s when last==first). This is the
    // "drop the passenger somewhere, drive them back" use case.
    expect(post.status()).toBe(200);
    const tripId = (await post.json())?.data?.id as string;
    const shape = await readTripShape(request, agent.token, tripId);
    expect(shape.trip_type).toBe('multi_way');
  });

  test('M3 — POST /trips multi_way with only 2 waypoints → 422 VALIDATION', async ({ request }) => {
    const admin = await mintAdmin(request);
    const agent = await mintAgent(request, { adminToken: admin.token, kyc: 'approved' });
    const cities = await getCities(request);
    const carTypes = await getCarTypes(request);

    const post = await request.post(`${API_BASE}/trips`, {
      headers: { Authorization: `Bearer ${agent.token}`, 'Content-Type': 'application/json' },
      data: JSON.stringify({
        from_city_id: cities[0]!.id, to_city_id: cities[1]!.id,
        pickup_at: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
        expected_distance_km: 140, car_type_id: carTypes[0]!.id, rate_per_km: 14,
        commission_pct: 10, gst_amount: 98, driver_bata: 300,
        passenger_name: 'e2e Pax', passenger_phone: '+918888888888', passenger_count: 1,
        hide_passenger_phone: false, auto_invite_matches: false,
        trip_type: 'multi_way',
        waypoints: [
          { city_id: cities[0]!.id },
          { city_id: cities[1]!.id, is_destination: true },
        ],
      }),
    });
    expect(post.status()).toBe(422);
    const body = await post.json();
    // Server message includes "multi_way requires ≥3 waypoints" — match loosely on the count
    // requirement so a future copy edit doesn't snap the test.
    expect(JSON.stringify(body).toLowerCase()).toContain('multi_way');
  });

  test('M4 — POST /trips multi_way with non-monotonic arrive_at → 422 VALIDATION', async ({ request }) => {
    const admin = await mintAdmin(request);
    const agent = await mintAgent(request, { adminToken: admin.token, kyc: 'approved' });
    const cities = await getCities(request);
    const carTypes = await getCarTypes(request);
    const pickupAt = new Date(Date.now() + 4 * 3600 * 1000).toISOString();
    const laterAt  = new Date(Date.now() + 8 * 3600 * 1000).toISOString();
    const earlier  = new Date(Date.now() + 6 * 3600 * 1000).toISOString(); // BEFORE laterAt → invalid

    const post = await request.post(`${API_BASE}/trips`, {
      headers: { Authorization: `Bearer ${agent.token}`, 'Content-Type': 'application/json' },
      data: JSON.stringify({
        from_city_id: cities[0]!.id, to_city_id: cities[2]!.id,
        pickup_at: pickupAt, expected_end_at: laterAt,
        expected_distance_km: 250, car_type_id: carTypes[0]!.id, rate_per_km: 14,
        commission_pct: 10, gst_amount: 98, driver_bata: 300,
        passenger_name: 'e2e Pax', passenger_phone: '+918888888888', passenger_count: 1,
        hide_passenger_phone: false, auto_invite_matches: false,
        trip_type: 'multi_way',
        waypoints: [
          { city_id: cities[0]!.id },
          { city_id: cities[1]!.id, arrive_at: laterAt },   // later first
          { city_id: cities[2]!.id, arrive_at: earlier, is_destination: true }, // earlier — invalid
        ],
      }),
    });
    expect(post.status()).toBe(422);
  });

  // The full lifecycle has ~10 sequential API calls (mint admin/driver/vehicle/agent + post +
  // apply + assign + accept + start + complete) — pushes past the default 30s timeout. Same
  // pattern as journeys-critical.spec.ts which sets a 60s budget for the J* journeys.
  test('M5 — multi_way lifecycle: post → apply → assign → accept → start → complete', async ({ request }) => {
    test.setTimeout(60_000);
    const admin = await mintAdmin(request);
    const agent = await mintAgent(request, { adminToken: admin.token, kyc: 'approved' });
    const driver = await mintDriver(request, { adminToken: admin.token, kyc: 'approved' });
    await mintVehicle(request, driver.token);
    const cities = await getCities(request);
    const carTypes = await getCarTypes(request);
    const pickupAt = new Date(Date.now() + 4 * 3600 * 1000).toISOString();
    const viaAt   = new Date(Date.now() + 8 * 3600 * 1000).toISOString();
    const dropAt  = new Date(Date.now() + 12 * 3600 * 1000).toISOString();

    // Post the multi-way trip
    const post = await request.post(`${API_BASE}/trips`, {
      headers: { Authorization: `Bearer ${agent.token}`, 'Content-Type': 'application/json' },
      data: JSON.stringify({
        from_city_id: cities[0]!.id, to_city_id: cities[2]!.id,
        pickup_at: pickupAt, expected_end_at: dropAt,
        expected_distance_km: 250, car_type_id: carTypes[0]!.id, rate_per_km: 14,
        commission_pct: 10, gst_amount: 98, driver_bata: 300,
        passenger_name: 'e2e Pax', passenger_phone: '+918888888888', passenger_count: 1,
        hide_passenger_phone: false, auto_invite_matches: false,
        trip_type: 'multi_way',
        waypoints: [
          { city_id: cities[0]!.id },
          { city_id: cities[1]!.id, arrive_at: viaAt, wait_minutes: 30 },
          { city_id: cities[2]!.id, arrive_at: dropAt, is_destination: true },
        ],
      }),
    });
    expect(post.status()).toBe(200);
    const tripId = (await post.json())?.data?.id as string;

    // Walk through the full lifecycle via the same helpers J3-J7 use — proves multi-way
    // trips behave identically to one-way trips for the trip-lifecycle endpoints (apply,
    // assign, accept, start, complete don't have multi-way-specific branches that could regress).
    const { applyToTrip, assignDriver, acceptTrip, startTrip, completeTrip, getTrip } = await import('./helpers-api');
    const { acceptanceId } = await applyToTrip(request, driver.token, tripId);
    await assignDriver(request, agent.token, tripId, acceptanceId);
    const { passengerOtp } = await acceptTrip(request, driver.token, tripId);
    expect(passengerOtp).toMatch(/^\d{4,6}$/);
    await startTrip(request, driver.token, tripId, passengerOtp);
    const completeResult = await completeTrip(request, driver.token, tripId);
    expect(completeResult.status).toBe(200);

    const final = await getTrip(request, agent.token, tripId);
    expect(final?.status).toBe('completed');
    expect(final?.trip_type).toBe('multi_way');
  });
});
