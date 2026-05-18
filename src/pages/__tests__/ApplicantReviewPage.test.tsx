import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ApplicantReviewPage } from '@/pages/ApplicantReviewPage';
import { ApiError } from '@/lib/api/client';
import type { Trip, TripAcceptance, User } from '@/types';

vi.mock('@/hooks/useTrips', () => ({ useTrip: vi.fn(), useTripApplicants: vi.fn(), useAssignDriver: vi.fn(), useRejectApplicant: vi.fn() }));
import { useAssignDriver, useRejectApplicant, useTrip, useTripApplicants } from '@/hooks/useTrips';
vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }));
import { useAuth } from '@/contexts/AuthContext';
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

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
    status: 'has_applicants',
    showFareToPassenger: true,
    hidePassengerPhone: false,
    applicantCount: 2,
    pendingInvitationCount: 0,
    createdAt: '2099-05-30T00:00:00.000Z',
    acceptanceWindowMinutes: 15,
    ...over,
  };
}
function makeAcceptance(over: Partial<TripAcceptance> = {}): TripAcceptance {
  return {
    id: 'acc1',
    tripId: 't1',
    driverId: 'd1',
    driver: { id: 'd1', userId: 'u1', displayHandle: 'A1B2C3D', fullName: 'Ravi Kumar', profilePhotoUrl: '', ratingAvg: 4.6, ratingCount: 8, totalTripsCompleted: 22, topTags: ['Punctual'] },
    vehicleId: 'veh1',
    vehicle: { id: 'veh1', makeLabel: 'Toyota', modelName: 'Innova', year: 2021, carTypeLabel: 'Innova', seats: 7, ac: true },
    status: 'applied',
    applicantMessage: 'Available, can leave early.',
    appliedAt: '2099-05-31T08:00:00.000Z',
    ...over,
  };
}
const agent: User = { id: 'agent1', role: 'trip_manager', phone: '+91', displayName: 'Agent A', preferredLanguage: 'en', isActive: true, canReportBugs: false };
const driver: User = { id: 'driver1', role: 'driver', phone: '+91', displayName: 'Driver D', preferredLanguage: 'en', isActive: true, canReportBugs: false };

function setAuth(user: User) {
  vi.mocked(useAuth).mockReturnValue({ user, isAuthenticated: true, isLoading: false, requestOtp: vi.fn(), verifyOtp: vi.fn(), logout: vi.fn() });
}
type TState = { isPending?: boolean; isError?: boolean; error?: unknown; data?: Trip; refetch?: () => void };
function setTrip(s: TState) {
  vi.mocked(useTrip).mockReturnValue({ isPending: false, isError: false, error: null, data: undefined, refetch: vi.fn(), ...s } as never);
}
type AState = { isPending?: boolean; isError?: boolean; data?: TripAcceptance[]; refetch?: () => void };
function setApplicants(s: AState) {
  vi.mocked(useTripApplicants).mockReturnValue({ isPending: false, isError: false, data: [], refetch: vi.fn(), ...s } as never);
}
function setMutations() {
  const assignMut = { mutate: vi.fn(), isPending: false };
  const rejectMut = { mutate: vi.fn(), isPending: false };
  vi.mocked(useAssignDriver).mockReturnValue(assignMut as never);
  vi.mocked(useRejectApplicant).mockReturnValue(rejectMut as never);
  return { assignMut, rejectMut };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/app/trips/t1/applicants']}>
      <Routes>
        <Route path="/app/trips/:id/applicants" element={<ApplicantReviewPage />} />
        <Route path="/app/trips/:id" element={<div>trip detail</div>} />
        <Route path="/app/posted-trips" element={<div>posted trips list</div>} />
        <Route path="/app/drivers/:id" element={<div>driver profile</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ApplicantReviewPage', () => {
  beforeEach(() => {
    vi.mocked(useTrip).mockReset();
    vi.mocked(useTripApplicants).mockReset();
    vi.mocked(useAssignDriver).mockReset();
    vi.mocked(useRejectApplicant).mockReset();
    vi.mocked(useAuth).mockReset();
    setAuth(agent);
    setTrip({ data: makeTrip() });
    setApplicants({ data: [] });
    setMutations();
  });

  it('shows a skeleton while the trip loads', () => {
    setTrip({ isPending: true });
    renderPage();
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
  });

  it('shows a "not found" state on a 404 trip', () => {
    setTrip({ isError: true, error: new ApiError('Trip not found', 404) });
    renderPage();
    expect(screen.getByText(/trip not found/i)).toBeInTheDocument();
  });

  it('shows an empty state when no one has applied', () => {
    setApplicants({ data: [] });
    renderPage();
    expect(screen.getByText(/no one has applied/i)).toBeInTheDocument();
  });

  it('lists applicants; the poster can select one', () => {
    const { assignMut } = setMutations();
    setApplicants({ data: [makeAcceptance({ id: 'acc1', driverId: 'd1' })] });
    renderPage();
    expect(screen.getByText('Ravi Kumar')).toBeInTheDocument();
    expect(screen.getByText(/available, can leave early/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /select this driver/i }));
    expect(assignMut.mutate).toHaveBeenCalledWith({ tripId: 't1', acceptanceId: 'acc1' }, expect.anything());
  });

  it('the poster can reject an applicant', () => {
    const { rejectMut } = setMutations();
    setApplicants({ data: [makeAcceptance({ id: 'acc2' })] });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /^reject$/i }));
    expect(rejectMut.mutate).toHaveBeenCalledWith({ tripId: 't1', acceptanceId: 'acc2' }, expect.anything());
  });

  it('a non-poster sees an explainer instead of the applicants list (the API would 403)', () => {
    setAuth(driver);
    setApplicants({ data: [makeAcceptance()] });
    renderPage();
    expect(screen.getByText(/only the trip poster can see who applied/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /select this driver/i })).toBeNull();
  });

  it('hides the actions when the trip is no longer assignable', () => {
    setTrip({ data: makeTrip({ status: 'accepted' }) });
    setApplicants({ data: [makeAcceptance({ status: 'selected' })] });
    renderPage();
    expect(screen.queryByRole('button', { name: /select this driver/i })).toBeNull();
    expect(screen.getByText('Selected')).toBeInTheDocument();
  });

  it('lets the poster reconsider a rejected applicant — the Reconsider button reinstates them via /assign', () => {
    const { assignMut } = setMutations();
    setApplicants({ data: [makeAcceptance({ id: 'acc-rej', status: 'rejected', driverId: 'd9' })] });
    renderPage();
    expect(screen.getByText('Rejected')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^reject$/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /reconsider/i }));
    expect(assignMut.mutate).toHaveBeenCalledWith({ tripId: 't1', acceptanceId: 'acc-rej' }, expect.anything());
  });

  it('the trip summary card expands to show pickup, bata, GST, instructions', () => {
    setTrip({ data: makeTrip({ driverInstructions: 'Pick up at gate 2', luggageNotes: '2 bags' }) });
    setApplicants({ data: [] });
    renderPage();
    expect(screen.queryByText(/pick up at gate 2/i)).toBeNull();
    const toggle = screen.getByRole('button', { expanded: false });
    fireEvent.click(toggle);
    expect(screen.getByText(/pick up at gate 2/i)).toBeInTheDocument();
    expect(screen.getByText(/2 bags/)).toBeInTheDocument();
    expect(screen.getByText(/driver bata:/i)).toBeInTheDocument();
  });

  it('shows the driver social-proof line under the name (trips · ★ rating · reviews)', () => {
    setApplicants({ data: [makeAcceptance()] });
    renderPage();
    expect(screen.getByText(/22 trips/)).toBeInTheDocument();
    expect(screen.getByText(/★ 4\.6/)).toBeInTheDocument();
    expect(screen.getByText(/\(8 reviews\)/)).toBeInTheDocument();
  });

  it('shows a "New driver" pill when the driver has no trips or reviews yet', () => {
    setApplicants({
      data: [
        makeAcceptance({
          driver: {
            id: 'd2',
            userId: 'u2',
            displayHandle: 'XYZ',
            fullName: 'Zara Khan',
            profilePhotoUrl: '',
            ratingAvg: 0,
            ratingCount: 0,
            totalTripsCompleted: 0,
            topTags: [],
          },
        }),
      ],
    });
    renderPage();
    expect(screen.getByText(/new driver/i)).toBeInTheDocument();
  });

  it('the back button returns to the posted-trips list', () => {
    setApplicants({ data: [] });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /back to your posted trips/i }));
    expect(screen.getByText('posted trips list')).toBeInTheDocument();
  });
});
