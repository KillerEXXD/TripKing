import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { routeChainText, RouteChain, TripTypeBadge } from '@/components/trip/RouteChain';
import type { Trip, Waypoint } from '@/types';

const city = (id: string, name: string, state = 'TN') => ({ id, name, state, lat: 12.9, lng: 79.1, sortOrder: 1, isActive: true });
function wp(id: string, c: string, over: Partial<Waypoint> = {}): Waypoint {
  return { id, seq: 0, city: city(c, c), waitMinutes: 0, isDestination: false, ...over };
}
function makeTrip(over: Partial<Trip> = {}): Trip {
  return {
    id: 't1',
    postedByUserId: 'u1',
    postedByRole: 'trip_manager',
    postedByName: 'Agent A',
    postedByHandle: 'A1B2C3D',
    fromCity: city('c1', 'Vellore'),
    toCity: city('c2', 'Chennai'),
    pickupAt: '2099-06-01T03:30:00.000Z',
    expectedDistanceKm: 140,
    carTypeId: 'ct1',
    seatsRequired: 4,
    acRequired: true,
    ratePerKm: 14,
    totalFare: 1960,
    commissionPct: 10,
    gstAmount: 98,
    driverBata: 300,
    extrasPaidByPassenger: true,
    driverPayout: 2090,
    passengerName: 'P',
    passengerPhone: '+91',
    passengerCount: 2,
    status: 'open',
    showFareToPassenger: true,
    hidePassengerPhone: false,
    applicantCount: 0,
    createdAt: '2099-05-30T00:00:00.000Z',
    acceptanceWindowMinutes: 15,
    ...over,
  };
}

describe('routeChainText', () => {
  it('falls back to fromCity → toCity when waypoints[] is empty (legacy trips)', () => {
    expect(routeChainText(makeTrip())).toBe('Vellore → Chennai');
  });

  it('uses the waypoints chain when present (>= 2 entries)', () => {
    const trip = makeTrip({
      tripType: 'multi_way',
      waypoints: [
        wp('w1', 'Chennai', { seq: 0 }),
        wp('w2', 'Vellore', { seq: 1 }),
        wp('w3', 'Trichy', { seq: 2 }),
        wp('w4', 'Pondicherry', { seq: 3, isDestination: true }),
      ],
    });
    expect(routeChainText(trip)).toBe('Chennai → Vellore → Trichy → Pondicherry');
  });

  it('prefers place.name over city.name when both are present on a waypoint', () => {
    const w: Waypoint = {
      id: 'w1', seq: 0, city: city('c1', 'Vellore'),
      place: { id: 'p1', name: 'Katpadi, Vellore', provider: 'nominatim', providerPlaceId: 'N1', state: 'TN', country: 'IN', lat: 12.9, lng: 79.1, isActive: true, createdAt: '2026-05-26T00:00:00Z' } as Waypoint['place'],
      waitMinutes: 0, isDestination: false,
    };
    const trip = makeTrip({ tripType: 'one_way', waypoints: [w, wp('w2', 'Chennai', { seq: 1 })] });
    expect(routeChainText(trip)).toBe('Katpadi, Vellore → Chennai');
  });

  it('renders "—" for a waypoint without city or place (defensive)', () => {
    const blank: Waypoint = { id: 'wx', seq: 1, waitMinutes: 0, isDestination: false };
    const trip = makeTrip({ tripType: 'one_way', waypoints: [wp('w1', 'Chennai', { seq: 0 }), blank] });
    expect(routeChainText(trip)).toBe('Chennai → —');
  });
});

describe('<RouteChain>', () => {
  it('renders the chain text inside a single span', () => {
    render(<RouteChain trip={makeTrip()} />);
    expect(screen.getByText('Vellore → Chennai')).toBeInTheDocument();
  });
});

describe('<TripTypeBadge>', () => {
  it('renders nothing for one-way (the common case)', () => {
    const { container } = render(<TripTypeBadge trip={makeTrip()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders "Round-trip return back" for round_trip', () => {
    render(<TripTypeBadge trip={makeTrip({ tripType: 'round_trip' })} />);
    expect(screen.getByText('Round-trip return back')).toBeInTheDocument();
  });

  it('renders "Multi-way drop" when last city ≠ first', () => {
    const trip = makeTrip({
      tripType: 'multi_way',
      waypoints: [wp('w1', 'Chennai', { seq: 0 }), wp('w2', 'Vellore', { seq: 1 }), wp('w3', 'Trichy', { seq: 2 })],
    });
    render(<TripTypeBadge trip={trip} />);
    expect(screen.getByText('Multi-way drop')).toBeInTheDocument();
  });

  it('renders "Multi-way return back" when last city == first', () => {
    const trip = makeTrip({
      tripType: 'multi_way',
      waypoints: [wp('w1', 'c1', { seq: 0 }), wp('w2', 'c2', { seq: 1 }), wp('w3', 'c1', { seq: 2 })],
    });
    render(<TripTypeBadge trip={trip} />);
    expect(screen.getByText('Multi-way return back')).toBeInTheDocument();
  });
});
