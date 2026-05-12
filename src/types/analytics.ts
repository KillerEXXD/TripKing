/** Server-computed analytics blobs — the `/analytics/admin`, `/analytics/agent`, `/analytics/api-metrics` payloads. */

/** A point on the rolling 6-month trip series (`trips_monthly` / `monthly`). */
export interface MonthlyTripPoint {
  /** `YYYY-MM`. */
  month: string;
  posted: number;
  completed: number;
}

/** `GET /analytics/admin` — platform-wide dashboard (admin only). */
export interface AdminDashboard {
  usersTotal: number;
  usersByRole: Record<string, number>;
  driversTotal: number;
  driversByKyc: Record<string, number>;
  agentsTotal: number;
  agentsByKyc: Record<string, number>;
  vehiclesTotal: number;
  vehiclesByEligibility: Record<string, number>;
  tripsTotal: number;
  tripsByStatus: Record<string, number>;
  /** ₹ — sum of `total_fare` over completed trips. */
  fareCompletedTotal: number;
  commissionCompletedTotal: number;
  driverPayoutCompletedTotal: number;
  vacanciesByStatus: Record<string, number>;
  alertsActive: number;
  reviewsTotal: number;
  reviewsFlagged: number;
  notificationsUnread: number;
  tripsMonthly: MonthlyTripPoint[];
  generatedAt: string;
}

/** `GET /analytics/agent` — one trip manager's analytics (their own, or `?user_id=` for admins). */
export interface AgentAnalytics {
  agentUserId: string;
  tripsPosted: number;
  tripsByStatus: Record<string, number>;
  farePostedTotal: number;
  fareCompletedTotal: number;
  driverPayoutCompletedTotal: number;
  avgRatePerKm: number;
  applicantsReceivedTotal: number;
  uniqueDriversAssigned: number;
  reviewsReceived: number;
  avgReviewScore: number;
  monthly: MonthlyTripPoint[];
  generatedAt: string;
}

/** One endpoint's row in the API-metrics rollup. */
export interface ApiEndpointMetric {
  endpoint: string;
  count: number;
  errors: number;
  avgMs: number;
  maxMs: number;
  p95Ms: number;
}

/** `GET /analytics/api-metrics?hours=` — per-endpoint latency/error rollup over the last `hours` (admin only). */
export interface ApiMetricsSummary {
  hours: number;
  since: string;
  generatedAt: string;
  total: number;
  errors: number;
  endpoints: ApiEndpointMetric[];
}
