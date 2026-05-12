import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TripFeedPage } from '@/pages/TripFeedPage';
import type { Trip } from '@/types';

vi.mock('@/hooks/useTrips', () => ({ useTrips: vi.fn() }));
import { useTrips } from '@/hooks/useTrips';
vi.mock('@/hooks/useAdminConfig', () => ({ cityHooks: { useList: vi.fn() }, carTypeHooks: { useList: vi.fn() } }));
import { carTypeHooks, cityHooks } from '@/hooks/useAdminConfig';

const city = (id: string, name: string) => ({ id, name, state: 'TN', lat: 12.9, lng: 79.1, sortOrder: 1, isActive: true });

function makeTrip(over: Partial<Trip> = {}): Trip {
  return {
    id: 't1',
    postedByUserId: 'u1',
    postedByRole: 'trip_manager',
    postedByName: 'Agent A',
    fromCity: city('c1', 'Vellore'),
    toCity: city('c2', 'Chennai'),
    pickupAt: '2026-06-01T09:00:00.000Z',
    expectedDistanceKm: 140,
    carTypeId: 'ct1',
    carTypeLabel: 'Sedan',
    seatsRequired: 4,
    acRequired: true,
    ratePerKm: 14,
    totalFare: 1960,
    commissionPct: 10,
    gstAmount: 98,
    driverBata: 300,
    extrasPaidByPassenger: true,
    driverPayout: 2200,
    passengerName: 'Passenger P',
    passengerPhone: '+910000000000',
    passengerCount: 2,
    status: 'open',
    showFareToPassenger: true,
    hidePassengerPhone: false,
    applicantCount: 0,
    createdAt: '2026-05-30T00:00:00.000Z',
    ...over,
  };
}

type TripsState = { isPending?: boolean; isError?: boolean; isSuccess?: boolean; data?: Trip[]; refetch?: () => void };
function setTrips(state: TripsState) {
  vi.mocked(useTrips).mockReturnValue({ isPending: false, isError: false, isSuccess: true, data: [], refetch: vi.fn(), ...state } as never);
}

function renderFeed() {
  return render(
    <MemoryRouter>
      <TripFeedPage />
    </MemoryRouter>,
  );
}

describe('TripFeedPage', () => {
  beforeEach(() => {
    vi.mocked(useTrips).mockReset();
    vi.mocked(cityHooks.useList).mockReset().mockReturnValue({ data: [city('c1', 'Vellore'), city('c2', 'Chennai')] } as never);
    vi.mocked(carTypeHooks.useList).mockReset().mockReturnValue({ data: [{ id: 'ct1', label: 'Sedan', sortOrder: 1, isActive: true }] } as never);
  });

  it('renders a loading skeleton while trips are pending', () => {
    setTrips({ isPending: true, isSuccess: false });
    renderFeed();
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
  });

  it('renders an error state with retry when trips fail to load', () => {
    const refetch = vi.fn();
    setTrips({ isError: true, isSuccess: false, refetch });
    renderFeed();
    expect(screen.getByText(/couldn't load trips/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it('renders an empty state when there are no open trips', () => {
    setTrips({ data: [] });
    renderFeed();
    expect(screen.getByText(/no open trips/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /clear filters/i })).toBeNull();
  });

  it('renders a card per trip', () => {
    setTrips({ data: [makeTrip({ id: 't1' }), makeTrip({ id: 't2', fromCity: city('c3', 'Bangalore') })] });
    renderFeed();
    expect(screen.getByText(/vellore → chennai/i)).toBeInTheDocument();
    expect(screen.getByText(/bangalore → chennai/i)).toBeInTheDocument();
  });

  it('the "AC only" toggle hides non-AC trips', () => {
    setTrips({ data: [makeTrip({ id: 't1', acRequired: true, fromCity: city('c1', 'Vellore') }), makeTrip({ id: 't2', acRequired: false, fromCity: city('c3', 'Mysore') })] });
    renderFeed();
    expect(screen.getByText(/mysore → chennai/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /ac only/i }));
    expect(screen.getByText(/vellore → chennai/i)).toBeInTheDocument();
    expect(screen.queryByText(/mysore → chennai/i)).toBeNull();
  });

  it('"Clear filters" restores trips hidden by a filter', () => {
    setTrips({ data: [makeTrip({ id: 't1', acRequired: false, fromCity: city('c1', 'Vellore') })] });
    renderFeed();
    fireEvent.click(screen.getByRole('button', { name: /ac only/i }));
    expect(screen.getByText(/no trips match/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /clear filters/i }));
    expect(screen.getByText(/vellore → chennai/i)).toBeInTheDocument();
  });
});
