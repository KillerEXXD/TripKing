import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/hooks/useTrips');
import * as tripsHook from '@/hooks/useTrips';
import { PipelineTripsListPage } from '@/pages/v2/pipeline-board/TripsListPage';
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

describe('PipelineTripsListPage (v2)', () => {
  it('shows only the active column by default (has_applicants)', () => {
    mockUseTrips(TRIP_FIXTURES);
    render(<Wrap><PipelineTripsListPage /></Wrap>);
    // Default active column is has_applicants — only Bangalore→Tirupati appears
    expect(screen.getByText(/Bangalore/)).toBeInTheDocument();
    expect(screen.queryByText(/Salem/)).not.toBeInTheDocument();
  });

  it('switches columns when a chip is clicked', () => {
    mockUseTrips(TRIP_FIXTURES);
    render(<Wrap><PipelineTripsListPage /></Wrap>);
    fireEvent.click(screen.getByRole('tab', { name: /assigned/i }));
    expect(screen.getByText(/Salem/)).toBeInTheDocument();
    expect(screen.queryByText(/Bangalore/)).not.toBeInTheDocument();
  });

  it('exposes prev/next swipe affordances with column labels', () => {
    mockUseTrips(TRIP_FIXTURES);
    render(<Wrap><PipelineTripsListPage /></Wrap>);
    // has_applicants → prev=Open, next=Assigned
    expect(screen.getByRole('button', { name: /previous column: open/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next column: assigned/i })).toBeInTheDocument();
  });

  it('shows empty-column state when the active column has no trips', () => {
    mockUseTrips(TRIP_FIXTURES);
    render(<Wrap><PipelineTripsListPage /></Wrap>);
    fireEvent.click(screen.getByRole('tab', { name: /completed/i }));
    expect(screen.getByText(/empty column/i)).toBeInTheDocument();
  });
});
