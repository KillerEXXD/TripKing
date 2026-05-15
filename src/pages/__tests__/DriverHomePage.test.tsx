import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { DriverHomePage } from '@/pages/DriverHomePage';
import { ApiError } from '@/lib/api/client';
import type { Driver, Trip, User } from '@/types';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }));
import { useAuth } from '@/contexts/AuthContext';
vi.mock('@/hooks/useDrivers', () => ({ useMyDriver: vi.fn() }));
import { useMyDriver } from '@/hooks/useDrivers';
vi.mock('@/hooks/useTrips', () => ({
  useTrips: vi.fn(),
  useMyApplications: vi.fn(() => ({ isPending: false, isError: false, isSuccess: true, data: [], refetch: vi.fn() })),
  useCompleteTrip: vi.fn(() => ({ isPending: false, mutateAsync: vi.fn().mockResolvedValue(undefined) })),
}));
import { useTrips } from '@/hooks/useTrips';
vi.mock('@/hooks/useVacancies', () => ({
  useVacancies: vi.fn(),
  useMyActiveVacancies: vi.fn(() => ({ isPending: false, isError: false, isSuccess: true, data: [], refetch: vi.fn() })),
}));
import { useVacancies } from '@/hooks/useVacancies';
vi.mock('@/hooks/useNotifications', () => ({ useUnreadNotificationCount: vi.fn(() => 0) }));
vi.mock('@/hooks/useAdminConfig', () => ({
  cityHooks: { useList: vi.fn(() => ({ data: [] })) },
  useAppSettings: vi.fn(() => ({ isPending: false, data: { maxActiveVacanciesPerDriver: 2 } })),
}));
vi.mock('@/components/layout/InstallAppCard', () => ({ InstallAppCard: () => <div>install card</div> }));

const driverUser: User = { id: 'u1', role: 'driver', phone: '+91', displayName: 'Ravi Kumar', preferredLanguage: 'en', isActive: true, canReportBugs: false };
const city = (id: string, name: string) => ({ id, name, state: 'TN', lat: 12.9, lng: 79.1, sortOrder: 1, isActive: true });
function makeDriver(over: Partial<Driver> = {}): Driver {
  return { id: 'd1', userId: 'u1', fullName: 'Ravi Kumar', displayHandle: 'A1B2C3D', canReportBugs: false, phone: '+91', homeCity: city('c1', 'Vellore'), currentCity: city('c1', 'Vellore'), profilePhotoUrl: '', kycStatus: 'approved', ratingAvg: 4.7, ratingCount: 9, ratingDistribution: { '1': 0, '2': 0, '3': 1, '4': 2, '5': 6 }, topTags: ['Punctual'], managerTopTags: [], totalTripsCompleted: 20, vehicles: [], ...over };
}
function makeTrip(over: Partial<Trip> = {}): Trip {
  return { id: 't1', postedByUserId: 'u9', postedByRole: 'trip_manager', postedByName: 'Agent', postedByHandle: 'A1B2C3D', fromCity: city('c1', 'Vellore'), toCity: city('c2', 'Chennai'), pickupAt: '2099-06-01T09:00:00Z', expectedDistanceKm: 140, carTypeId: 'ct1', carTypeLabel: 'Sedan', seatsRequired: 4, acRequired: true, ratePerKm: 14, totalFare: 1960, commissionPct: 10, gstAmount: 98, driverBata: 300, extrasPaidByPassenger: true, driverPayout: 2200, passengerName: 'P', passengerPhone: '+91', passengerCount: 2, status: 'open', showFareToPassenger: true, hidePassengerPhone: false, applicantCount: 0, pendingInvitationCount: 0, createdAt: '2099-05-30T00:00:00Z', acceptanceWindowMinutes: 15, ...over };
}

function setUser(user: User = driverUser) {
  vi.mocked(useAuth).mockReturnValue({ user, isAuthenticated: true, isLoading: false, requestOtp: vi.fn(), verifyOtp: vi.fn(), logout: vi.fn() });
}
type QS = { isPending?: boolean; isError?: boolean; isSuccess?: boolean; error?: unknown; data?: unknown; refetch?: () => void };
function setMyDriver(s: QS = {}) {
  vi.mocked(useMyDriver).mockReturnValue({ isPending: false, isError: false, isSuccess: true, error: null, data: undefined, refetch: vi.fn(), ...s } as never);
}
function setTrips(perCall: QS[] | QS) {
  // DriverHome calls useTrips twice (nearby, my-posts); accept an array or a single state for both.
  let i = 0;
  const arr = Array.isArray(perCall) ? perCall : [perCall, perCall];
  vi.mocked(useTrips).mockImplementation(() => ({ isPending: false, isError: false, isSuccess: true, data: [], refetch: vi.fn(), ...(arr[i++] ?? arr[arr.length - 1]) }) as never);
}
function setVacancies(s: QS = {}) {
  vi.mocked(useVacancies).mockReturnValue({ isPending: false, isError: false, isSuccess: true, data: [], refetch: vi.fn(), ...s } as never);
}

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<DriverHomePage />} />
        <Route path="/onboarding" element={<div>onboarding page</div>} />
        <Route path="/trips" element={<div>trips feed</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('DriverHomePage', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReset();
    vi.mocked(useMyDriver).mockReset();
    vi.mocked(useTrips).mockReset();
    vi.mocked(useVacancies).mockReset();
    setUser();
    setMyDriver({ data: makeDriver() });
    setTrips({ data: [] });
    setVacancies({ data: [] });
  });

  it('prompts to onboard when the user has no driver profile (404)', () => {
    setMyDriver({ isError: true, isSuccess: false, error: new ApiError('No profile', 404) });
    renderHome();
    expect(screen.getByText(/finish setting up your driver profile/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /set up my profile/i }));
    expect(screen.getByText('onboarding page')).toBeInTheDocument();
  });

  it('shows a skeleton while the profile loads', () => {
    setMyDriver({ isPending: true, isSuccess: false });
    renderHome();
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
  });

  it('shows an error state with retry on a non-404 failure', () => {
    const refetch = vi.fn();
    setMyDriver({ isError: true, isSuccess: false, error: new Error('boom'), refetch });
    renderHome();
    expect(screen.getByText(/couldn't load your home/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it('renders the driver home — greeting, reputation, empty feed', () => {
    setMyDriver({ data: makeDriver() });
    setTrips({ data: [] });
    renderHome();
    // Greeting uses the first name from the loaded profile, not the role label.
    expect(screen.getByText('Ravi')).toBeInTheDocument();
    expect(screen.getByText('Driver')).toBeInTheDocument();
    expect(screen.getByText(/your reputation/i)).toBeInTheDocument();
    expect(screen.getByText(/no open trips/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Your profile' })).toHaveAttribute('href', '/profile');
  });

  it('Driving-now card: rich details + End trip + Continue when a trip is in progress', async () => {
    const completeMutateAsync = vi.fn().mockResolvedValue(undefined);
    const useTripsMod = await import('@/hooks/useTrips');
    vi.mocked(useTripsMod.useCompleteTrip).mockReturnValue({ isPending: false, mutateAsync: completeMutateAsync } as never);
    const inProg = makeTrip({ id: 'in-progress-1', status: 'in_progress', passengerCount: 3 });
    // useTrips is called for nearby, my-posts, AND my-driving — the my-driving call returns this trip.
    let call = 0;
    vi.mocked(useTrips).mockImplementation((args) => {
      call++;
      const driving = args && (args as { assignedDriverId?: string }).assignedDriverId === 'me';
      return { isPending: false, isError: false, isSuccess: true, data: driving ? [inProg] : [], refetch: vi.fn() } as never;
    });
    expect(call).toBe(0);
    renderHome();
    expect(screen.getByText('Vellore → Chennai')).toBeInTheDocument();
    expect(screen.getByText(/140 km/i)).toBeInTheDocument();
    expect(screen.getByText(/3 pax/i)).toBeInTheDocument();
    // Both action buttons are present.
    const endBtn = screen.getByRole('button', { name: /end trip/i });
    expect(endBtn).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^continue$/i })).toHaveAttribute('href', '/trips/in-progress-1');
    // End trip wires through to useCompleteTrip with the trip id (confirm via window.confirm stub).
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(endBtn);
    expect(completeMutateAsync).toHaveBeenCalledWith({ tripId: 'in-progress-1' });
    confirmSpy.mockRestore();
  });

  it('shows the Invitation-waiting card on Home when the driver has a pending received invitation', () => {
    const invited = makeTrip({ id: 'inv-9', toCity: city('c8', 'Bangalore'), invitationId: 'iv-1', invitationStatus: 'pending' });
    vi.mocked(useTrips).mockImplementation((args) => {
      const isInvited = !!args && (args as { invited?: string }).invited === 'me';
      return { isPending: false, isError: false, isSuccess: true, data: isInvited ? [invited] : [], refetch: vi.fn() } as never;
    });
    renderHome();
    const card = screen.getByRole('link', { name: /invitation to drive vellore to bangalore/i });
    expect(card).toHaveAttribute('href', '/trips/inv-9?from=/');
    expect(card).toHaveTextContent(/accept or decline/i);
  });

  it('hides the Invitation-waiting card when the driver has already applied to that trip', async () => {
    const invited = makeTrip({ id: 'inv-9', toCity: city('c8', 'Bangalore'), invitationId: 'iv-1', invitationStatus: 'pending' });
    vi.mocked(useTrips).mockImplementation((args) => {
      const isInvited = !!args && (args as { invited?: string }).invited === 'me';
      return { isPending: false, isError: false, isSuccess: true, data: isInvited ? [invited] : [], refetch: vi.fn() } as never;
    });
    const { useMyApplications } = await import('@/hooks/useTrips');
    vi.mocked(useMyApplications).mockReturnValueOnce({ isPending: false, isError: false, isSuccess: true, data: [{ acceptanceId: 'a1', status: 'applied', appliedAt: '2099-05-30T00:00:00Z', trip: invited }], refetch: vi.fn() } as never);
    renderHome();
    expect(screen.queryByRole('link', { name: /invitation to drive vellore to bangalore/i })).toBeNull();
  });

  it('priority stack: hides "Driving now" when no in-progress trip; hides Review when no selected apps; I\'m vacant always renders', () => {
    setMyDriver({ data: makeDriver() });
    setTrips({ data: [] });
    renderHome();
    expect(screen.queryByText(/driving now/i)).toBeNull();
    expect(screen.queryByText(/waiting for your decision/i)).toBeNull();
    expect(screen.queryByText(/no trip in progress/i)).toBeNull();
    expect(screen.queryByText(/no trips waiting for your decision/i)).toBeNull();
    expect(screen.getByTestId('i-am-available-card')).toBeInTheDocument();
  });

  it('priority stack: renders Review when an application is in "selected" state, plus I\'m vacant below', async () => {
    const useTripsMod = await import('@/hooks/useTrips');
    const selectedApp = { acceptanceId: 'a-sel', status: 'selected' as const, appliedAt: '2099-05-31T00:00:00Z', trip: makeTrip({ id: 't-sel' }) };
    vi.mocked(useTripsMod.useMyApplications).mockReturnValue({ isPending: false, isError: false, isSuccess: true, data: [selectedApp], refetch: vi.fn() } as never);
    setTrips({ data: [] });
    renderHome();
    expect(screen.getByText(/waiting for your decision/i)).toBeInTheDocument();
    expect(screen.getByTestId('i-am-available-card')).toBeInTheDocument();
    expect(screen.queryByText(/driving now/i)).toBeNull();
    // Restore the file-level default so the next test isn't polluted with a selected app.
    vi.mocked(useTripsMod.useMyApplications).mockReturnValue({ isPending: false, isError: false, isSuccess: true, data: [], refetch: vi.fn() } as never);
  });

  it('shows the open-trips-near-you feed and an applicants prompt for a posted trip', () => {
    setTrips([{ data: [makeTrip({ id: 't1' })] }, { data: [makeTrip({ id: 'p1', status: 'has_applicants', postedByUserId: 'u1', postedByRole: 'driver' })] }]);
    renderHome();
    expect(screen.getByText('Vellore → Chennai')).toBeInTheDocument();
    expect(screen.getByText(/trip you posted has applicants/i)).toBeInTheDocument();
  });
});
