import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/hooks/useTrips');
import * as tripsHook from '@/hooks/useTrips';
import { EditorialTripsListPage } from '@/pages/v2/editorial/TripsListPage';
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

describe('EditorialTripsListPage (v5)', () => {
  it('renders the masthead + feature cards for every trip', () => {
    mockUseTrips(TRIP_FIXTURES);
    render(<Wrap><EditorialTripsListPage /></Wrap>);
    expect(screen.getByRole('heading', { name: /on the road/i })).toBeInTheDocument();
    expect(screen.getAllByText(/Vellore/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Bangalore/)).toBeInTheDocument();
  });

  it('shows the press-paused empty state when no trips', () => {
    mockUseTrips([]);
    render(<Wrap><EditorialTripsListPage /></Wrap>);
    expect(screen.getByText(/press paused/i)).toBeInTheDocument();
  });
});
