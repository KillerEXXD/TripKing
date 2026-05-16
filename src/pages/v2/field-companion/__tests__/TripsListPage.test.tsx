import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/hooks/useTrips');
import * as tripsHook from '@/hooks/useTrips';
import { FieldTripsListPage } from '@/pages/v2/field-companion/TripsListPage';
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

describe('FieldTripsListPage (v2)', () => {
  it('renders glanceable hero cards and the sticky CTA', () => {
    mockUseTrips(TRIP_FIXTURES);
    render(<Wrap><FieldTripsListPage /></Wrap>);
    expect(screen.getByRole('heading', { name: /trips near you/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /find trips near me/i })).toBeInTheDocument();
    // Both city names appear in each card's header strip + headline; check at least one card rendered
    expect(screen.getAllByText(/Vellore/).length).toBeGreaterThan(0);
  });

  it('shows loading skeleton while fetching', () => {
    mockUseTrips([], { isLoading: true });
    const { container } = render(<Wrap><FieldTripsListPage /></Wrap>);
    expect(container.querySelectorAll('[class*="animate-pulse"]').length).toBeGreaterThan(0);
  });

  it('shows empty state when no trips', () => {
    mockUseTrips([]);
    render(<Wrap><FieldTripsListPage /></Wrap>);
    expect(screen.getByText(/no trips right now/i)).toBeInTheDocument();
  });
});
