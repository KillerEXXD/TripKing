import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { TripDetailPage } from '@/pages/TripDetailPage';
import { ApiError } from '@/lib/api/client';
import type { Trip, User, Vehicle } from '@/types';

vi.mock('@/hooks/useTrips', () => ({ useTrip: vi.fn(), useApplyToTrip: vi.fn(), useWithdrawApplication: vi.fn(), useStartTrip: vi.fn(), useCompleteTrip: vi.fn() }));
import { useTrip, useApplyToTrip, useWithdrawApplication, useStartTrip, useCompleteTrip } from '@/hooks/useTrips';
vi.mock('@/hooks/useDrivers', () => ({ useMyDriver: vi.fn(), useUpdateDriverLocation: vi.fn() }));
import { useMyDriver, useUpdateDriverLocation } from '@/hooks/useDrivers';
vi.mock('@/hooks/useVehicles', () => ({ useDriverVehicles: vi.fn() }));
import { useDriverVehicles } from '@/hooks/useVehicles';
vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }));
import { useAuth } from '@/contexts/AuthContext';
vi.mock('@/stores/myApplicationsStore', () => ({ useMyApplicationsStore: vi.fn(), timeAgo: () => 'just now' }));
import { useMyApplicationsStore } from '@/stores/myApplicationsStore';
vi.mock('@/components/reviews/TripReviewSection', () => ({ TripReviewSection: () => <div>review section</div> }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { toast } from 'sonner';

const driver: User = { id: 'u1', role: 'driver', phone: '+91', displayName: 'Driver D', preferredLanguage: 'en', isActive: true };
const agent: User = { id: 'u9', role: 'trip_manager', phone: '+91', displayName: 'Agent A', preferredLanguage: 'en', isActive: true };
const city = (id: string, name: string) => ({ id, name, state: 'TN', lat: 12.9, lng: 79.1, sortOrder: 1, isActive: true });

function makeTrip(over: Partial<Trip> = {}): Trip {
  return {
    id: 't1',
    postedByUserId: 'u9',
    postedByRole: 'trip_manager',
    postedByName: 'Agent A',
    postedByPhone: '+919000000000',
    fromCity: city('c1', 'Vellore'),
    toCity: city('c2', 'Chennai'),
    pickupAt: '2099-06-01T09:00:00.000Z',
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
    createdAt: '2099-05-30T00:00:00.000Z',
    ...over,
  };
}
function makeVehicle(over: Partial<Vehicle> = {}): Vehicle {
  return {
    id: 'v1',
    driverId: 'd1',
    makeLabel: 'Toyota',
    modelName: 'Etios',
    year: 2021,
    carTypeId: 'ct1',
    carTypeLabel: 'Sedan',
    seats: 4,
    ac: true,
    registrationNumber: 'TN01AB1234',
    photoFrontUrl: '',
    photoBackUrl: '',
    photoLeftUrl: '',
    photoRightUrl: '',
    rcBookUrl: '',
    insuranceUrl: '',
    isPrimary: true,
    isActive: true,
    ...over,
  };
}

type Q<T> = { isPending?: boolean; isError?: boolean; error?: unknown; data?: T; refetch?: () => void };
function setTrip(s: Q<Trip>) {
  vi.mocked(useTrip).mockReturnValue({ isPending: false, isError: false, error: null, data: undefined, refetch: vi.fn(), ...s } as never);
}
function setMyDriver(s: Q<{ id: string }> = {}) {
  vi.mocked(useMyDriver).mockReturnValue({ isPending: false, isError: false, error: null, data: { id: 'd1' }, refetch: vi.fn(), ...s } as never);
}
function setVehicles(s: Q<Vehicle[]> = {}) {
  vi.mocked(useDriverVehicles).mockReturnValue({ isPending: false, isError: false, error: null, data: [makeVehicle()], refetch: vi.fn(), ...s } as never);
}
let applyMutateAsync: ReturnType<typeof vi.fn>;
let withdrawMutateAsync: ReturnType<typeof vi.fn>;
let startMutateAsync: ReturnType<typeof vi.fn>;
let completeMutateAsync: ReturnType<typeof vi.fn>;
function setMutations() {
  applyMutateAsync = vi.fn().mockResolvedValue({ id: 'a1', appliedAt: '2099-05-31T00:00:00.000Z' });
  withdrawMutateAsync = vi.fn().mockResolvedValue(undefined);
  startMutateAsync = vi.fn().mockResolvedValue({});
  completeMutateAsync = vi.fn().mockResolvedValue({});
  vi.mocked(useApplyToTrip).mockReturnValue({ mutateAsync: applyMutateAsync, isPending: false, isError: false } as never);
  vi.mocked(useWithdrawApplication).mockReturnValue({ mutateAsync: withdrawMutateAsync, isPending: false, isError: false } as never);
  vi.mocked(useStartTrip).mockReturnValue({ mutateAsync: startMutateAsync, isPending: false, isError: false } as never);
  vi.mocked(useCompleteTrip).mockReturnValue({ mutateAsync: completeMutateAsync, isPending: false, isError: false } as never);
}
let storeState: { byTrip: Record<string, unknown>; recordApplication: ReturnType<typeof vi.fn>; clearApplication: ReturnType<typeof vi.fn>; reset: ReturnType<typeof vi.fn> };
function setStore(byTrip: Record<string, unknown> = {}) {
  storeState = { byTrip, recordApplication: vi.fn(), clearApplication: vi.fn(), reset: vi.fn() };
  vi.mocked(useMyApplicationsStore).mockImplementation(((selector?: (s: typeof storeState) => unknown) => (selector ? selector(storeState) : storeState)) as never);
}

function renderDetail(entries: string[] = ['/trips/t1']) {
  return render(
    <MemoryRouter initialEntries={entries}>
      <Routes>
        <Route path="/trips/:id" element={<TripDetailPage />} />
        <Route path="/trips" element={<div>trip feed</div>} />
        <Route path="/profile" element={<div>profile page</div>} />
        <Route path="/trips/:id/applicants" element={<div>applicant review</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('TripDetailPage', () => {
  beforeEach(() => {
    vi.mocked(useTrip).mockReset();
    vi.mocked(useMyDriver).mockReset();
    vi.mocked(useDriverVehicles).mockReset();
    vi.mocked(useApplyToTrip).mockReset();
    vi.mocked(useWithdrawApplication).mockReset();
    vi.mocked(useStartTrip).mockReset();
    vi.mocked(useCompleteTrip).mockReset();
    vi.mocked(useUpdateDriverLocation).mockReset().mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
    vi.mocked(useMyApplicationsStore).mockReset();
    vi.mocked(useAuth).mockReset().mockReturnValue({ user: driver, isAuthenticated: true, isLoading: false, requestOtp: vi.fn(), verifyOtp: vi.fn(), logout: vi.fn() });
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
    setMyDriver();
    setVehicles();
    setMutations();
    setStore();
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

  it('renders the trip details — route, payout, posted-by', () => {
    setTrip({ data: makeTrip() });
    renderDetail();
    expect(screen.getByText('Vellore → Chennai')).toBeInTheDocument();
    expect(screen.getByText(/payout breakdown/i)).toBeInTheDocument();
    expect(screen.getByText(/driver payout/i)).toBeInTheDocument();
    expect(screen.getByText('Passenger P · 2 pax')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /call agent a/i })).toBeInTheDocument();
  });

  it('shows the review section on a completed trip', () => {
    setTrip({ data: makeTrip({ status: 'completed' }) });
    renderDetail();
    expect(screen.getByText('review section')).toBeInTheDocument();
  });

  it('the back arrow returns to the trip feed when there is no history', () => {
    setTrip({ data: makeTrip() });
    renderDetail();
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(screen.getByText('trip feed')).toBeInTheDocument();
  });

  it('a driver applies with their vehicle and records the application', async () => {
    setTrip({ data: makeTrip() });
    renderDetail();
    fireEvent.click(screen.getByRole('button', { name: /apply for this trip/i }));
    await waitFor(() => expect(applyMutateAsync).toHaveBeenCalledWith({ tripId: 't1', input: { vehicleId: 'v1', quotedRatePerKm: undefined, message: undefined } }));
    await waitFor(() => expect(storeState.recordApplication).toHaveBeenCalledWith(expect.objectContaining({ tripId: 't1', acceptanceId: 'a1' })));
  });

  it('shows the "Applied" state and lets the driver withdraw', async () => {
    setStore({ t1: { tripId: 't1', acceptanceId: 'a1', appliedAt: '2099-05-31T00:00:00.000Z' } });
    setTrip({ data: makeTrip({ status: 'has_applicants', applicantCount: 1 }) });
    renderDetail();
    expect(screen.getByText(/you've applied/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /apply for this trip/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /withdraw application/i }));
    await waitFor(() => expect(withdrawMutateAsync).toHaveBeenCalledWith({ tripId: 't1', acceptanceId: 'a1' }));
    await waitFor(() => expect(storeState.clearApplication).toHaveBeenCalledWith('t1'));
  });

  it('nudges the driver to add a vehicle when they have none', () => {
    setTrip({ data: makeTrip() });
    setVehicles({ data: [] });
    renderDetail();
    expect(screen.queryByRole('button', { name: /apply for this trip/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /add a vehicle/i }));
    expect(screen.getByText('profile page')).toBeInTheDocument();
  });

  it('shows the agent a link to review applicants on their own trip — and no apply bar', () => {
    vi.mocked(useAuth).mockReturnValue({ user: agent, isAuthenticated: true, isLoading: false, requestOtp: vi.fn(), verifyOtp: vi.fn(), logout: vi.fn() });
    setTrip({ data: makeTrip({ status: 'has_applicants', applicantCount: 3 }) });
    renderDetail();
    expect(screen.queryByRole('button', { name: /apply for this trip/i })).toBeNull();
    fireEvent.click(screen.getByRole('link', { name: /review 3 applicants/i }));
    expect(screen.getByText('applicant review')).toBeInTheDocument();
  });

  it('lets the assigned driver start the trip with the passenger OTP', async () => {
    setTrip({ data: makeTrip({ status: 'assigned', assignedDriverId: 'd1' }) });
    renderDetail();
    expect(screen.getByText(/you're driving this trip/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /start the trip/i }));
    fireEvent.change(screen.getByLabelText(/passenger otp/i), { target: { value: '654321' } });
    fireEvent.click(screen.getByRole('button', { name: /start the trip/i }));
    await waitFor(() => expect(startMutateAsync).toHaveBeenCalledWith({ tripId: 't1', input: { passengerOtp: '654321' } }));
  });

  it('lets the assigned driver complete an in-progress trip', async () => {
    setTrip({ data: makeTrip({ status: 'in_progress', assignedDriverId: 'd1' }) });
    renderDetail();
    fireEvent.click(screen.getByRole('button', { name: /complete the trip/i }));
    await waitFor(() => expect(completeMutateAsync).toHaveBeenCalledWith({ tripId: 't1' }));
  });

  it('lets the poster open the passenger share link once a driver is assigned', () => {
    vi.mocked(useAuth).mockReturnValue({ user: agent, isAuthenticated: true, isLoading: false, requestOtp: vi.fn(), verifyOtp: vi.fn(), logout: vi.fn() });
    setTrip({ data: makeTrip({ status: 'assigned', passengerOtp: '123456' }) });
    renderDetail();
    expect(screen.getByText(/share the trip with your passenger/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /share the passenger link/i }));
    expect(screen.getByText(/\/passenger\/123456/)).toBeInTheDocument();
  });
});
