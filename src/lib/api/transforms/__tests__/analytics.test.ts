import { describe, it, expect } from 'vitest';
import { AnalyticsTransformError, transformAdminDashboard, transformAgentAnalytics, transformApiMetricsSummary } from '@/lib/api/transforms/analytics';

const ADMIN = {
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
  trips_monthly: [
    { month: '2026-01', posted: 3, completed: 1 },
    { month: '2026-02', posted: 5, completed: 4 },
  ],
  generated_at: '2026-05-13T00:00:00.000Z',
};

const AGENT = {
  agent_user_id: 'u-1',
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

const METRICS = {
  hours: 24,
  since: '2026-05-12T00:00:00.000Z',
  generated_at: '2026-05-13T00:00:00.000Z',
  total: 1200,
  errors: 3,
  endpoints: [
    { endpoint: 'GET /trips', count: 800, errors: 1, avg_ms: 42, max_ms: 510, p95_ms: 110 },
    { endpoint: 'POST /trips', count: 40, errors: 2, avg_ms: 120, max_ms: 900, p95_ms: 300 },
  ],
};

describe('analytics transforms', () => {
  it('transformAdminDashboard maps the platform blob to camelCase', () => {
    const d = transformAdminDashboard(ADMIN);
    expect(d.usersTotal).toBe(12);
    expect(d.usersByRole).toEqual({ driver: 8, trip_manager: 3, admin: 1 });
    expect(d.tripsByStatus.completed).toBe(14);
    expect(d.fareCompletedTotal).toBe(274000);
    expect(d.commissionCompletedTotal).toBe(27400);
    expect(d.tripsMonthly).toEqual([
      { month: '2026-01', posted: 3, completed: 1 },
      { month: '2026-02', posted: 5, completed: 4 },
    ]);
    expect(d.generatedAt).toBe('2026-05-13T00:00:00.000Z');
  });

  it('transformAgentAnalytics maps an agent blob', () => {
    const a = transformAgentAnalytics(AGENT);
    expect(a.agentUserId).toBe('u-1');
    expect(a.tripsPosted).toBe(9);
    expect(a.avgRatePerKm).toBe(14.5);
    expect(a.avgReviewScore).toBe(4.75);
    expect(a.monthly).toEqual([{ month: '2026-05', posted: 2, completed: 1 }]);
  });

  it('transformApiMetricsSummary maps the rollup + per-endpoint rows', () => {
    const m = transformApiMetricsSummary(METRICS);
    expect(m.hours).toBe(24);
    expect(m.total).toBe(1200);
    expect(m.endpoints).toHaveLength(2);
    expect(m.endpoints[0]).toEqual({ endpoint: 'GET /trips', count: 800, errors: 1, avgMs: 42, maxMs: 510, p95Ms: 110 });
  });

  it('throws AnalyticsTransformError on a missing required field', () => {
    expect(() => transformAdminDashboard({ ...ADMIN, users_total: undefined })).toThrow(AnalyticsTransformError);
    expect(() => transformAdminDashboard({ ...ADMIN, generated_at: '' })).toThrow(AnalyticsTransformError);
    expect(() => transformAgentAnalytics({ ...AGENT, agent_user_id: undefined })).toThrow(AnalyticsTransformError);
  });

  it('throws on a non-numeric count or a malformed series', () => {
    expect(() => transformAdminDashboard({ ...ADMIN, users_by_role: { driver: 'lots' } })).toThrow(AnalyticsTransformError);
    expect(() => transformAdminDashboard({ ...ADMIN, trips_monthly: [{ month: '2026-01', posted: 'x', completed: 1 }] })).toThrow(AnalyticsTransformError);
    expect(() => transformAdminDashboard({ ...ADMIN, trips_monthly: 'nope' })).toThrow(AnalyticsTransformError);
  });

  it('throws when the blob is null or not an object', () => {
    expect(() => transformAdminDashboard(null)).toThrow(AnalyticsTransformError);
    expect(() => transformAgentAnalytics([])).toThrow(AnalyticsTransformError);
    expect(() => transformApiMetricsSummary({ ...METRICS, endpoints: 'nope' })).toThrow(AnalyticsTransformError);
  });
});
