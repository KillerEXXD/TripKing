import { test, expect, type APIRequestContext } from '@playwright/test';
import { API_BASE, mintAdmin, mintAgent, mintDriver, mintVehicle, getCities, getCarTypes } from './helpers-api';

/**
 * Auto-dispatch FULL JOURNEY E2E — the only spec that flips the GLOBAL platform
 * algorithm to 'auto', so it runs ISOLATED (--workers=1, run on its own) and ALWAYS
 * restores 'manual' in afterAll (+ the runner restores again belt-and-braces). Verifies
 * the global path: POST /trips (Auto) kicks off the engine → the lowest-token online
 * driver is offered → accept → assigned + busy (out of queue) + dispatch_status=filled.
 *
 * Service-role env (SUPABASE_SERVICE_ROLE_KEY + VITE_SUPABASE_URL) is required to flip the
 * single app_settings row + advance past any leftover online drivers; the spec skips cleanly
 * without it.
 */
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const SUPA_URL = (process.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '');
const VELLORE = { lat: 12.9165, lng: 79.1325 };

test.describe.configure({ mode: 'serial' });
test.skip(!SERVICE || !SUPA_URL, 'needs SUPABASE_SERVICE_ROLE_KEY + VITE_SUPABASE_URL for the controlled global flip');

// Plain Node fetch (NOT Playwright's request) — the secret API key is rejected from
// browser-like contexts, and Playwright's request context looks browser-originated.
function svc(method: 'GET' | 'PATCH' | 'POST', p: string, body?: unknown): Promise<Response> {
  return fetch(`${SUPA_URL}/rest/v1${p}`, {
    method,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const setAlgorithm = (v: 'auto' | 'manual') => svc('PATCH', '/app_settings?id=eq.1', { dispatch_algorithm: v });
const online = (req: APIRequestContext, token: string, vehicleId?: string) =>
  req.post(`${API_BASE}/drivers/online`, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, data: JSON.stringify({ ...VELLORE, vehicle_id: vehicleId }) });

test.beforeAll(async () => { await setAlgorithm('auto'); });
test.afterAll(async () => { await setAlgorithm('manual'); });

test('Auto journey: post → engine offers lowest-token → accept → assigned + busy + filled', async ({ request }) => {
  test.setTimeout(120_000); // many real-API setup calls (admin+agent+2 drivers+vehicles+online) on a shared host
  const admin = await mintAdmin(request);
  const agent = await mintAgent(request, { adminToken: admin.token, kyc: 'approved' });
  const cities = await getCities(request);
  const cars = await getCarTypes(request);
  const ct = cars[0]!.id;

  // Two approved drivers online near the pickup.
  const A = await mintDriver(request, { adminToken: admin.token, kyc: 'approved' });
  const va = await mintVehicle(request, A.token, { carTypeId: ct });
  const B = await mintDriver(request, { adminToken: admin.token, kyc: 'approved' });
  const vb = await mintVehicle(request, B.token, { carTypeId: ct });
  expect((await online(request, A.token, va.vehicleId)).status()).toBe(200);
  expect((await online(request, B.token, vb.vehicleId)).status()).toBe(200);
  const byId: Record<string, { token: string; driverId: string }> = { [A.driverId]: A, [B.driverId]: B };

  // Agent posts a trip — global algorithm is Auto, so the engine kicks off on POST.
  const city = cities.find((c) => /vellore/i.test(c.name)) ?? cities[0]!;
  const to = cities.find((c) => c.id !== city.id) ?? cities[1]!;
  const post = await request.post(`${API_BASE}/trips`, {
    headers: { Authorization: `Bearer ${agent.token}`, 'Content-Type': 'application/json' },
    data: JSON.stringify({
      from_city_id: city.id, to_city_id: to.id, pickup_at: new Date(Date.now() + 24 * 3600_000).toISOString(),
      car_type_id: ct, rate_per_km: 15, expected_distance_km: 100, commission_pct: 10, gst_amount: 98,
      driver_bata: 300, passenger_name: 'E2E Pax', passenger_phone: '+919900000123', passenger_count: 2,
      hide_passenger_phone: false, acceptance_window_minutes: 15, auto_invite_matches: false,
    }),
  });
  const postBody = await post.json().catch(() => ({}));
  expect(post.status(), `POST /trips → ${post.status()} ${JSON.stringify(postBody?.error)}`).toBe(200);
  const tripId = postBody.data.id as string;

  // The engine selected a driver synchronously on POST (global Auto path).
  const tripRow = await (await svc('GET', `/trips?id=eq.${tripId}&select=dispatch_mode,status,dispatch_status,assigned_driver_id`)).json();
  expect(tripRow[0].dispatch_mode).toBe('auto');
  expect(tripRow[0].status).toBe('selected');
  expect(tripRow[0].dispatch_status).toBe('offering');

  // Drive by whoever is the live offer; advance past any leftover online drivers (service role).
  async function selectedId(): Promise<string | null> {
    const r = await (await svc('GET', `/trips?id=eq.${tripId}&select=assigned_driver_id`)).json();
    return r[0]?.assigned_driver_id ?? null;
  }
  let sel = await selectedId();
  let guard = 0;
  while (sel && !byId[sel] && guard++ < 5) {
    await svc('PATCH', `/trips?id=eq.${tripId}`, { offer_deadline_at: new Date(Date.now() - 1000).toISOString() });
    await svc('POST', '/rpc/advance_dispatch', { p_trip: tripId });
    sel = await selectedId();
  }
  expect(byId[sel as string]).toBeTruthy();
  const winner = byId[sel as string];

  // Accept via the real handshake endpoint.
  const acc = await request.post(`${API_BASE}/trips/${tripId}/accept`, { headers: { Authorization: `Bearer ${winner.token}`, 'Content-Type': 'application/json' }, data: '{}' });
  expect(acc.status()).toBe(200);
  expect((await acc.json()).data.status).toBe('accepted');

  // Auto outcomes: driver busy (out of the queue) + dispatch filled + offer accepted.
  const pres = await (await svc('GET', `/driver_presence?driver_id=eq.${winner.driverId}&select=busy_trip_id`)).json();
  expect(pres[0].busy_trip_id).toBe(tripId);
  const filled = await (await svc('GET', `/trips?id=eq.${tripId}&select=dispatch_status`)).json();
  expect(filled[0].dispatch_status).toBe('filled');
  const offer = await (await svc('GET', `/trip_offers?trip_id=eq.${tripId}&driver_id=eq.${winner.driverId}&select=status`)).json();
  expect(offer.some((o: { status: string }) => o.status === 'accepted')).toBe(true);
});
