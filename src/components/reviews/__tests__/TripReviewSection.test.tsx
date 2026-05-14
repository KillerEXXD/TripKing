import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TripReviewSection } from '@/components/reviews/TripReviewSection';
import type { Review, Trip, User } from '@/types';

vi.mock('@/hooks/useReviews', () => ({ useReviews: vi.fn() }));
import { useReviews } from '@/hooks/useReviews';
vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }));
import { useAuth } from '@/contexts/AuthContext';
vi.mock('@/components/reviews/ReviewForm', () => ({ ReviewForm: (p: { direction: string }) => <div>review form: {p.direction}</div> }));
vi.mock('@/components/reviews/ReviewList', () => ({ ReviewList: ({ reviews }: { reviews: Review[] }) => <div>review list ({reviews.length})</div> }));

const city = (id: string, name: string) => ({ id, name, state: 'TN', lat: 12.9, lng: 79.1, sortOrder: 1, isActive: true });
function makeTrip(over: Partial<Trip> = {}): Trip {
  return {
    id: 't1',
    postedByUserId: 'agent1',
    postedByRole: 'trip_manager',
    postedByName: 'Agent A',
    postedByHandle: 'A1B2C3D',
    fromCity: city('c1', 'Vellore'),
    toCity: city('c2', 'Chennai'),
    pickupAt: '2026-06-01T09:00:00.000Z',
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
    status: 'completed',
    showFareToPassenger: true,
    hidePassengerPhone: false,
    applicantCount: 0,
    createdAt: '2026-05-30T00:00:00.000Z',
    ...over,
  };
}
const agent: User = { id: 'agent1', role: 'trip_manager', phone: '+91', displayName: 'Agent A', preferredLanguage: 'en', isActive: true, canReportBugs: false };
const driver: User = { id: 'driver1', role: 'driver', phone: '+91', displayName: 'Driver D', preferredLanguage: 'en', isActive: true, canReportBugs: false };
const admin: User = { id: 'admin1', role: 'admin', phone: '+91', displayName: 'Admin', preferredLanguage: 'en', isActive: true, canReportBugs: false };

function setAuth(user: User) {
  vi.mocked(useAuth).mockReturnValue({ user, isAuthenticated: true, isLoading: false, requestOtp: vi.fn(), verifyOtp: vi.fn(), logout: vi.fn() });
}
type RState = { isPending?: boolean; isError?: boolean; data?: Review[]; refetch?: () => void };
function setReviews(s: RState) {
  vi.mocked(useReviews).mockReturnValue({ isPending: false, isError: false, data: [], refetch: vi.fn(), ...s } as never);
}

describe('TripReviewSection', () => {
  beforeEach(() => {
    vi.mocked(useReviews).mockReset();
    vi.mocked(useAuth).mockReset();
  });

  it('shows a skeleton while reviews load', () => {
    setAuth(agent);
    setReviews({ isPending: true });
    render(<TripReviewSection trip={makeTrip()} />);
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
  });

  it('shows the manager_to_driver form to the trip poster when they have not reviewed yet', () => {
    setAuth(agent);
    setReviews({ data: [] });
    render(<TripReviewSection trip={makeTrip()} />);
    expect(screen.getByText('review form: manager_to_driver')).toBeInTheDocument();
  });

  it('shows a "thanks" line to the poster once they have reviewed', () => {
    setAuth(agent);
    setReviews({ data: [{ id: 'r1', tripId: 't1', raterUserId: 'agent1', raterRole: 'trip_manager', rateeUserId: 'driver1', direction: 'manager_to_driver', score: 5, comment: '', tagIds: [], isPublished: true, isFlagged: false, createdAt: new Date().toISOString() }] });
    render(<TripReviewSection trip={makeTrip()} />);
    expect(screen.getByText(/you rated the driver 5/i)).toBeInTheDocument();
    expect(screen.queryByText(/review form/i)).toBeNull();
  });

  it('shows the driver_to_manager form to a driver viewer', () => {
    setAuth(driver);
    setReviews({ data: [] });
    render(<TripReviewSection trip={makeTrip()} />);
    expect(screen.getByText('review form: driver_to_manager')).toBeInTheDocument();
  });

  it('shows no form to an uninvolved admin and notes there are no reviews yet', () => {
    setAuth(admin);
    setReviews({ data: [] });
    render(<TripReviewSection trip={makeTrip()} />);
    expect(screen.queryByText(/review form/i)).toBeNull();
    expect(screen.getByText(/no reviews for this trip yet/i)).toBeInTheDocument();
  });

  it('lists published reviews for the trip', () => {
    setAuth(admin);
    setReviews({ data: [{ id: 'r1', tripId: 't1', raterRole: 'passenger', direction: 'passenger_to_driver', score: 5, comment: 'Nice', tagIds: [], isPublished: true, isFlagged: false, createdAt: new Date().toISOString() }] });
    render(<TripReviewSection trip={makeTrip()} />);
    expect(screen.getByText('review list (1)')).toBeInTheDocument();
  });
});
