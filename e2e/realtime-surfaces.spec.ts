/**
 * Realtime live agent surfaces (PR #324) — the agent's open page reflects a change made
 * elsewhere WITHOUT a manual reload. The Supabase Realtime websocket is a SIGNAL ("a row
 * changed, refetch") — the data still flows through the REST API; React Query polling is the
 * fallback when the socket is unavailable. This spec asserts the user-visible contract (the
 * surface updates on its own); a 20s budget covers both the realtime push and the ≤15s
 * applicants polling fallback, so it's green whether or not Realtime env is configured in CI.
 *
 * Real-API setup via helpers-api.ts (no precondition stubs — docs/TEST_POLICY.md).
 */
import { test, expect } from '@playwright/test';
import { mintAdmin, mintAgent, mintDriver, mintVehicle, postTrip, applyToTrip, loginAs } from './helpers-api';

const qase = (id: string) => [{ type: 'qase', description: id }];
test.setTimeout(60_000);
test.describe.configure({ retries: 1 });

test.describe('Realtime live agent surfaces (PR #324)', () => {
  test('RT1 — a new applicant appears on the agent\'s open applicants page without a manual reload', {
    annotation: qase('RT1'),
  }, async ({ page, request }) => {
    const admin = await mintAdmin(request);
    const agent = await mintAgent(request, { adminToken: admin.token, kyc: 'approved' });
    const driver = await mintDriver(request, { adminToken: admin.token, kyc: 'approved' });
    await mintVehicle(request, driver.token);
    const { tripId } = await postTrip(request, agent.token);

    await loginAs(page, agent);
    await page.goto(`/app/trips/${tripId}/applicants`);
    // Page is up and the trip has no applicants yet.
    await expect(page.getByRole('button', { name: /select this driver/i })).toHaveCount(0);

    // A driver applies via the API while the agent's page stays open (no reload).
    const uniqueMsg = `rt-apply-${Date.now()}`;
    await applyToTrip(request, driver.token, tripId, { message: uniqueMsg });

    // The applicant row arrives on its own (realtime push, or the ≤15s polling fallback).
    await expect(page.getByRole('button', { name: /select this driver/i }).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(uniqueMsg)).toBeVisible();
  });
});
