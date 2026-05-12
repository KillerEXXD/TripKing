import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AgentAnalyticsPage } from '@/pages/AgentAnalyticsPage';
import type { AgentAnalytics } from '@/types';

vi.mock('@/hooks/useAnalytics', () => ({ useAgentAnalytics: vi.fn() }));
import { useAgentAnalytics } from '@/hooks/useAnalytics';
vi.mock('@/components/analytics', () => ({ TripsMonthlyChart: () => <div data-testid="trips-chart" /> }));

const ANALYTICS: AgentAnalytics = {
  agentUserId: 'u-1',
  tripsPosted: 9,
  tripsByStatus: { open: 1, completed: 7, cancelled: 1 },
  farePostedTotal: 120000,
  fareCompletedTotal: 98000,
  driverPayoutCompletedTotal: 85000,
  avgRatePerKm: 14.5,
  applicantsReceivedTotal: 23,
  uniqueDriversAssigned: 5,
  reviewsReceived: 4,
  avgReviewScore: 4.75,
  monthly: [{ month: '2026-05', posted: 2, completed: 1 }],
  generatedAt: '2026-05-13T08:00:00.000Z',
};

type Q = { isPending?: boolean; isError?: boolean; data?: unknown; refetch?: () => void };
function setQ(q: Q) {
  vi.mocked(useAgentAnalytics).mockReturnValue({ isPending: false, isError: false, refetch: vi.fn(), ...q } as never);
}
function renderPage() {
  return render(<MemoryRouter><AgentAnalyticsPage /></MemoryRouter>);
}

describe('AgentAnalyticsPage', () => {
  beforeEach(() => {
    vi.mocked(useAgentAnalytics).mockReset();
    setQ({ data: ANALYTICS });
  });

  it('renders the stats, the by-status breakdown and the chart for an agent with posted trips', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /your analytics/i })).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument(); // trips posted
    expect(screen.getByText('23')).toBeInTheDocument(); // applicants received
    expect(screen.getByText(/₹1,20,000/)).toBeInTheDocument(); // fare posted
    expect(screen.getByText(/₹14\.5/)).toBeInTheDocument(); // avg rate/km
    expect(screen.getByText(/Your trips by status/i)).toBeInTheDocument();
    expect(screen.getByTestId('trips-chart')).toBeInTheDocument();
  });

  it('shows an empty state (with a "Post a trip" CTA) when nothing has been posted', () => {
    setQ({ data: { ...ANALYTICS, tripsPosted: 0, monthly: [] } });
    renderPage();
    expect(screen.getByText(/no trips yet/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /post a trip/i })).toHaveAttribute('href', '/trips/new');
    expect(screen.queryByTestId('trips-chart')).toBeNull();
  });

  it('surfaces an error', () => {
    setQ({ isError: true });
    renderPage();
    expect(screen.getByText(/couldn't load your analytics/i)).toBeInTheDocument();
  });
});
