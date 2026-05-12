import { describe, it, expect } from 'vitest';
import { renderWithProviders, screen } from '@/test/test-utils';
import { TripTracking } from '@/components/trip/TripTracking';
import type { AssignedDriver, CityRow, Trip, TripStatus } from '@/types';

const city = (id: string, name: string, lat: number, lng: number): CityRow => ({
  id,
  name,
  state: 'Tamil Nadu',
  lat,
  lng,
  sortOrder: 10,
  isActive: true,
});

const baseTrip: Trip = {
  id: 't1',
  postedByUserId: 'u1',
  postedByRole: 'trip_manager',
  postedByName: 'Agent A',
  postedByPhone: '+919999999999',
  fromCity: city('c1', 'Vellore', 12.92, 79.13),
  toCity: city('c2', 'Chennai', 13.08, 80.27),
  pickupAt: '2026-06-01T08:00:00Z',
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
  driverPayout: 1966,
  passengerName: 'Pax',
  passengerPhone: '+918888888888',
  passengerCount: 2,
  status: 'open',
  showFareToPassenger: true,
  hidePassengerPhone: false,
  applicantCount: 0,
  createdAt: '2026-05-20T10:00:00Z',
};

function makeTrip(over: Partial<Trip> = {}): Trip {
  return { ...baseTrip, ...over };
}
function driver(over: Partial<AssignedDriver> = {}): AssignedDriver {
  return { id: 'd1', fullName: 'Ravi', phone: '+918888888888', profilePhotoUrl: '', ratingAvg: 4.7, ratingCount: 12, totalTripsCompleted: 30, ...over };
}

describe('<TripTracking>', () => {
  it.each<TripStatus>(['open', 'has_applicants', 'completed', 'cancelled'])('renders nothing for status=%s', (status) => {
    const { container } = renderWithProviders(<TripTracking trip={makeTrip({ status })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('for an assigned (not-yet-started) trip shows the "driver confirmed" panel, no ETA card', () => {
    renderWithProviders(<TripTracking trip={makeTrip({ status: 'assigned', assignedDriver: driver() })} />);
    expect(screen.getByText('Live tracking')).toBeInTheDocument();
    expect(screen.getByText('Driver confirmed')).toBeInTheDocument();
    expect(screen.getByText(/you'll see them move here once the trip starts/i)).toBeInTheDocument();
    expect(screen.queryByText('Estimated time to your stop')).not.toBeInTheDocument();
    expect(screen.queryByText('Distance remaining')).not.toBeInTheDocument();
  });

  it('for an in-progress trip with a known driver position + distance shows ETA, distance remaining, progress %, coords and a Maps link', () => {
    const d = driver({ currentLat: 13.0, currentLng: 80.0, currentLocationAt: new Date(Date.now() - 5_000).toISOString() });
    renderWithProviders(<TripTracking trip={makeTrip({ status: 'in_progress', expectedDistanceKm: 140, distanceToDestinationKm: 40, assignedDriver: d })} />);
    expect(screen.getByText('On the way')).toBeInTheDocument();
    expect(screen.getByText('Estimated time to your stop')).toBeInTheDocument();
    // 40 km / 40 km/h = 1 h
    expect(screen.getByText('~1 hr')).toBeInTheDocument();
    expect(screen.getByText('Distance remaining')).toBeInTheDocument();
    expect(screen.getByText('40 km')).toBeInTheDocument();
    // fraction = 1 - 40/140 ≈ 0.714 → 71% of the way
    expect(screen.getByText('71% of the way')).toBeInTheDocument();
    expect(screen.getByText(/Driver at 13\.0000, 80\.0000/)).toBeInTheDocument();
    expect(screen.getByText(/updated just now/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /open in maps/i });
    expect(link).toHaveAttribute('href', 'https://www.google.com/maps/dir/?api=1&origin=13,80&destination=13.08,80.27');
  });

  it('renders the ETA branches: minutes, whole hours, and hours+minutes', () => {
    const d = driver({ currentLat: 13, currentLng: 80 });
    const { rerender } = renderWithProviders(<TripTracking trip={makeTrip({ status: 'in_progress', distanceToDestinationKm: 20, assignedDriver: d })} />);
    expect(screen.getByText('~30 min')).toBeInTheDocument(); // 20/40 h = 30 min
    rerender(<TripTracking trip={makeTrip({ status: 'in_progress', distanceToDestinationKm: 80, assignedDriver: d })} />);
    expect(screen.getByText('~2 hr')).toBeInTheDocument(); // 80/40 h = 120 min
    rerender(<TripTracking trip={makeTrip({ status: 'in_progress', distanceToDestinationKm: 100, assignedDriver: d })} />);
    expect(screen.getByText('~2 hr 30 min')).toBeInTheDocument(); // 100/40 h = 150 min
  });

  it('shows the "updated N min ago" freshness branch', () => {
    const d = driver({ currentLat: 13, currentLng: 80, currentLocationAt: new Date(Date.now() - 181_000).toISOString() });
    renderWithProviders(<TripTracking trip={makeTrip({ status: 'in_progress', distanceToDestinationKm: 20, assignedDriver: d })} />);
    expect(screen.getByText(/updated 3 min ago/)).toBeInTheDocument();
  });

  it('for an in-progress trip without a reported distance shows the "waiting for the driver" copy and no ETA card', () => {
    renderWithProviders(<TripTracking trip={makeTrip({ status: 'in_progress', distanceToDestinationKm: undefined, assignedDriver: driver() })} />);
    expect(screen.getByText(/waiting for the driver's location/i)).toBeInTheDocument();
    expect(screen.queryByText('Estimated time to your stop')).not.toBeInTheDocument();
  });

  it('when the assigned driver has not shared a position there is no Maps link', () => {
    renderWithProviders(<TripTracking trip={makeTrip({ status: 'in_progress', distanceToDestinationKm: undefined, assignedDriver: driver({ currentLat: undefined, currentLng: undefined }) })} />);
    expect(screen.getByText('Driver location not shared yet')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /open in maps/i })).not.toBeInTheDocument();
  });
});
