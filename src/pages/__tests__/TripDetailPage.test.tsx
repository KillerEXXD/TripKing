import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="probe-search">{loc.search}</div>;
}
import { TripDetailPage } from '@/pages/TripDetailPage';
import { ApiError } from '@/lib/api/client';
import type { Trip, User, Vehicle } from '@/types';

vi.mock('@/components/trip/InviteDriversCard', () => ({ InviteDriversCard: () => null }));
// trip_updated diff-banner consumes the notifications hook. Default returns no notifications
// so existing tests don't see a banner; the dedicated test below overrides the mock to
// return a synthesized trip_updated notification.
vi.mock('@/hooks/useNotifications', () => ({
  useNotifications: vi.fn(() => ({ data: [] })),
  useMarkNotificationRead: vi.fn(() => ({ mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false })),
}));
import { useNotifications } from '@/hooks/useNotifications';
vi.mock('@/hooks/useTrips', () => {
  const noOverlap = Object.freeze({ isPending: false, isSuccess: true, data: Object.freeze([]) });
  return { useTrip: vi.fn(), useApplyToTrip: vi.fn(), useWithdrawApplication: vi.fn(), useStartTrip: vi.fn(), useStartOdoUploadUrl: vi.fn(() => ({ mutateAsync: vi.fn().mockResolvedValue({ bucket: 'trip-executions-photos', path: 't1/start_odo', signedUrl: 'https://x', token: 'tok' }), isPending: false })), useCompleteTrip: vi.fn(), useCancelTrip: vi.fn(), useUpdateTripPassenger: vi.fn(), useUpdateTripDetails: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })), useAcceptTrip: vi.fn(), useDeclineTrip: vi.fn(), useDeclineTripInvite: vi.fn(), useCancelAssignment: vi.fn(), useOverlappingApplications: vi.fn(() => noOverlap), isTripLive: vi.fn(() => false) };
});
import { useTrip, useApplyToTrip, useWithdrawApplication, useStartTrip, useCompleteTrip, useCancelTrip, useUpdateTripPassenger, useAcceptTrip, useDeclineTrip, useDeclineTripInvite, useCancelAssignment } from '@/hooks/useTrips';
// FileUpload is replaced with a stub that exposes a single "complete upload" button so
// tests can simulate a successful photo upload without driving the real File-API path.
vi.mock('@/components/form', async () => {
  const actual = await vi.importActual<typeof import('@/components/form')>('@/components/form');
  return {
    ...actual,
    FileUpload: ({ label, onUploaded }: { label: string; onUploaded: (path: string) => void }) => (
      <button type="button" onClick={() => onUploaded('t1/start_odo')}>{`mock-upload:${label}`}</button>
    ),
  };
});
vi.mock('@/hooks/usePassengers', () => ({ useLookupPassengerByPhone: vi.fn(() => ({ data: null, isFetching: false, isSuccess: false })), isLookupablePhone: vi.fn(() => false) }));
vi.mock('@/hooks/useDrivers', () => ({ useMyDriver: vi.fn(), useUpdateDriverLocation: vi.fn() }));
import { useMyDriver, useUpdateDriverLocation } from '@/hooks/useDrivers';
vi.mock('@/hooks/useVehicles', () => ({ useDriverVehicles: vi.fn() }));
import { useDriverVehicles } from '@/hooks/useVehicles';
vi.mock('@/hooks/useAdminConfig', () => ({
  cancelReasonHooks: { useList: vi.fn() },
  // EditTripDialog (rendered on the poster's "Edit trip" path) reads the car-types list.
  carTypeHooks: { useList: vi.fn(() => ({ isPending: false, isError: false, data: [{ id: 'ct-suv', label: 'SUV', sortOrder: 0, isActive: true }], refetch: vi.fn() })) },
}));
import { cancelReasonHooks } from '@/hooks/useAdminConfig';
vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }));
import { useAuth } from '@/contexts/AuthContext';
vi.mock('@/stores/myApplicationsStore', () => ({ useMyApplicationsStore: vi.fn(), timeAgo: () => 'just now' }));
import { useMyApplicationsStore } from '@/stores/myApplicationsStore';
vi.mock('@/components/reviews/TripReviewSection', () => ({ TripReviewSection: () => <div>review section</div> }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { toast } from 'sonner';

const driver: User = { id: 'u1', role: 'driver', phone: '+91', displayName: 'Driver D', preferredLanguage: 'en', isActive: true, canReportBugs: false };
const agent: User = { id: 'u9', role: 'trip_manager', phone: '+91', displayName: 'Agent A', preferredLanguage: 'en', isActive: true, canReportBugs: false };
const city = (id: string, name: string) => ({ id, name, state: 'TN', lat: 12.9, lng: 79.1, sortOrder: 1, isActive: true });

function makeTrip(over: Partial<Trip> = {}): Trip {
  return {
    id: 't1',
    postedByUserId: 'u9',
    postedByRole: 'trip_manager',
    postedByName: 'Agent A',
    postedByHandle: 'A1B2C3D',
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
    pendingInvitationCount: 0,
    createdAt: '2099-05-30T00:00:00.000Z',
    acceptanceWindowMinutes: 15,
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
    photoPlateUrl: '',
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
function setMyDriver(s: Q<{ id: string; kycStatus?: string }> = {}) {
  vi.mocked(useMyDriver).mockReturnValue({ isPending: false, isError: false, error: null, data: { id: 'd1', kycStatus: 'approved' }, refetch: vi.fn(), ...s } as never);
}
function setVehicles(s: Q<Vehicle[]> = {}) {
  vi.mocked(useDriverVehicles).mockReturnValue({ isPending: false, isError: false, error: null, data: [makeVehicle()], refetch: vi.fn(), ...s } as never);
}
let applyMutateAsync: ReturnType<typeof vi.fn>;
let withdrawMutateAsync: ReturnType<typeof vi.fn>;
let startMutateAsync: ReturnType<typeof vi.fn>;
let completeMutateAsync: ReturnType<typeof vi.fn>;
let cancelMutateAsync: ReturnType<typeof vi.fn>;
let acceptMutateAsync: ReturnType<typeof vi.fn>;
let declineMutateAsync: ReturnType<typeof vi.fn>;
let cancelAssignMutateAsync: ReturnType<typeof vi.fn>;
let declineInviteMutateAsync: ReturnType<typeof vi.fn>;
let updatePassengerMutateAsync: ReturnType<typeof vi.fn>;
function setMutations() {
  applyMutateAsync = vi.fn().mockResolvedValue({ id: 'a1', appliedAt: '2099-05-31T00:00:00.000Z' });
  withdrawMutateAsync = vi.fn().mockResolvedValue(undefined);
  startMutateAsync = vi.fn().mockResolvedValue({});
  completeMutateAsync = vi.fn().mockResolvedValue({});
  cancelMutateAsync = vi.fn().mockResolvedValue({});
  acceptMutateAsync = vi.fn().mockResolvedValue({});
  declineMutateAsync = vi.fn().mockResolvedValue({});
  cancelAssignMutateAsync = vi.fn().mockResolvedValue({});
  updatePassengerMutateAsync = vi.fn().mockResolvedValue({});
  vi.mocked(useApplyToTrip).mockReturnValue({ mutateAsync: applyMutateAsync, isPending: false, isError: false } as never);
  vi.mocked(useWithdrawApplication).mockReturnValue({ mutateAsync: withdrawMutateAsync, isPending: false, isError: false } as never);
  vi.mocked(useStartTrip).mockReturnValue({ mutateAsync: startMutateAsync, isPending: false, isError: false } as never);
  vi.mocked(useCompleteTrip).mockReturnValue({ mutateAsync: completeMutateAsync, isPending: false, isError: false } as never);
  vi.mocked(useCancelTrip).mockReturnValue({ mutateAsync: cancelMutateAsync, isPending: false, isError: false } as never);
  vi.mocked(useUpdateTripPassenger).mockReturnValue({ mutateAsync: updatePassengerMutateAsync, isPending: false, isError: false } as never);
  vi.mocked(useAcceptTrip).mockReturnValue({ mutateAsync: acceptMutateAsync, isPending: false, isError: false } as never);
  vi.mocked(useDeclineTrip).mockReturnValue({ mutateAsync: declineMutateAsync, isPending: false, isError: false } as never);
  vi.mocked(useCancelAssignment).mockReturnValue({ mutateAsync: cancelAssignMutateAsync, isPending: false, isError: false } as never);
  declineInviteMutateAsync = vi.fn().mockResolvedValue({});
  vi.mocked(useDeclineTripInvite).mockReturnValue({ mutateAsync: declineInviteMutateAsync, isPending: false, isError: false } as never);
}
const CANCEL_REASONS = [
  { id: 'cr1', label: 'Passenger no longer needs the ride', appliesTo: 'both', sortOrder: 1, isActive: true },
  { id: 'cr2', label: 'Driver-only reason', appliesTo: 'driver', sortOrder: 2, isActive: true },
];
function setCancelReasons(over: { isPending?: boolean; isError?: boolean; data?: unknown[]; refetch?: () => void } = {}) {
  vi.mocked(cancelReasonHooks.useList).mockReturnValue({ isPending: false, isError: false, data: CANCEL_REASONS, refetch: vi.fn(), ...over } as never);
}
let storeState: { byTrip: Record<string, unknown>; recordApplication: ReturnType<typeof vi.fn>; clearApplication: ReturnType<typeof vi.fn>; markWithdrawn: ReturnType<typeof vi.fn>; reset: ReturnType<typeof vi.fn> };
function setStore(byTrip: Record<string, unknown> = {}) {
  storeState = { byTrip, recordApplication: vi.fn(), clearApplication: vi.fn(), markWithdrawn: vi.fn(), reset: vi.fn() };
  vi.mocked(useMyApplicationsStore).mockImplementation(((selector?: (s: typeof storeState) => unknown) => (selector ? selector(storeState) : storeState)) as never);
}

function renderDetail(entries: string[] = ['/trips/t1']) {
  return render(
    <MemoryRouter initialEntries={entries}>
      <Routes>
        <Route path="/trips/:id" element={<TripDetailPage />} />
        <Route path="/trips" element={<div>trip feed</div>} />
        <Route path="/my-trips" element={<div>my trips list</div>} />
        <Route path="/posted-trips" element={<div>posted trips list</div>} />
        <Route path="/profile" element={<div>profile page</div>} />
        <Route path="/verify/documents" element={<div>verify documents page</div>} />
        <Route path="/trips/:id/applicants" element={<div>applicant review</div>} />
        <Route path="/trips/:id/complete" element={<div data-testid="complete-trip-route">complete trip wizard</div>} />
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
    vi.mocked(useCancelTrip).mockReset();
    vi.mocked(useDeclineTripInvite).mockReset();
    vi.mocked(cancelReasonHooks.useList).mockReset();
    setCancelReasons();
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

  it('TripUpdatedDiffBanner: driver with an unread trip_updated sees the diff + Keep/Withdraw CTAs', () => {
    vi.mocked(useNotifications).mockReturnValue({
      data: [
        {
          id: 'n1',
          userId: 'u1',
          type: 'trip_updated',
          title: 'A trip you applied to has been updated',
          body: 'Pickup date & time changed',
          payloadJson: { trip_id: 't1', changes: [{ field: 'pickup_at', label: 'Pickup date & time', before: '2099-06-01T09:00:00.000Z', after: '2099-06-02T11:00:00.000Z' }] },
          isRead: false,
          createdAt: '2099-05-31T08:00:00.000Z',
        },
      ],
    } as never);
    setTrip({ data: makeTrip() });
    setStore({ t1: { tripId: 't1', acceptanceId: 'a1', appliedAt: '2099-05-30T00:00:00.000Z' } });
    renderDetail();
    expect(screen.getByText(/the trip manager updated this trip/i)).toBeInTheDocument();
    expect(screen.getByText(/pickup date & time/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /keep my application/i })).toBeInTheDocument();
    // ApplyBar also renders a "Withdraw application" button — at least one Withdraw exists
    // (the banner's "Withdraw" sits next to "Keep my application").
    expect(screen.getAllByRole('button', { name: /withdraw/i }).length).toBeGreaterThan(0);
    // Reset for sibling tests so the banner doesn't bleed in.
    vi.mocked(useNotifications).mockReturnValue({ data: [] } as never);
  });

  it('renders the trip details — route, payout, posted-by (driver view)', () => {
    setTrip({ data: makeTrip() });
    renderDetail();
    expect(screen.getByText('Vellore → Chennai')).toBeInTheDocument();
    expect(screen.getByText(/payout breakdown/i)).toBeInTheDocument();
    expect(screen.getByText(/driver payout/i)).toBeInTheDocument();
    // Copy guard: the commission line must read "Commission (10%)" — user asked us
    // not to say "Platform commission" since it reads like a third-party fee.
    expect(screen.getByText(/^− Commission \(10%\)$/)).toBeInTheDocument();
    expect(screen.queryByText(/platform commission/i)).toBeNull();
    // Passenger card is not shown to a browsing driver (PII not visible before assignment)
    expect(screen.queryByText('Passenger P · 2 pax')).toBeNull();
    expect(screen.getByRole('link', { name: /call agent a/i })).toBeInTheDocument();
  });

  it('shows the passenger card to the poster (trip manager)', () => {
    vi.mocked(useAuth).mockReturnValue({ user: agent, isAuthenticated: true, isLoading: false, requestOtp: vi.fn(), verifyOtp: vi.fn(), logout: vi.fn() });
    setTrip({ data: makeTrip() });
    renderDetail();
    expect(screen.getByText('Passenger P · 2 pax')).toBeInTheDocument();
  });

  it('surfaces the pending-invitation count in the header so an invited driver knows they are not alone', () => {
    setTrip({ data: makeTrip({ pendingInvitationCount: 5 }) });
    renderDetail();
    expect(screen.getByText(/5 invited/i)).toBeInTheDocument();
  });

  it('hides the invited badge when there are no pending invitations', () => {
    setTrip({ data: makeTrip({ pendingInvitationCount: 0 }) });
    renderDetail();
    expect(screen.queryByText(/ invited/i)).toBeNull();
  });

  it('shows the review section on a completed trip', () => {
    setTrip({ data: makeTrip({ status: 'completed' }) });
    renderDetail();
    expect(screen.getByText('review section')).toBeInTheDocument();
  });

  it('the back arrow returns to the driver\'s trip list when there is no history', () => {
    setTrip({ data: makeTrip() });
    renderDetail();
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(screen.getByText('my trips list')).toBeInTheDocument();
  });

  it('a driver applies with their vehicle and records the application', async () => {
    setTrip({ data: makeTrip() });
    renderDetail();
    fireEvent.click(screen.getByRole('button', { name: /apply for this trip/i }));
    await waitFor(() => expect(applyMutateAsync).toHaveBeenCalledWith({ tripId: 't1', input: { vehicleId: 'v1' } }));
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
    // The withdraw flow now marks the row instead of dropping it so the card can
    // surface the "withdrawn" state in light red - matches the production UX.
    await waitFor(() => expect(storeState.markWithdrawn).toHaveBeenCalledWith('t1'));
  });

  // Regression: user reported that re-applying after a fresh login surfaced a generic
  // "Couldn't apply" toast and the Apply button was still showing — because the local
  // store had no memory of the prior application. GET /trips/:id now stamps
  // `my_application_id` + `my_application_status`; the page treats that as authoritative
  // and renders the same Applied UX as the local-store branch.
  it('treats trip.myApplicationStatus=applied as Applied even when local store is empty', () => {
    setStore({}); // empty local store — simulates re-login / new device
    setTrip({ data: makeTrip({ status: 'has_applicants', applicantCount: 1, myApplicationId: 'srv-app-1', myApplicationStatus: 'applied' }) });
    renderDetail();
    expect(screen.getByText(/you've applied/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /apply for this trip/i })).toBeNull();
    expect(screen.getByRole('button', { name: /withdraw application/i })).toBeInTheDocument();
  });

  it('the Withdraw button on a server-restored Applied state uses trip.myApplicationId', async () => {
    setStore({});
    setTrip({ data: makeTrip({ status: 'has_applicants', applicantCount: 1, myApplicationId: 'srv-app-2', myApplicationStatus: 'applied' }) });
    renderDetail();
    fireEvent.click(screen.getByRole('button', { name: /withdraw application/i }));
    await waitFor(() => expect(withdrawMutateAsync).toHaveBeenCalledWith({ tripId: 't1', acceptanceId: 'srv-app-2' }));
  });

  it('surfaces the API\'s actual error message when apply fails (e.g. 409 already applied)', async () => {
    setTrip({ data: makeTrip() });
    applyMutateAsync.mockRejectedValueOnce(new ApiError('You already applied to this trip', 409));
    renderDetail();
    fireEvent.click(screen.getByRole('button', { name: /apply for this trip/i }));
    await waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalledWith('You already applied to this trip'));
  });

  it('nudges the driver to add a vehicle when they have none', () => {
    setTrip({ data: makeTrip() });
    setVehicles({ data: [] });
    renderDetail();
    expect(screen.queryByRole('button', { name: /apply for this trip/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /add a vehicle/i }));
    expect(screen.getByText('profile page')).toBeInTheDocument();
  });

  it('routes an unverified driver to the Get Verified checklist when they tap "Get verified to apply"', () => {
    setTrip({ data: makeTrip() });
    setMyDriver({ data: { id: 'd1', kycStatus: 'docs_submitted' } });
    renderDetail();
    expect(screen.queryByRole('button', { name: /apply for this trip/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /get verified to apply/i }));
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

  it("shows an agent banner when the selected driver declined — with 'Review applicants' CTA when more applicants are waiting", () => {
    vi.mocked(useAuth).mockReturnValue({ user: agent, isAuthenticated: true, isLoading: false, requestOtp: vi.fn(), verifyOtp: vi.fn(), logout: vi.fn() });
    setTrip({ data: makeTrip({ status: 'has_applicants', applicantCount: 2, driverAcceptanceStatus: 'declined' }) });
    renderDetail();
    expect(screen.getByText(/your selected driver declined this trip/i)).toBeInTheDocument();
    expect(screen.getByText(/pick another driver — 2 applicants still waiting/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /review applicants/i })).toHaveAttribute('href', expect.stringContaining('/applicants'));
  });

  it('agent banner softens to "invite drivers" copy when no applicants remain after the decline', () => {
    vi.mocked(useAuth).mockReturnValue({ user: agent, isAuthenticated: true, isLoading: false, requestOtp: vi.fn(), verifyOtp: vi.fn(), logout: vi.fn() });
    setTrip({ data: makeTrip({ status: 'open', applicantCount: 0, driverAcceptanceStatus: 'declined' }) });
    renderDetail();
    expect(screen.getByText(/your selected driver declined this trip/i)).toBeInTheDocument();
    expect(screen.getByText(/invite drivers below to keep this trip moving/i)).toBeInTheDocument();
    // No Review-applicants CTA when there's nobody to review.
    expect(screen.queryByRole('link', { name: /review applicants/i })).toBeNull();
  });

  it('agent banner does NOT render once a new driver has been (re-)selected — driverAcceptanceStatus resets to pending', () => {
    vi.mocked(useAuth).mockReturnValue({ user: agent, isAuthenticated: true, isLoading: false, requestOtp: vi.fn(), verifyOtp: vi.fn(), logout: vi.fn() });
    setTrip({ data: makeTrip({ status: 'selected', applicantCount: 0, driverAcceptanceStatus: 'pending' }) });
    renderDetail();
    expect(screen.queryByText(/your selected driver declined/i)).toBeNull();
  });

  it('lets the assigned driver start the trip with the photo + odometer reading + passenger OTP', async () => {
    setTrip({ data: makeTrip({ status: 'accepted', assignedDriverId: 'd1' }) });
    renderDetail();
    expect(screen.getByText(/you're driving this trip/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /start the trip/i }));
    fireEvent.click(screen.getByRole('button', { name: /mock-upload:starting odometer photo/i }));
    fireEvent.change(screen.getByLabelText(/start odometer reading/i), { target: { value: '42000' } });
    fireEvent.change(screen.getByLabelText(/passenger otp/i), { target: { value: '654321' } });
    fireEvent.click(screen.getByRole('button', { name: /start the trip/i }));
    await waitFor(() => expect(startMutateAsync).toHaveBeenCalledWith({ tripId: 't1', input: { passengerOtp: '654321', startOdoReading: 42000, startOdoUrl: 't1/start_odo' } }));
  });

  it('the "Complete the trip" CTA sends the driver into the /trips/:id/complete wizard route', async () => {
    setTrip({ data: makeTrip({ status: 'in_progress', assignedDriverId: 'd1' }) });
    renderDetail();
    fireEvent.click(screen.getByRole('button', { name: /complete the trip/i }));
    await waitFor(() => expect(screen.getByTestId('complete-trip-route')).toBeInTheDocument());
  });

  it('lets the poster open the passenger share link once a driver is assigned', () => {
    vi.mocked(useAuth).mockReturnValue({ user: agent, isAuthenticated: true, isLoading: false, requestOtp: vi.fn(), verifyOtp: vi.fn(), logout: vi.fn() });
    setTrip({ data: makeTrip({ status: 'accepted', passengerOtp: '123456' }) });
    renderDetail();
    expect(screen.getByText(/passenger otp/i)).toBeInTheDocument();
    expect(screen.getByText('123456')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /send a passenger link/i }));
    expect(screen.getByText(/\/passenger\/123456/)).toBeInTheDocument();
  });

  it('lets the poster cancel an open trip with a reason', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: agent, isAuthenticated: true, isLoading: false, requestOtp: vi.fn(), verifyOtp: vi.fn(), logout: vi.fn() });
    setTrip({ data: makeTrip({ status: 'open' }) });
    renderDetail();
    fireEvent.click(screen.getByRole('button', { name: /cancel this trip/i }));
    const select = screen.getByRole('combobox', { name: /cancellation reason/i });
    // agent-only / "both" reasons appear; driver-only ones don't
    expect(screen.getByRole('option', { name: /passenger no longer needs the ride/i })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /driver-only reason/i })).toBeNull();
    fireEvent.change(select, { target: { value: 'cr1' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm cancellation/i }));
    await waitFor(() => expect(cancelMutateAsync).toHaveBeenCalledWith({ tripId: 't1', cancelReasonId: 'cr1' }));
  });

  it("doesn't show the cancel card to a non-poster, or once the trip is in progress", () => {
    setTrip({ data: makeTrip({ status: 'open' }) }); // default user is the driver, not the poster
    const { unmount } = renderDetail();
    expect(screen.queryByRole('button', { name: /cancel this trip/i })).toBeNull();
    unmount();
    vi.mocked(useAuth).mockReturnValue({ user: agent, isAuthenticated: true, isLoading: false, requestOtp: vi.fn(), verifyOtp: vi.fn(), logout: vi.fn() });
    setTrip({ data: makeTrip({ status: 'in_progress' }) });
    renderDetail();
    expect(screen.queryByRole('button', { name: /cancel this trip/i })).toBeNull();
  });

  // ── Selected handshake ────────────────────────────────────────────────────

  it('the selected driver sees the Accept card and Accept calls the accept mutation (no overlapping applications)', async () => {
    setTrip({ data: makeTrip({ status: 'selected', assignedDriverId: 'd1' }) });
    renderDetail();
    expect(screen.getByText(/you've been selected/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^accept$/i }));
    await waitFor(() => expect(acceptMutateAsync).toHaveBeenCalledWith({ tripId: 't1', withdrawAcceptanceIds: [] }));
  });

  it('the selected driver can decline (with a confirm prompt)', async () => {
    setTrip({ data: makeTrip({ status: 'selected', assignedDriverId: 'd1' }) });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderDetail();
    fireEvent.click(screen.getByRole('button', { name: /^decline$/i }));
    await waitFor(() => expect(declineMutateAsync).toHaveBeenCalledWith({ tripId: 't1' }));
    confirmSpy.mockRestore();
  });

  it("declining cancels if the driver dismisses the confirm prompt", () => {
    setTrip({ data: makeTrip({ status: 'selected', assignedDriverId: 'd1' }) });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderDetail();
    fireEvent.click(screen.getByRole('button', { name: /^decline$/i }));
    expect(declineMutateAsync).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('a 409 on accept tells the driver the trip is no longer available', async () => {
    acceptMutateAsync = vi.fn().mockRejectedValue(new ApiError('Gone', 409));
    vi.mocked(useAcceptTrip).mockReturnValue({ mutateAsync: acceptMutateAsync, isPending: false, isError: false } as never);
    setTrip({ data: makeTrip({ status: 'selected', assignedDriverId: 'd1' }) });
    renderDetail();
    fireEvent.click(screen.getByRole('button', { name: /^accept$/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/no longer available/i)));
  });

  // ── Agent awaiting acceptance ────────────────────────────────────────────

  it('the poster sees the Awaiting-acceptance banner and can withdraw the selection', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: agent, isAuthenticated: true, isLoading: false, requestOtp: vi.fn(), verifyOtp: vi.fn(), logout: vi.fn() });
    setTrip({ data: makeTrip({ status: 'selected', assignedDriverHandle: 'Z9X8Y7Q' }) });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderDetail();
    expect(screen.getAllByText(/awaiting acceptance/i).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /withdraw selection/i }));
    await waitFor(() => expect(cancelAssignMutateAsync).toHaveBeenCalledWith({ tripId: 't1' }));
    confirmSpy.mockRestore();
  });

  // ── Passenger edit ───────────────────────────────────────────────────────

  it('lets the poster edit passenger details inline and save them', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: agent, isAuthenticated: true, isLoading: false, requestOtp: vi.fn(), verifyOtp: vi.fn(), logout: vi.fn() });
    setTrip({ data: makeTrip({ status: 'open' }) });
    renderDetail();
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    fireEvent.change(screen.getByLabelText(/passenger name/i), { target: { value: 'New Name' } });
    fireEvent.click(screen.getByRole('button', { name: /save passenger details/i }));
    await waitFor(() => expect(updatePassengerMutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      tripId: 't1',
      input: expect.objectContaining({ passengerName: 'New Name' }),
    })));
  });

  // ── ApplyBar variants ────────────────────────────────────────────────────

  it('shows a Decline invitation button to an invited driver and fires the decline mutation on confirm', async () => {
    setTrip({ data: makeTrip({ invitationId: 'inv-1', invitationStatus: 'pending' }) });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderDetail();
    expect(screen.getByText(/you've been invited to this trip/i)).toBeInTheDocument();
    const declineBtn = screen.getByRole('button', { name: /decline invitation/i });
    fireEvent.click(declineBtn);
    await waitFor(() =>
      expect(declineInviteMutateAsync).toHaveBeenCalledWith({ tripId: 't1', inviteId: 'inv-1' }),
    );
    confirmSpy.mockRestore();
  });

  it('does not show Decline when the trip has no pending invitation for this driver', () => {
    setTrip({ data: makeTrip() });
    renderDetail();
    expect(screen.queryByRole('button', { name: /decline invitation/i })).toBeNull();
  });

  // Regression: user reported that declining from trip detail (after entering via the home
  // "Invites received" card → scoped list → trip card) was bouncing them to plain /my-trips
  // (tabbed view) instead of back to /my-trips?scope=invites-received (where they came from).
  // Confirms that `returnTo = ?from` correctly preserves the nested query string.
  it('after declining, navigates BACK to the scoped Invites Received list (preserves ?scope=)', async () => {
    setTrip({ data: makeTrip({ invitationId: 'inv-1', invitationStatus: 'pending' }) });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    // Mirror the URL the home → scoped list → trip card chain produces.
    const fromPath = '/my-trips?scope=invites-received&from=/';
    const entry = `/trips/t1?from=${encodeURIComponent(fromPath)}`;
    render(
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/trips/:id" element={<TripDetailPage />} />
          <Route
            path="/my-trips"
            element={
              <LocationProbe />
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /decline invitation/i }));
    await waitFor(() => expect(declineInviteMutateAsync).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByTestId('probe-search').textContent).toBe('?scope=invites-received&from=/'),
    );
    confirmSpy.mockRestore();
  });

  it('shows the multi-vehicle dropdown when the driver has more than one active vehicle', () => {
    setTrip({ data: makeTrip() });
    setVehicles({
      data: [
        makeVehicle(),
        makeVehicle({ id: 'v2', makeLabel: 'Maruti', modelName: 'Dzire', registrationNumber: 'TN02CD5678' }),
      ],
    });
    renderDetail();
    expect(screen.getByRole('combobox', { name: /apply with/i })).toBeInTheDocument();
  });

  // ── Cancel-reasons states ────────────────────────────────────────────────

  it('shows a loading state for the cancellation-reasons select while it loads', () => {
    vi.mocked(useAuth).mockReturnValue({ user: agent, isAuthenticated: true, isLoading: false, requestOtp: vi.fn(), verifyOtp: vi.fn(), logout: vi.fn() });
    setTrip({ data: makeTrip({ status: 'open' }) });
    setCancelReasons({ isPending: true, data: [] });
    renderDetail();
    fireEvent.click(screen.getByRole('button', { name: /cancel this trip/i }));
    expect(screen.getByText(/loading reasons/i)).toBeInTheDocument();
  });

  it('shows an error state with retry when cancellation reasons fail to load', () => {
    vi.mocked(useAuth).mockReturnValue({ user: agent, isAuthenticated: true, isLoading: false, requestOtp: vi.fn(), verifyOtp: vi.fn(), logout: vi.fn() });
    setTrip({ data: makeTrip({ status: 'open' }) });
    const refetch = vi.fn();
    setCancelReasons({ isPending: false, isError: true, data: [], refetch });
    renderDetail();
    fireEvent.click(screen.getByRole('button', { name: /cancel this trip/i }));
    expect(screen.getByText(/couldn't load cancellation reasons/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it('keep-the-trip button collapses the cancel card without firing the mutation', () => {
    vi.mocked(useAuth).mockReturnValue({ user: agent, isAuthenticated: true, isLoading: false, requestOtp: vi.fn(), verifyOtp: vi.fn(), logout: vi.fn() });
    setTrip({ data: makeTrip({ status: 'open' }) });
    renderDetail();
    fireEvent.click(screen.getByRole('button', { name: /cancel this trip/i }));
    expect(screen.getByText(/cancel this trip\?/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /keep the trip/i }));
    expect(cancelMutateAsync).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /cancel this trip/i })).toBeInTheDocument();
  });

  // ── Driver-posted trip ───────────────────────────────────────────────────

  it('labels the poster as a driver when the trip was posted by a driver', () => {
    setTrip({ data: makeTrip({ postedByRole: 'driver' }) });
    renderDetail();
    expect(screen.getByText(/another driver passing on a trip/i)).toBeInTheDocument();
  });

  // ── Status badges ────────────────────────────────────────────────────────

  it('renders the cancelled status badge and hides all driver/poster CTAs', () => {
    vi.mocked(useAuth).mockReturnValue({ user: agent, isAuthenticated: true, isLoading: false, requestOtp: vi.fn(), verifyOtp: vi.fn(), logout: vi.fn() });
    setTrip({ data: makeTrip({ status: 'cancelled' }) });
    renderDetail();
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cancel this trip/i })).toBeNull();
  });

  // Regression: the user-reported "1. 1. Call the customer…" — the saved instructions
  // text already starts each line with "N." and the <ol> auto-numbers. Strip the leading
  // counter so the visual order comes from the list element alone.
  it('strips leading "N." numbering from driver_instructions lines so the <ol> doesn\'t double-number', () => {
    setTrip({ data: makeTrip({ driverInstructions: '1. Call the customer before arrival\n2. Reach pickup 10 minutes early\n3) Follow Google Maps' }) });
    renderDetail();
    // Each rendered line should NOT include the leading "1. " / "2. " — only the body text.
    expect(screen.getByText('Call the customer before arrival')).toBeInTheDocument();
    expect(screen.getByText('Reach pickup 10 minutes early')).toBeInTheDocument();
    expect(screen.getByText('Follow Google Maps')).toBeInTheDocument();
    // Sanity: no rendered list item starts with "1." (the <ol>'s marker provides the digit).
    expect(screen.queryByText(/^1\.\s+Call the customer/)).toBeNull();
  });
});
