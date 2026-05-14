import { test, expect } from '@playwright/test';
import { AGENT_USER, agentRow, openTripRow, signInAsAgent, stubApi, VERIFICATION_APPROVED } from './helpers';

/**
 * Step-5 UI invariant: a pre-reveal driver/vacancy/trip row never exposes a name/phone the server
 * didn't send. The card renders the opaque handle instead, and the "Invite to trip" flow posts to
 * /vacancy-invitations.
 */

test.describe('PII gating — vacancies list (pre-reveal)', () => {
  test('renders the driver handle, never a name the API did not send', async ({ page }) => {
    await stubApi(page, {
      user: AGENT_USER,
      paths: {
        '/agents/me': () => agentRow(VERIFICATION_APPROVED),
        '/vacancies': () => [
          {
            id: 'vac-1',
            driver_id: 'd-1',
            // pre-reveal: NO full_name / phone / email / profile_photo_url on the driver row
            driver: {
              id: 'd-1',
              user_id: 'u-driver-1',
              display_handle: 'AHANDLE1',
              rating_avg: 4.7,
              rating_count: 9,
              total_trips_completed: 30,
              top_tags: ['Punctual'],
              current_city: { id: 'city-e2e', name: 'Vellore', state: 'TN', lat: 12.92, lng: 79.13, sort_order: 1, is_active: true },
            },
            current_city: { id: 'city-e2e', name: 'Vellore', state: 'TN', lat: 12.92, lng: 79.13, sort_order: 1, is_active: true },
            available_from: '2099-06-01T00:00:00Z',
            destination_cities: [{ id: 'city-e2e-2', name: 'Chennai', state: 'TN', lat: 13.08, lng: 80.27, sort_order: 2, is_active: true }],
            destination_places: [],
            status: 'active',
            created_at: '2026-05-13T10:00:00Z',
          },
        ],
      },
    });

    await signInAsAgent(page);
    await page.goto('/vacancies');

    // Card shows the handle (in either the primary name slot or the secondary line)
    await expect(page.locator('main, body').first()).toContainText('AHANDLE1');
    // Card must NOT include an unrelated "secret" — there's no name in the response so the page
    // should not have invented one.
    await expect(page.getByText(/Ravi|Kumar|Suresh/i)).toHaveCount(0);
    // The Invite-to-trip button is visible for an agent caller
    await expect(page.getByRole('button', { name: /invite to trip/i })).toBeVisible();
  });

  test('Invite-to-trip flow POSTs the vacancy + trip ids', async ({ page }) => {
    let invitePostBody: Record<string, unknown> | null = null;
    await stubApi(page, {
      user: AGENT_USER,
      paths: {
        '/agents/me': () => agentRow(VERIFICATION_APPROVED),
        '/vacancies': () => [
          {
            id: 'vac-1',
            driver_id: 'd-1',
            driver: { id: 'd-1', user_id: 'u-driver-1', display_handle: 'AHANDLE1', rating_avg: 4.7, rating_count: 9, total_trips_completed: 30, top_tags: [], current_city: { id: 'city-e2e', name: 'Vellore', state: 'TN', lat: 12.92, lng: 79.13, sort_order: 1, is_active: true } },
            current_city: { id: 'city-e2e', name: 'Vellore', state: 'TN', lat: 12.92, lng: 79.13, sort_order: 1, is_active: true },
            available_from: '2099-06-01T00:00:00Z',
            destination_cities: [],
            destination_places: [],
            status: 'active',
            created_at: '2026-05-13T10:00:00Z',
          },
        ],
        '/trips': () => [openTripRow({ id: 'tr-open', status: 'open' })],
        '/vacancy-invitations': () => ({ id: 'inv-1', vacancy_id: 'vac-1', trip_id: 'tr-open', invited_by_user_id: AGENT_USER.id, driver_id: 'd-1', status: 'pending', expires_at: '2099-06-03T00:00:00Z', created_at: '2026-05-13T10:00:00Z', inviter_handle: 'AE2EAGT' }),
      },
    });
    // Intercept the POST specifically so we can capture the request body.
    await page.route(
      (url) => url.pathname.endsWith('/api/vacancy-invitations'),
      async (route) => {
        if (route.request().method() === 'POST') {
          try { invitePostBody = JSON.parse(route.request().postData() ?? '{}'); } catch { invitePostBody = {}; }
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { id: 'inv-1', vacancy_id: 'vac-1', trip_id: 'tr-open', invited_by_user_id: AGENT_USER.id, driver_id: 'd-1', status: 'pending', expires_at: '2099-06-03T00:00:00Z', created_at: '2026-05-13T10:00:00Z', inviter_handle: 'AE2EAGT' }, meta: null, error: null }) });
          return;
        }
        return route.continue();
      },
    );

    await signInAsAgent(page);
    await page.goto('/vacancies');
    await page.getByRole('button', { name: /invite to trip/i }).click();
    // The dialog lists the agent's one open trip
    await expect(page.getByText(/Vellore → Chennai/i)).toBeVisible();
    await page.getByRole('button', { name: /^invite$/i }).click();

    // Toast / dialog closes — give it a beat
    await expect.poll(() => invitePostBody, { timeout: 5000 }).not.toBeNull();
    expect(invitePostBody).toMatchObject({ vacancy_id: 'vac-1', trip_id: 'tr-open' });
  });
});
