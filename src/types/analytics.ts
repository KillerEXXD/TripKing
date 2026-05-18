/** Server-computed analytics blobs — the `/app/analytics/{admin,agent,driver,api-metrics}` payloads. */

/** A point on the rolling 6-month trip series (`trips_monthly` / agent `monthly`). */
export interface MonthlyTripPoint {
  /** `YYYY-MM`. */
  month: string;
  posted: number;
  completed: number;
}

/** A point on a driver's rolling 6-month earnings series (`monthly` on `/app/analytics/driver`). */
export interface MonthlyEarningsPoint {
  /** `YYYY-MM`. */
  month: string;
  completed: number;
  /** ₹ — sum of `driver_payout` over the trips completed that month. */
  earnings: number;
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

/** `GET /analytics/driver` — one driver's earnings & history (their own, or `?user_id=` for admins). */
export interface DriverAnalytics {
  driverUserId: string;
  /** false (and every count 0) if the user isn't a driver. */
  hasDriverProfile: boolean;
  tripsAssigned: number;
  tripsByStatus: Record<string, number>;
  tripsCompleted: number;
  /** ₹ — sum of `driver_payout` over completed trips. */
  earningsTotal: number;
  /** ₹ — sum of `driver_payout` over assigned + in-progress trips (not yet earned). */
  earningsPending: number;
  distanceCompletedKm: number;
  applicationsTotal: number;
  applicationsPending: number;
  applicationsSelected: number;
  reviewsReceived: number;
  avgReviewScore: number;
  monthly: MonthlyEarningsPoint[];
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
