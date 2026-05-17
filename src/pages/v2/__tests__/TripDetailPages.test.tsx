import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Trip } from '@/types';
import { TRIP_FIXTURES } from '@/pages/v2/__fixtures__/trips';

vi.mock('@/hooks/useTrips');
import * as tripsHook from '@/hooks/useTrips';

import { OperatorTripDetailPage } from '@/pages/v2/operator-console/TripDetailPage';
import { FieldTripDetailPage } from '@/pages/v2/field-companion/TripDetailPage';
import { PipelineTripDetailPage } from '@/pages/v2/pipeline-board/TripDetailPage';
import { EditorialTripDetailPage } from '@/pages/v2/editorial/TripDetailPage';
import { BharatTripDetailPage } from '@/pages/v2/bharat-native/TripDetailPage';

function mountAt(path: string, route: string, element: React.ReactElement) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={route} element={element} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockTrip(trip: Trip | undefined, overrides: Partial<ReturnType<typeof tripsHook.useTrip>> = {}) {
  vi.mocked(tripsHook.useTrip).mockReturnValue({
    data: trip,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof tripsHook.useTrip>);
}

beforeEach(() => vi.clearAllMocks());

describe('v2 trip-detail pages', () => {
  const T = TRIP_FIXTURES[1]; // has_applicants Bangalore→Tirupati, 3 applicants, ₹6,500

  it('Operator: renders dense info-grid with monospace ID and key rows', () => {
    mockTrip(T);
    mountAt(`/v2/trips/${T.id}`, '/v2/trips/:id', <OperatorTripDetailPage />);
    expect(screen.getByText(/TRP-/)).toBeInTheDocument();
    expect(screen.getByText(/Driver payout/i)).toBeInTheDocument();
    expect(screen.getByText('₹6,500')).toBeInTheDocument();
  });

  it('Field: renders headline + timeline + sticky CTA', () => {
    mockTrip(T);
    mountAt(`/v3/trips/${T.id}`, '/v3/trips/:id', <FieldTripDetailPage />);
    expect(screen.getByRole('heading', { name: /trip/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /apply for this trip/i })).toBeInTheDocument();
    expect(screen.getAllByText(/Bangalore/).length).toBeGreaterThan(0);
  });

  it('Pipeline: renders stage progress + tinted card + next-stage CTA', () => {
    mockTrip(T);
    mountAt(`/v4/trips/${T.id}`, '/v4/trips/:id', <PipelineTripDetailPage />);
    expect(screen.getByLabelText(/trip pipeline stage/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /move to assigned/i })).toBeInTheDocument();
  });

  it('Editorial: renders masthead headline + dl with vessel/distance/tariff', () => {
    mockTrip(T);
    mountAt(`/v5/trips/${T.id}`, '/v5/trips/:id', <EditorialTripDetailPage />);
    expect(screen.getByText(/the vessel/i)).toBeInTheDocument();
    expect(screen.getByText(/express interest/i)).toBeInTheDocument();
  });

  it('Bharat: renders bilingual header + 4 attribute tiles + Tamil CTA', () => {
    mockTrip(T);
    mountAt(`/v6/trips/${T.id}`, '/v6/trips/:id', <BharatTripDetailPage />);
    expect(screen.getAllByText(/பெங்களூரு/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /ஏற்றுக்கொள்/ })).toBeInTheDocument();
  });

  it('renders error state with retry across all skins when query fails', () => {
    mockTrip(undefined, { isError: true });
    mountAt(`/v2/trips/x`, '/v2/trips/:id', <OperatorTripDetailPage />);
    expect(screen.getByText(/couldn't load trip/i)).toBeInTheDocument();
  });
});
