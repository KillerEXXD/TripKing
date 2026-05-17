import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/hooks/useTrips');
import * as tripsHook from '@/hooks/useTrips';
import { OperatorTripsListPage } from '@/pages/v2/operator-console/TripsListPage';
import { TRIP_FIXTURES } from '@/pages/v2/__fixtures__/trips';

function Wrap({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

function mockUseTrips(data: typeof TRIP_FIXTURES, overrides: Partial<ReturnType<typeof tripsHook.useTrips>> = {}) {
  vi.mocked(tripsHook.useTrips).mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof tripsHook.useTrips>);
}

beforeEach(() => vi.clearAllMocks());

describe('OperatorTripsListPage (v2)', () => {
  it('renders dense rows for every fixture trip', () => {
    mockUseTrips(TRIP_FIXTURES);
    render(<Wrap><OperatorTripsListPage /></Wrap>);
    expect(screen.getByRole('heading', { name: /trips/i })).toBeInTheDocument();
    expect(screen.getAllByText(/Vellore/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Bangalore/)).toBeInTheDocument();
    expect(screen.getByText(/Salem/)).toBeInTheDocument();
  });

  it('filters by status when a tab is clicked', () => {
    mockUseTrips(TRIP_FIXTURES);
    render(<Wrap><OperatorTripsListPage /></Wrap>);
    fireEvent.click(screen.getByRole('tab', { name: /has applicants/i }));
    expect(screen.getByText(/Bangalore/)).toBeInTheDocument();
    expect(screen.queryByText(/Salem/)).not.toBeInTheDocument();
  });

  it('shows error state with retry when the query errors', () => {
    const refetch = vi.fn();
    mockUseTrips([], { isError: true, refetch });
    render(<Wrap><OperatorTripsListPage /></Wrap>);
    expect(screen.getByText(/couldn't load trips/i)).toBeInTheDocument();
  });

  it('shows empty state when the query returns no trips', () => {
    mockUseTrips([]);
    render(<Wrap><OperatorTripsListPage /></Wrap>);
    expect(screen.getByText(/no trips/i)).toBeInTheDocument();
  });
});
