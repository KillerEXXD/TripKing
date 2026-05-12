import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { TripDetailPage } from '@/pages/TripDetailPage';
import { ApiError } from '@/lib/api/client';
import type { Trip, User } from '@/types';

vi.mock('@/hooks/useTrips', () => ({ useTrip: vi.fn() }));
import { useTrip } from '@/hooks/useTrips';
vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }));
import { useAuth } from '@/contexts/AuthContext';
// The review block is exercised in TripReviewSection.test.tsx — here we only check it mounts on completed trips.
vi.mock('@/components/reviews/TripReviewSection', () => ({ TripReviewSection: () => <div>review section</div> }));

const driver: User = { id: 'u1', role: 'driver', phone: '+91', displayName: 'Driver D', preferredLanguage: 'en', isActive: true };
const city = (id: string, name: string) => ({ id, name, state: 'TN', lat: 12.9, lng: 79.1, sortOrder: 1, isActive: true });

function makeTrip(over: Partial<Trip> = {}): Trip {
  return {
    id: 't1',
    postedByUserId: 'u9',
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
    passengerPhone: '+919999999999',
    passengerCount: 2,
    status: 'open',
    showFareToPassenger: true,
    hidePassengerPhone: false,
    applicantCount: 0,
    createdAt: '2026-05-30T00:00:00.000Z',
    ...over,
  };
}

type TripState = { isPending?: boolean; isError?: boolean; error?: unknown; data?: Trip; refetch?: () => void };
function setTrip(state: TripState) {
  vi.mocked(useTrip).mockReturnValue({ isPending: false, isError: false, error: null, data: undefined, refetch: vi.fn(), ...state } as never);
}

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={['/trips/t1']}>
      <Routes>
        <Route path="/trips/:id" element={<TripDetailPage />} />
        <Route path="/trips" element={<div>trip feed</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('TripDetailPage', () => {
  beforeEach(() => {
    vi.mocked(useTrip).mockReset();
    vi.mocked(useAuth).mockReset().mockReturnValue({ user: driver, isAuthenticated: true, isLoading: false, requestOtp: vi.fn(), verifyOtp: vi.fn(), logout: vi.fn() });
  });

  it('renders a skeleton while the trip is loading', () => {
    setTrip({ isPending: true });
    renderDetail();
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
  });

  it('renders an error state with retry on a generic failure', () => {
    const refetch = vi.fn();
    setTrip({ isError: true, error: new Error('boom'), refetch });
    renderDetail();
    expect(screen.getByText(/couldn't load this trip/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it('renders a "not found" state (no retry) on a 404', () => {
    setTrip({ isError: true, error: new ApiError('Trip not found', 404) });
    renderDetail();
    expect(screen.getByText(/trip not found/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
  });

  it('renders the trip details', () => {
    setTrip({ data: makeTrip() });
    renderDetail();
    expect(screen.getByRole('heading', { name: /vellore → chennai/i })).toBeInTheDocument();
    expect(screen.getByText(/driver payout/i)).toBeInTheDocument();
    expect(screen.getByText('Passenger P · 2 pax')).toBeInTheDocument();
    // driver + applyable trip → the "apply coming soon" note
    expect(screen.getByText(/applying to trips/i)).toBeInTheDocument();
  });

  it('shows the review section on a completed trip', () => {
    setTrip({ data: makeTrip({ status: 'completed' }) });
    renderDetail();
    expect(screen.getByText('review section')).toBeInTheDocument();
  });

  it('the back button returns to the trip feed', () => {
    setTrip({ data: makeTrip() });
    renderDetail();
    fireEvent.click(screen.getByRole('button', { name: /back to trips/i }));
    expect(screen.getByText('trip feed')).toBeInTheDocument();
  });
});
