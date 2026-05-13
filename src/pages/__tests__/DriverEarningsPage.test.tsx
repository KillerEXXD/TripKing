import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DriverEarningsPage } from '@/pages/DriverEarningsPage';
import type { DriverAnalytics } from '@/types';

vi.mock('@/hooks/useAnalytics', () => ({ useDriverAnalytics: vi.fn() }));
import { useDriverAnalytics } from '@/hooks/useAnalytics';
vi.mock('@/components/analytics', () => ({ MonthlyEarningsChart: () => <div data-testid="earnings-chart" /> }));

const ANALYTICS: DriverAnalytics = {
  driverUserId: 'u-1',
  hasDriverProfile: true,
  tripsAssigned: 6,
  tripsByStatus: { assigned: 1, completed: 5 },
  tripsCompleted: 5,
  earningsTotal: 110000,
  earningsPending: 22000,
  distanceCompletedKm: 700,
  applicationsTotal: 12,
  applicationsPending: 2,
  applicationsSelected: 5,
  reviewsReceived: 3,
  avgReviewScore: 4.6,
  monthly: [{ month: '2026-05', completed: 2, earnings: 44000 }],
  generatedAt: '2026-05-13T08:00:00.000Z',
};

type Q = { isPending?: boolean; isError?: boolean; data?: unknown; refetch?: () => void };
function setQ(q: Q) {
  vi.mocked(useDriverAnalytics).mockReturnValue({ isPending: false, isError: false, refetch: vi.fn(), ...q } as never);
}
const renderPage = () => render(<MemoryRouter><DriverEarningsPage /></MemoryRouter>);

describe('DriverEarningsPage', () => {
  beforeEach(() => {
    vi.mocked(useDriverAnalytics).mockReset();
    setQ({ data: ANALYTICS });
  });

  it('renders the earnings stats, the by-status breakdown, the chart and a link to your trips', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /your earnings/i })).toBeInTheDocument();
    expect(screen.getByText(/₹1,10,000/)).toBeInTheDocument(); // earned
    expect(screen.getByText(/₹22,000/)).toBeInTheDocument(); // pending
    expect(screen.getByText(/across 5 completed trips/i)).toBeInTheDocument();
    expect(screen.getByText(/5 won · 2 pending/i)).toBeInTheDocument();
    expect(screen.getByText(/Your assigned trips by status/i)).toBeInTheDocument();
    expect(screen.getByTestId('earnings-chart')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /see all your trips/i })).toHaveAttribute('href', '/my-trips');
  });

  it('shows the empty state (with a Browse CTA) when the driver has no assigned trips', () => {
    setQ({ data: { ...ANALYTICS, hasDriverProfile: true, tripsAssigned: 0, monthly: [] } });
    renderPage();
    expect(screen.getByText(/no earnings yet/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /browse trips/i })).toHaveAttribute('href', '/trips');
    expect(screen.queryByTestId('earnings-chart')).toBeNull();
  });

  it('the empty state explains the next step when there is no driver profile', () => {
    setQ({ data: { ...ANALYTICS, hasDriverProfile: false, tripsAssigned: 0 } });
    renderPage();
    expect(screen.getByText(/set up your driver profile/i)).toBeInTheDocument();
  });

  it('surfaces an error', () => {
    setQ({ isError: true });
    renderPage();
    expect(screen.getByText(/couldn't load your earnings/i)).toBeInTheDocument();
  });
});
