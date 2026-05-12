import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminDashboardPage } from '@/pages/administration/AdminDashboardPage';
import type { AdminDashboard, ApiMetricsSummary } from '@/types';

vi.mock('@/hooks/useAnalytics', () => ({ useAdminDashboard: vi.fn(), useApiMetricsSummary: vi.fn() }));
import { useAdminDashboard, useApiMetricsSummary } from '@/hooks/useAnalytics';
vi.mock('@/components/analytics', () => ({ TripsMonthlyChart: () => <div data-testid="trips-chart" /> }));

const DASH: AdminDashboard = {
  usersTotal: 12,
  usersByRole: { driver: 8, trip_manager: 3, admin: 1 },
  driversTotal: 8,
  driversByKyc: { pending: 2, approved: 6 },
  agentsTotal: 3,
  agentsByKyc: { approved: 3 },
  vehiclesTotal: 6,
  vehiclesByEligibility: { eligible: 5, expiring_soon: 1 },
  tripsTotal: 20,
  tripsByStatus: { open: 4, completed: 14, cancelled: 2 },
  fareCompletedTotal: 274000,
  commissionCompletedTotal: 27400,
  driverPayoutCompletedTotal: 240000,
  vacanciesByStatus: { active: 2, expired: 1 },
  alertsActive: 5,
  reviewsTotal: 11,
  reviewsFlagged: 1,
  notificationsUnread: 3,
  tripsMonthly: [{ month: '2026-05', posted: 5, completed: 4 }],
  generatedAt: '2026-05-13T08:00:00.000Z',
};
const METRICS: ApiMetricsSummary = {
  hours: 24,
  since: '2026-05-12T08:00:00.000Z',
  generatedAt: '2026-05-13T08:00:00.000Z',
  total: 1200,
  errors: 2,
  endpoints: [{ endpoint: 'GET /trips', count: 800, errors: 0, avgMs: 42, maxMs: 510, p95Ms: 110 }],
};

type Q = { isPending?: boolean; isError?: boolean; data?: unknown; refetch?: () => void };
function setDash(q: Q) {
  vi.mocked(useAdminDashboard).mockReturnValue({ isPending: false, isError: false, refetch: vi.fn(), ...q } as never);
}
function setMetrics(q: Q) {
  vi.mocked(useApiMetricsSummary).mockReturnValue({ isPending: false, isError: false, refetch: vi.fn(), ...q } as never);
}
function renderPage() {
  return render(<MemoryRouter><AdminDashboardPage /></MemoryRouter>);
}

describe('AdminDashboardPage', () => {
  beforeEach(() => {
    vi.mocked(useAdminDashboard).mockReset();
    vi.mocked(useApiMetricsSummary).mockReset();
    setDash({ data: DASH });
    setMetrics({ data: METRICS });
  });

  it('renders the headline figures, the breakdowns, the chart and the API-metrics table', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /platform dashboard/i })).toBeInTheDocument();
    // headline numbers
    expect(screen.getByText('12')).toBeInTheDocument(); // users total
    expect(screen.getByText('20')).toBeInTheDocument(); // trips total
    // money cards
    expect(screen.getByText(/₹2,74,000/)).toBeInTheDocument();
    expect(screen.getByText(/₹27,400/)).toBeInTheDocument();
    // a breakdown row
    expect(screen.getByText('completed')).toBeInTheDocument();
    // the chart stub
    expect(screen.getByTestId('trips-chart')).toBeInTheDocument();
    // api-metrics table
    expect(screen.getByText(/API metrics — last 24h/i)).toBeInTheDocument();
    expect(screen.getByText('GET /trips')).toBeInTheDocument();
    expect(screen.getByText(/1,200 requests/)).toBeInTheDocument();
  });

  it('keeps the header in the loading state and surfaces an error', () => {
    setDash({ isPending: true });
    const { rerender } = renderPage();
    expect(screen.getByRole('heading', { name: /platform dashboard/i })).toBeInTheDocument(); // header is always there
    setDash({ isError: true });
    rerender(<MemoryRouter><AdminDashboardPage /></MemoryRouter>);
    expect(screen.getByText(/couldn't load the dashboard/i)).toBeInTheDocument();
  });
});
