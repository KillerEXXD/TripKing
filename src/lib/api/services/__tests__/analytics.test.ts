import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient } from '@/lib/api/client';
import { getAdminDashboard, getAgentAnalytics, getApiMetricsSummary } from '@/lib/api/services/analytics';

function ok<T>(data: T) {
  return Promise.resolve({ success: true, data, error: null } as const);
}

// Complete blobs — the analytics transforms are strict (throw on a missing/non-numeric field).
const ADMIN_BLOB = {
  users_total: 12,
  users_by_role: { driver: 8, trip_manager: 3, admin: 1 },
  drivers_total: 8,
  drivers_by_kyc: { pending: 2, approved: 6 },
  agents_total: 3,
  agents_by_kyc: { approved: 3 },
  vehicles_total: 6,
  vehicles_by_eligibility: { eligible: 5, expiring_soon: 1 },
  trips_total: 20,
  trips_by_status: { open: 4, completed: 14, cancelled: 2 },
  fare_completed_total: 274000,
  commission_completed_total: 27400,
  driver_payout_completed_total: 240000,
  vacancies_by_status: { active: 2, expired: 1 },
  alerts_active: 5,
  reviews_total: 11,
  reviews_flagged: 1,
  notifications_unread: 3,
  trips_monthly: [{ month: '2026-05', posted: 5, completed: 4 }],
  generated_at: '2026-05-13T00:00:00.000Z',
};
const AGENT_BLOB = {
  agent_user_id: 'u-1',
  display_handle: 'A1B2C3D',
  trips_posted: 9,
  trips_by_status: { open: 1, completed: 7, cancelled: 1 },
  fare_posted_total: 120000,
  fare_completed_total: 98000,
  driver_payout_completed_total: 85000,
  avg_rate_per_km: 14.5,
  applicants_received_total: 23,
  unique_drivers_assigned: 5,
  reviews_received: 4,
  avg_review_score: 4.75,
  monthly: [{ month: '2026-05', posted: 2, completed: 1 }],
  generated_at: '2026-05-13T00:00:00.000Z',
};
const METRICS_BLOB = {
  hours: 24,
  since: '2026-05-12T00:00:00.000Z',
  generated_at: '2026-05-13T00:00:00.000Z',
  total: 1200,
  errors: 3,
  endpoints: [{ endpoint: 'GET /trips', count: 800, errors: 1, avg_ms: 42, max_ms: 510, p95_ms: 110 }],
};

describe('analytics service', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('getAdminDashboard → GET /analytics/admin, mapped via transformAdminDashboard', async () => {
    const get = vi.spyOn(apiClient, 'get').mockReturnValue(ok(ADMIN_BLOB) as never);
    const d = await getAdminDashboard();
    expect(get).toHaveBeenCalledWith('/analytics/admin');
    expect(d.usersTotal).toBe(12);
    expect(d.tripsByStatus.completed).toBe(14);
    expect(d.fareCompletedTotal).toBe(274000);
  });

  it('getAgentAnalytics → GET /analytics/agent (no params for the caller; user_id for an admin lookup)', async () => {
    const get = vi.spyOn(apiClient, 'get').mockReturnValue(ok(AGENT_BLOB) as never);
    const a = await getAgentAnalytics();
    expect(get).toHaveBeenCalledWith('/analytics/agent', undefined);
    expect(a.agentUserId).toBe('u-1');
    expect(a.tripsPosted).toBe(9);

    get.mockClear();
    await getAgentAnalytics('u-42');
    expect(get).toHaveBeenCalledWith('/analytics/agent', { user_id: 'u-42' });
  });

  it('getApiMetricsSummary → GET /analytics/api-metrics with the hours window (or none)', async () => {
    const get = vi.spyOn(apiClient, 'get').mockReturnValue(ok(METRICS_BLOB) as never);
    const m = await getApiMetricsSummary(6);
    expect(get).toHaveBeenCalledWith('/analytics/api-metrics', { hours: 6 });
    expect(m.endpoints[0].endpoint).toBe('GET /trips');

    get.mockClear();
    await getApiMetricsSummary();
    expect(get).toHaveBeenCalledWith('/analytics/api-metrics', undefined);
  });
});
