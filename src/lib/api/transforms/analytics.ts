/**
 * Analytics transforms — strict (`throw` on a missing/non-numeric field; the SQL aggregation
 * functions always supply every key, `coalesce`'d, so a gap means a contract break). One-way
 * snake_case → camelCase; never compute here — the numbers come straight from Postgres.
 */
import type { AdminDashboard, AgentAnalytics, ApiEndpointMetric, ApiMetricsSummary, DriverAnalytics, MonthlyEarningsPoint, MonthlyTripPoint } from '@/types';

export type AnalyticsTransformErrorCode = 'NOT_OBJECT' | 'MISSING_FIELD' | 'BAD_NUMBER' | 'BAD_ARRAY';
export class AnalyticsTransformError extends Error {
  constructor(message: string, public code: AnalyticsTransformErrorCode, public context: Record<string, unknown> = {}) {
    super(message);
    this.name = 'AnalyticsTransformError';
  }
}

type Api = Record<string, unknown>;

function obj(v: unknown, what: string): Api {
  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    throw new AnalyticsTransformError(`${what} is not an object`, 'NOT_OBJECT', { value: v });
  }
  return v as Api;
}
function num(api: Api, key: string): number {
  const v = api[key];
  if (v === undefined || v === null) throw new AnalyticsTransformError(`missing "${key}"`, 'MISSING_FIELD', { api });
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new AnalyticsTransformError(`"${key}" is not a finite number`, 'BAD_NUMBER', { key, value: v });
  return n;
}
function str(api: Api, key: string): string {
  const v = api[key];
  if (typeof v !== 'string' || v.length === 0) throw new AnalyticsTransformError(`missing/empty "${key}"`, 'MISSING_FIELD', { api });
  return v;
}
/** A `{ k: count, … }` map — every value coerced through `num`. */
function countMap(v: unknown, what: string): Record<string, number> {
  const o = obj(v, what);
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(o)) {
    const n = typeof val === 'string' ? Number(val) : val;
    if (typeof n !== 'number' || !Number.isFinite(n)) throw new AnalyticsTransformError(`"${what}.${k}" is not a finite number`, 'BAD_NUMBER', { value: val });
    out[k] = n;
  }
  return out;
}
function monthlySeries(v: unknown, what: string): MonthlyTripPoint[] {
  if (!Array.isArray(v)) throw new AnalyticsTransformError(`${what} is not an array`, 'BAD_ARRAY', { value: v });
  return v.map((row, i) => {
    const r = obj(row, `${what}[${i}]`);
    return { month: str(r, 'month'), posted: num(r, 'posted'), completed: num(r, 'completed') };
  });
}
function earningsSeries(v: unknown, what: string): MonthlyEarningsPoint[] {
  if (!Array.isArray(v)) throw new AnalyticsTransformError(`${what} is not an array`, 'BAD_ARRAY', { value: v });
  return v.map((row, i) => {
    const r = obj(row, `${what}[${i}]`);
    return { month: str(r, 'month'), completed: num(r, 'completed'), earnings: num(r, 'earnings') };
  });
}

export function transformAdminDashboard(api: unknown): AdminDashboard {
  const a = obj(api, 'admin dashboard');
  return {
    usersTotal: num(a, 'users_total'),
    usersByRole: countMap(a.users_by_role, 'users_by_role'),
    driversTotal: num(a, 'drivers_total'),
    driversByKyc: countMap(a.drivers_by_kyc, 'drivers_by_kyc'),
    agentsTotal: num(a, 'agents_total'),
    agentsByKyc: countMap(a.agents_by_kyc, 'agents_by_kyc'),
    vehiclesTotal: num(a, 'vehicles_total'),
    vehiclesByEligibility: countMap(a.vehicles_by_eligibility, 'vehicles_by_eligibility'),
    tripsTotal: num(a, 'trips_total'),
    tripsByStatus: countMap(a.trips_by_status, 'trips_by_status'),
    fareCompletedTotal: num(a, 'fare_completed_total'),
    commissionCompletedTotal: num(a, 'commission_completed_total'),
    driverPayoutCompletedTotal: num(a, 'driver_payout_completed_total'),
    vacanciesByStatus: countMap(a.vacancies_by_status, 'vacancies_by_status'),
    alertsActive: num(a, 'alerts_active'),
    reviewsTotal: num(a, 'reviews_total'),
    reviewsFlagged: num(a, 'reviews_flagged'),
    notificationsUnread: num(a, 'notifications_unread'),
    tripsMonthly: monthlySeries(a.trips_monthly, 'trips_monthly'),
    generatedAt: str(a, 'generated_at'),
  };
}

export function transformAgentAnalytics(api: unknown): AgentAnalytics {
  const a = obj(api, 'agent analytics');
  return {
    agentUserId: str(a, 'agent_user_id'),
    tripsPosted: num(a, 'trips_posted'),
    tripsByStatus: countMap(a.trips_by_status, 'trips_by_status'),
    farePostedTotal: num(a, 'fare_posted_total'),
    fareCompletedTotal: num(a, 'fare_completed_total'),
    driverPayoutCompletedTotal: num(a, 'driver_payout_completed_total'),
    avgRatePerKm: num(a, 'avg_rate_per_km'),
    applicantsReceivedTotal: num(a, 'applicants_received_total'),
    uniqueDriversAssigned: num(a, 'unique_drivers_assigned'),
    reviewsReceived: num(a, 'reviews_received'),
    avgReviewScore: num(a, 'avg_review_score'),
    monthly: monthlySeries(a.monthly, 'monthly'),
    generatedAt: str(a, 'generated_at'),
  };
}

export function transformDriverAnalytics(api: unknown): DriverAnalytics {
  const a = obj(api, 'driver analytics');
  return {
    driverUserId: str(a, 'driver_user_id'),
    hasDriverProfile: a.has_driver_profile === true,
    tripsAssigned: num(a, 'trips_assigned'),
    tripsByStatus: countMap(a.trips_by_status, 'trips_by_status'),
    tripsCompleted: num(a, 'trips_completed'),
    earningsTotal: num(a, 'earnings_total'),
    earningsPending: num(a, 'earnings_pending'),
    distanceCompletedKm: num(a, 'distance_completed_km'),
    applicationsTotal: num(a, 'applications_total'),
    applicationsPending: num(a, 'applications_pending'),
    applicationsSelected: num(a, 'applications_selected'),
    reviewsReceived: num(a, 'reviews_received'),
    avgReviewScore: num(a, 'avg_review_score'),
    monthly: earningsSeries(a.monthly, 'monthly'),
    generatedAt: str(a, 'generated_at'),
  };
}

function transformApiEndpointMetric(api: unknown, i: number): ApiEndpointMetric {
  const a = obj(api, `endpoints[${i}]`);
  return {
    endpoint: str(a, 'endpoint'),
    count: num(a, 'count'),
    errors: num(a, 'errors'),
    avgMs: num(a, 'avg_ms'),
    maxMs: num(a, 'max_ms'),
    p95Ms: num(a, 'p95_ms'),
  };
}

export function transformApiMetricsSummary(api: unknown): ApiMetricsSummary {
  const a = obj(api, 'api-metrics summary');
  if (!Array.isArray(a.endpoints)) throw new AnalyticsTransformError('endpoints is not an array', 'BAD_ARRAY', { value: a.endpoints });
  return {
    hours: num(a, 'hours'),
    since: str(a, 'since'),
    generatedAt: str(a, 'generated_at'),
    total: num(a, 'total'),
    errors: num(a, 'errors'),
    endpoints: a.endpoints.map(transformApiEndpointMetric),
  };
}
