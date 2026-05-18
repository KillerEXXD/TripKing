import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TripFeedPage } from '@/pages/TripFeedPage';
import type { Trip } from '@/types';

vi.mock('@/hooks/useTrips', () => ({ useInfiniteTrips: vi.fn() }));
import { useInfiniteTrips } from '@/hooks/useTrips';
vi.mock('@/hooks/useDrivers', () => ({ useMyDriver: vi.fn(() => ({ data: undefined, isPending: false, isError: false })) }));
vi.mock('@/hooks/useAdminConfig', () => ({ cityHooks: { useList: vi.fn() }, carTypeHooks: { useList: vi.fn() } }));
import { carTypeHooks, cityHooks } from '@/hooks/useAdminConfig';

const city = (id: string, name: string) => ({ id, name, state: 'TN', lat: 12.9, lng: 79.1, sortOrder: 1, isActive: true });

function makeTrip(over: Partial<Trip> = {}): Trip {
  return {
    id: 't1',
    postedByUserId: 'u1',
    postedByRole: 'trip_manager',
    postedByName: 'Agent A',
    postedByHandle: 'A1B2C3D',
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
    pendingInvitationCount: 0,
    createdAt: '2026-05-30T00:00:00.000Z',
    acceptanceWindowMinutes: 15,
    ...over,
  };
}

type TripsState = { isPending?: boolean; isError?: boolean; isSuccess?: boolean; data?: Trip[]; refetch?: () => void; hasNextPage?: boolean };
/** Wraps the trip array into the useInfiniteQuery shape — `data.pages[0].items` — so the
 *  page can flatten it without changing the existing test fixtures. */
function setTrips(state: TripsState) {
  const items = state.data ?? [];
  const isError = state.isError ?? false;
  const isPending = state.isPending ?? false;
  const pages = !isError && !isPending ? [{ items, hasMore: !!state.hasNextPage, nextOffset: items.length }] : [];
  vi.mocked(useInfiniteTrips).mockReturnValue({
    isPending,
    isError,
    isSuccess: !isPending && !isError,
    data: pages.length ? { pages, pageParams: [0] } : undefined,
    hasNextPage: !!state.hasNextPage,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: state.refetch ?? vi.fn(),
  } as never);
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
    vi.mocked(useInfiniteTrips).mockReset();
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

  it('renders a card per trip and the "Near me" filter; a near-list card shows the distance', () => {
    setTrips({ data: [makeTrip({ id: 't1' }), makeTrip({ id: 't2', fromCity: city('c3', 'Bangalore'), distanceKm: 4.2 })] });
    renderFeed();
    expect(screen.getByText(/vellore → chennai/i)).toBeInTheDocument();
    expect(screen.getByText(/bangalore → chennai/i)).toBeInTheDocument();
    expect(screen.getByText(/4\.2 km away/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /near me/i })).toBeInTheDocument();
    // Cards link to /trips/:id?from=/trips so Back from the detail page
    // returns the driver to Open Trips (not /my-trips).
    const card = screen.getByText(/vellore → chennai/i).closest('a');
    expect(card).toHaveAttribute('href', '/app/trips/t1?from=/trips');
  });

  it('"Clear filters" restores trips hidden by the car-type filter', () => {
    vi.mocked(carTypeHooks.useList).mockReturnValue({ data: [{ id: 'ct1', label: 'Sedan', sortOrder: 1, isActive: true }, { id: 'ct2', label: 'SUV', sortOrder: 2, isActive: true }] } as never);
    setTrips({ data: [makeTrip({ id: 't1', carTypeId: 'ct1', fromCity: city('c1', 'Vellore') })] });
    renderFeed();
    fireEvent.change(screen.getByLabelText(/filter by car type/i), { target: { value: 'ct2' } });
    expect(screen.getByText(/no trips match/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /clear filters/i }));
    expect(screen.getByText(/vellore → chennai/i)).toBeInTheDocument();
  });
});
