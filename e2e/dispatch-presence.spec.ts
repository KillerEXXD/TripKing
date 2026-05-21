import { test, expect, type APIRequestContext } from '@playwright/test';
import { API_BASE, mintAdmin, mintAgent, mintDriver } from './helpers-api';

/**
 * Dispatch E2E — the SHIPPED, non-destructive slice of the "I'm Online" feature:
 *   • the public /config projection (DC.*)
 *   • the driver presence lifecycle: online → grace → reconnect, KYC/profile gates,
 *     validation, and the hidden global token NEVER leaking (DP.* / DG.* / DSEC.1).
 *
 * API-level against the deployed edge functions (real-API per docs/TEST_POLICY.md) —
 * ephemeral e2e-… users, swept by the nightly purge cron. Deliberately does NOT flip
 * the global app_settings.dispatch_algorithm (that would disrupt other live sessions),
 * so the Auto offer-engine / incoming-offer / realtime / push cases (DE/DO/DM/DB/DX/
 * DRT/DPH) are not covered here — they land with PR5–PR9 when that behaviour exists.
 */

const VELLORE = { lat: 12.9165, lng: 79.1325 };
const leaksToken = (obj: unknown): boolean => JSON.stringify(obj ?? {}).includes('"token"');

function authed(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}
const post = (req: APIRequestContext, path: string, token: string, data: unknown = {}) =>
  req.post(`${API_BASE}${path}`, { headers: authed(token), data: JSON.stringify(data) });
const get = (req: APIRequestContext, path: string, token: string) =>
  req.get(`${API_BASE}${path}`, { headers: authed(token) });

test.describe('Dispatch · public /config (DC)', () => {
  test('DC.1/DC.2/DC.3 — curated subset, no commercial leak, guarded methods', async ({ request }) => {
    const res = await request.get(`${API_BASE}/config`);
    expect(res.status()).toBe(200);
    const d = (await res.json()).data as Record<string, unknown>;

    // DC.1 — the 4 whitelisted keys with the right shapes
    expect(['auto', 'manual']).toContain(d.dispatch_algorithm);
    expect(typeof d.dispatch_offer_seconds).toBe('number');
    expect(typeof d.dispatch_offline_grace_seconds).toBe('number');
    expect(typeof d.dispatch_heartbeat_stale_seconds).toBe('number');

    // DC.2 — never leak commercial settings
    for (const k of ['default_commission_pct', 'default_driver_bata', 'default_gst_amount', 'invite_max_radius_km']) {
      expect(d).not.toHaveProperty(k);
    }

    // DC.3 — method guard
    expect((await request.post(`${API_BASE}/config`)).status()).toBe(405);
  });
});

test.describe('Dispatch · presence lifecycle (DP / DG / DSEC)', () => {
  test('online → grace → reconnect, gates + token never leaks', async ({ request }) => {
    const admin = await mintAdmin(request);
    const driver = await mintDriver(request, { adminToken: admin.token, kyc: 'approved' });
    const agent = await mintAgent(request); // a user with NO driver profile

    // unauth + no-driver-profile gates
    expect((await request.post(`${API_BASE}/drivers/online`, { data: JSON.stringify(VELLORE), headers: { 'Content-Type': 'application/json' } })).status()).toBe(401);
    expect((await post(request, '/drivers/online', agent.token, VELLORE)).status()).toBe(404);

    // DP.8 — heartbeat before online
    expect((await post(request, '/drivers/heartbeat', driver.token, VELLORE)).status()).toBe(409);
    // DP.5 — validation: missing lat/lng
    expect((await post(request, '/drivers/online', driver.token, {})).status()).toBe(422);

    // DP.2 — go online + DSEC.1 token never leaks
    const online = await post(request, '/drivers/online', driver.token, VELLORE);
    expect(online.status()).toBe(200);
    const onlineBody = await online.json();
    expect(onlineBody.data.status).toBe('online');
    expect(onlineBody.data.is_online).toBe(true);
    expect(leaksToken(onlineBody)).toBe(false);

    // DP.9 — presence read
    const pres = await get(request, '/drivers/presence', driver.token);
    const presBody = await pres.json();
    expect(presBody.data.status).toBe('online');
    expect(leaksToken(presBody)).toBe(false);

    // DP.7 — heartbeat keeps it online
    const hb = await post(request, '/drivers/heartbeat', driver.token, VELLORE);
    expect(hb.status()).toBe(200);
    expect((await hb.json()).data.status).toBe('online');

    // DG.1 — offline → grace
    const off = await post(request, '/drivers/offline', driver.token);
    const offBody = await off.json();
    expect(offBody.data.status).toBe('grace');
    expect(offBody.data.grace_expires_at).toBeTruthy();
    expect(leaksToken(offBody)).toBe(false);

    // DG.2 — reconnect within grace → online again
    const back = await post(request, '/drivers/online', driver.token, VELLORE);
    expect((await back.json()).data.status).toBe('online');
  });

  test('DP.3 — KYC-unapproved driver cannot go online (403 KYC_REQUIRED)', async ({ request }) => {
    const driver = await mintDriver(request); // no KYC approval
    const res = await post(request, '/drivers/online', driver.token, VELLORE);
    expect(res.status()).toBe(403);
    expect((await res.json()).error?.code).toBe('KYC_REQUIRED');
  });
});
