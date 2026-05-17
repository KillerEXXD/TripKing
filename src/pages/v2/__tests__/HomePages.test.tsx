import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TRIP_FIXTURES } from '@/pages/v2/__fixtures__/trips';

vi.mock('@/hooks/useTrips');
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', role: 'driver', displayName: 'Karthik M', phone: '+919876543210' },
    isAuthenticated: true,
    isLoading: false,
  }),
}));
import * as tripsHook from '@/hooks/useTrips';

import { OperatorHomePage } from '@/pages/v2/operator-console/HomePage';
import { FieldHomePage } from '@/pages/v2/field-companion/HomePage';
import { PipelineHomePage } from '@/pages/v2/pipeline-board/HomePage';
import { EditorialHomePage } from '@/pages/v2/editorial/HomePage';
import { BharatHomePage } from '@/pages/v2/bharat-native/HomePage';

function Wrap({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

function mockTrips(data: typeof TRIP_FIXTURES, overrides: Partial<ReturnType<typeof tripsHook.useTrips>> = {}) {
  vi.mocked(tripsHook.useTrips).mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof tripsHook.useTrips>);
}

beforeEach(() => vi.clearAllMocks());

describe('v2 home pages', () => {
  it('Operator: shows dashboard stat tiles + live feed', () => {
    mockTrips(TRIP_FIXTURES);
    render(<Wrap><OperatorHomePage /></Wrap>);
    expect(screen.getByText(/Dashboard/i)).toBeInTheDocument();
    expect(screen.getByText(/Need action/i)).toBeInTheDocument();
    expect(screen.getByText(/Browse all trips/i)).toBeInTheDocument();
  });

  it('Field: shows first-name greeting + nearby count + Find CTA', () => {
    mockTrips(TRIP_FIXTURES);
    render(<Wrap><FieldHomePage /></Wrap>);
    expect(screen.getByRole('heading', { name: /Karthik/i })).toBeInTheDocument();
    expect(screen.getByText(/Trips nearby/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /find trips near me/i })).toBeInTheDocument();
  });

  it('Pipeline: shows 5 pipeline-column tiles with counts', () => {
    mockTrips(TRIP_FIXTURES);
    render(<Wrap><PipelineHomePage /></Wrap>);
    expect(screen.getByRole('region', { name: /pipeline overview/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open the full board/i })).toBeInTheDocument();
  });

  it('Editorial: shows masthead + The headline + In this issue', () => {
    mockTrips(TRIP_FIXTURES);
    render(<Wrap><EditorialHomePage /></Wrap>);
    expect(screen.getByText(/today's edition/i)).toBeInTheDocument();
    expect(screen.getByText(/the headline/i)).toBeInTheDocument();
    expect(screen.getByText(/in this issue/i)).toBeInTheDocument();
  });

  it('Bharat: shows bilingual greeting + icon menu + new-trips list', () => {
    mockTrips(TRIP_FIXTURES);
    render(<Wrap><BharatHomePage /></Wrap>);
    expect(screen.getByText(/வணக்கம்/)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /menu/i })).toBeInTheDocument();
    expect(screen.getAllByText(/டிரிப்கள்/).length).toBeGreaterThan(0);
  });
});
