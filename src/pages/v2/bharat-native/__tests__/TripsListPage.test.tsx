import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/hooks/useTrips');
import * as tripsHook from '@/hooks/useTrips';
import { BharatTripsListPage } from '@/pages/v2/bharat-native/TripsListPage';
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

describe('BharatTripsListPage (v6)', () => {
  it('renders bilingual header + Tamil city names from the pack', () => {
    mockUseTrips(TRIP_FIXTURES);
    render(<Wrap><BharatTripsListPage /></Wrap>);
    expect(screen.getByRole('heading', { name: /டிரிப்கள்/ })).toBeInTheDocument();
    // Vellore translates to வேலூர் via the city pack
    expect(screen.getAllByText(/வேலூர்/).length).toBeGreaterThan(0);
  });

  it('filters to open/has_applicants when the New tile is tapped', () => {
    mockUseTrips(TRIP_FIXTURES);
    render(<Wrap><BharatTripsListPage /></Wrap>);
    fireEvent.click(screen.getByRole('button', { name: /புதிய/ }));
    // Bangalore→Tirupati (has_applicants) should still be visible
    expect(screen.getByText(/பெங்களூரு/)).toBeInTheDocument();
    // Salem (accepted) should not
    expect(screen.queryByText(/சேலம்/)).not.toBeInTheDocument();
  });

  it('shows empty state when filter has no matches', () => {
    mockUseTrips(TRIP_FIXTURES);
    render(<Wrap><BharatTripsListPage /></Wrap>);
    fireEvent.click(screen.getByRole('button', { name: /ரத்து/ }));
    expect(screen.getByText(/no trips/i)).toBeInTheDocument();
  });
});
