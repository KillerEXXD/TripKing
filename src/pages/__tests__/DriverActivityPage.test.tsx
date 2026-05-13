import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DriverActivityPage } from '@/pages/DriverActivityPage';
import type { MyApplication, Trip, TripsQueryParams, User } from '@/types';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }));
import { useAuth } from '@/contexts/AuthContext';
vi.mock('@/hooks/useTrips', () => ({ useTrips: vi.fn(), useMyApplications: vi.fn() }));
import { useMyApplications, useTrips } from '@/hooks/useTrips';
vi.mock('@/components/share/ShareTripModal', () => ({ ShareTripModal: () => <div>share modal</div> }));

const user: User = { id: 'u1', role: 'driver', phone: '+91', displayName: 'Ravi', preferredLanguage: 'en', isActive: true };
const city = (id: string, name: string) => ({ id, name, state: 'TN', lat: 12.9, lng: 79.1, sortOrder: 1, isActive: true });
function makeTrip(over: Partial<Trip> = {}): Trip {
  return {
    id: 't1',
    postedByUserId: 'u9',
    postedByRole: 'trip_manager',
    postedByName: 'Agent A',
    postedByHandle: 'A1B2C3D',
    fromCity: city('c1', 'Vellore'),
    toCity: city('c2', 'Chennai'),
    pickupAt: '2099-06-01T09:00:00.000Z',
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
    driverPayout: 2200,
    passengerName: 'P',
    passengerPhone: '+91',
    passengerCount: 2,
    status: 'open',
    showFareToPassenger: true,
    hidePassengerPhone: false,
    applicantCount: 0,
    createdAt: '2099-05-30T00:00:00.000Z',
    ...over,
  } as Trip;
}
function makeApp(over: Partial<MyApplication> = {}): MyApplication {
  return { acceptanceId: 'a1', status: 'applied', appliedAt: '2099-05-31T00:00:00.000Z', trip: makeTrip({ id: 'tt1', toCity: city('c5', 'Chennai') }), ...over };
}

type TripsQ = { isPending?: boolean; isError?: boolean; data?: Trip[]; refetch?: () => void };
type AppsQ = { isPending?: boolean; isError?: boolean; data?: MyApplication[]; refetch?: () => void };
const tripsState = (s: TripsQ = {}) => ({ isPending: false, isError: false, data: [] as Trip[], refetch: vi.fn(), ...s });
const appsState = (s: AppsQ = {}) => ({ isPending: false, isError: false, data: [] as MyApplication[], refetch: vi.fn(), ...s });

function setUp({ driving = tripsState(), posted = tripsState(), applied = appsState() } = {}) {
  vi.mocked(useAuth).mockReturnValue({ user, isAuthenticated: true, isLoading: false, requestOtp: vi.fn(), verifyOtp: vi.fn(), logout: vi.fn() } as never);
  vi.mocked(useTrips).mockImplementation((params?: TripsQueryParams) => (params?.assignedDriverId ? driving : posted) as never);
  vi.mocked(useMyApplications).mockReturnValue(applied as never);
}
const renderPage = () => render(<MemoryRouter><DriverActivityPage /></MemoryRouter>);

describe('DriverActivityPage', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReset();
    vi.mocked(useTrips).mockReset();
    vi.mocked(useMyApplications).mockReset();
  });

  it('shows the three tabs and lists the trips assigned to you by default', () => {
    setUp({ driving: tripsState({ data: [makeTrip({ id: 'd-1', status: 'assigned' })] }) });
    renderPage();
    expect(screen.getByRole('heading', { name: /my trips/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^driving/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^applied/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /posted by me/i })).toBeInTheDocument();
    expect(screen.getByText('Vellore → Chennai')).toBeInTheDocument();
  });

  it('the Applied tab lists your applications with their status and a trip link', () => {
    setUp({ applied: appsState({ data: [makeApp({ status: 'rejected', applicantQuotedRatePerKm: 13 })] }) });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /^applied/i }));
    expect(screen.getByText(/not selected/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view trip/i })).toHaveAttribute('href', '/trips/tt1');
  });

  it('the Posted tab lists the trips you posted yourself', () => {
    setUp({ posted: tripsState({ data: [makeTrip({ id: 'p-1', toCity: city('c9', 'Salem') })] }) });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /posted by me/i }));
    expect(screen.getByText('Vellore → Salem')).toBeInTheDocument();
  });

  it('empty states — no assigned trips; no applications (with a Browse CTA)', () => {
    setUp();
    renderPage();
    expect(screen.getByText(/no trips assigned to you yet/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^applied/i }));
    expect(screen.getByText(/haven't applied to any trips/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /browse trips/i })).toHaveAttribute('href', '/trips');
  });

  it('surfaces an error on the Driving tab', () => {
    setUp({ driving: tripsState({ isError: true }) });
    renderPage();
    expect(screen.getByText(/couldn't load your trips/i)).toBeInTheDocument();
  });
});
