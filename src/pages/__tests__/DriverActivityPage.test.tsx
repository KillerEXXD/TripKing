import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DriverActivityPage } from '@/pages/DriverActivityPage';
import type { MyApplication, Trip, TripsQueryParams, User } from '@/types';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }));
import { useAuth } from '@/contexts/AuthContext';
vi.mock('@/hooks/useTrips', () => ({ useTrips: vi.fn(), useMyApplications: vi.fn(), useWithdrawApplication: vi.fn(), useDeclineTripInvite: vi.fn() }));
import { useDeclineTripInvite, useMyApplications, useTrips, useWithdrawApplication } from '@/hooks/useTrips';
vi.mock('@/stores/myApplicationsStore', async () => {
  const actual = await vi.importActual<typeof import('@/stores/myApplicationsStore')>('@/stores/myApplicationsStore');
  return { ...actual, useMyApplicationsStore: vi.fn() };
});
import { useMyApplicationsStore } from '@/stores/myApplicationsStore';
vi.mock('@/hooks/useDrivers', () => ({ useMyDriver: vi.fn() }));
import { useMyDriver } from '@/hooks/useDrivers';
vi.mock('@/hooks/useVacancies', () => ({ useMyActiveVacancies: vi.fn(), useCancelVacancy: vi.fn() }));
import { useCancelVacancy, useMyActiveVacancies } from '@/hooks/useVacancies';
vi.mock('@/components/share/ShareTripModal', () => ({ ShareTripModal: () => <div>share modal</div> }));

const user: User = { id: 'u1', role: 'driver', phone: '+91', displayName: 'Ravi', preferredLanguage: 'en', isActive: true, canReportBugs: false };
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
    pendingInvitationCount: 0,
    createdAt: '2099-05-30T00:00:00.000Z',
    acceptanceWindowMinutes: 15,
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

function setUp({ driving = tripsState(), posted = tripsState(), invited = tripsState(), applied = appsState() } = {}) {
  vi.mocked(useAuth).mockReturnValue({ user, isAuthenticated: true, isLoading: false, requestOtp: vi.fn(), verifyOtp: vi.fn(), logout: vi.fn() } as never);
  vi.mocked(useTrips).mockImplementation((params?: TripsQueryParams) => (params?.assignedDriverId ? driving : params?.invited ? invited : posted) as never);
  vi.mocked(useMyApplications).mockReturnValue(applied as never);
  vi.mocked(useMyDriver).mockReturnValue({ isPending: false, isError: false, data: { id: 'd1' }, refetch: vi.fn() } as never);
  vi.mocked(useMyActiveVacancies).mockReturnValue({ isPending: false, isError: false, data: [], refetch: vi.fn() } as never);
  vi.mocked(useCancelVacancy).mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
  vi.mocked(useWithdrawApplication).mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false } as never);
  vi.mocked(useDeclineTripInvite).mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false } as never);
  vi.mocked(useMyApplicationsStore).mockImplementation(((selector?: (s: unknown) => unknown) => {
    const state = { byTrip: {}, recordApplication: vi.fn(), clearApplication: vi.fn() };
    return selector ? selector(state) : state;
  }) as never);
}
const renderPage = () => render(<MemoryRouter><DriverActivityPage /></MemoryRouter>);

describe('DriverActivityPage', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReset();
    vi.mocked(useTrips).mockReset();
    vi.mocked(useMyApplications).mockReset();
    vi.mocked(useMyDriver).mockReset();
    vi.mocked(useMyActiveVacancies).mockReset();
    vi.mocked(useCancelVacancy).mockReset();
    vi.mocked(useWithdrawApplication).mockReset();
    vi.mocked(useDeclineTripInvite).mockReset();
    vi.mocked(useMyApplicationsStore).mockReset();
  });

  it('shows the three tabs and lists the trips assigned to you by default', () => {
    setUp({ driving: tripsState({ data: [makeTrip({ id: 'd-1', status: 'accepted' })] }) });
    renderPage();
    expect(screen.getByRole('heading', { name: /my trips/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^driving/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^applied/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /posted by me/i })).toBeInTheDocument();
    expect(screen.getByText('Vellore → Chennai')).toBeInTheDocument();
  });

  it('a not-picked (rejected) Applied row expands inline, shows a status banner + limited details, and exposes no agent PII', () => {
    setUp({ applied: appsState({ data: [makeApp({ status: 'rejected', applicantQuotedRatePerKm: 13 })] }) });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /^applied/i }));
    expect(screen.getByText(/not selected/i)).toBeInTheDocument();
    // No navigation link to the full /trips/:id page for a not-picked applicant.
    expect(screen.queryByRole('link', { name: /view trip/i })).toBeNull();
    // Expanding stays in place.
    const toggle = screen.getByRole('button', { name: /view details/i });
    fireEvent.click(toggle);
    expect(screen.getByText(/you weren.t selected for this trip/i)).toBeInTheDocument();
    // Agent identity must not be in the DOM even though the trip stub carries postedByName.
    expect(screen.queryByText(/agent a/i)).toBeNull();
    expect(screen.queryByRole('link', { name: /call/i })).toBeNull();
    // No Withdraw button on a rejected row.
    expect(screen.queryByRole('button', { name: /withdraw/i })).toBeNull();
  });

  it('an "applied" (awaiting decision) row shows the right banner + a Withdraw action that clears the store', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(undefined);
    const clearApplication = vi.fn();
    setUp({ applied: appsState({ data: [makeApp({ status: 'applied', trip: makeTrip({ id: 't-app', status: 'open' }) })] }) });
    vi.mocked(useWithdrawApplication).mockReturnValue({ mutateAsync, isPending: false } as never);
    vi.mocked(useMyApplicationsStore).mockImplementation(((selector?: (s: unknown) => unknown) => {
      const state = { byTrip: {}, recordApplication: vi.fn(), clearApplication };
      return selector ? selector(state) : state;
    }) as never);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /^applied/i }));
    fireEvent.click(screen.getByRole('button', { name: /view details/i }));
    expect(screen.getByText(/awaiting the agent.s decision/i)).toBeInTheDocument();
    expect(screen.queryByText(/agent a/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /withdraw application/i }));
    expect(confirmSpy).toHaveBeenCalled();
    await Promise.resolve();
    expect(mutateAsync).toHaveBeenCalledWith({ tripId: 't-app', acceptanceId: 'a1' });
    expect(clearApplication).toHaveBeenCalledWith('t-app');
    confirmSpy.mockRestore();
  });

  it('an "applied" row where another driver is already locked in shows the "another driver was selected" banner', () => {
    setUp({ applied: appsState({ data: [makeApp({ status: 'applied', trip: makeTrip({ id: 't-lock', status: 'in_progress' }) })] }) });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /^applied/i }));
    fireEvent.click(screen.getByRole('button', { name: /view details/i }));
    expect(screen.getByText(/another driver was selected for this trip/i)).toBeInTheDocument();
  });

  it('a selected Applied row keeps the "View trip" link to the full detail page (no inline expand)', () => {
    setUp({ applied: appsState({ data: [makeApp({ status: 'selected', trip: makeTrip({ id: 't-sel' }) })] }) });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /^applied/i }));
    expect(screen.getByRole('link', { name: /view trip/i })).toHaveAttribute('href', '/trips/t-sel');
    expect(screen.queryByRole('button', { name: /view details/i })).toBeNull();
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

  it('the Invited tab lists trips the driver was invited to', () => {
    setUp({ invited: tripsState({ data: [makeTrip({ id: 'i-1', toCity: city('c8', 'Bangalore') })] }) });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /^invited/i }));
    expect(screen.getByText('Vellore → Bangalore')).toBeInTheDocument();
  });

  it('Invited tab: shows a "Decline" button for pending invites, declining calls the mutation', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(undefined);
    setUp({ invited: tripsState({ data: [makeTrip({ id: 'i-1', toCity: city('c8', 'Bangalore'), invitationId: 'inv-1', invitationStatus: 'pending' })] }) });
    vi.mocked(useDeclineTripInvite).mockReturnValue({ mutateAsync, isPending: false } as never);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /^invited/i }));
    fireEvent.click(screen.getByRole('button', { name: /^decline$/i }));
    expect(confirmSpy).toHaveBeenCalled();
    await Promise.resolve();
    expect(mutateAsync).toHaveBeenCalledWith({ tripId: 'i-1', inviteId: 'inv-1' });
    confirmSpy.mockRestore();
  });

  it('Invited tab: loading / error / empty render their feedback states', () => {
    setUp({ invited: tripsState({ isPending: true }) });
    const { unmount } = renderPage();
    fireEvent.click(screen.getByRole('button', { name: /^invited/i }));
    expect(document.querySelector('[aria-busy="true"], [role="status"], .animate-pulse, [data-testid="loading-skeleton"]') ?? screen.queryByText(/loading/i)).toBeTruthy();
    unmount();

    setUp({ invited: tripsState({ isError: true }) });
    const r2 = renderPage();
    fireEvent.click(screen.getByRole('button', { name: /^invited/i }));
    expect(screen.getByText(/couldn't load your invites/i)).toBeInTheDocument();
    r2.unmount();

    setUp({ invited: tripsState({ data: [] }) });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /^invited/i }));
    expect(screen.getByText(/no invitations yet/i)).toBeInTheDocument();
  });

  it('Invited tab: declining shows an error toast when the mutation rejects', async () => {
    const mutateAsync = vi.fn().mockRejectedValue(new Error('boom'));
    setUp({ invited: tripsState({ data: [makeTrip({ id: 'i-err', invitationId: 'inv-err', invitationStatus: 'pending' })] }) });
    vi.mocked(useDeclineTripInvite).mockReturnValue({ mutateAsync, isPending: false } as never);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /^invited/i }));
    fireEvent.click(screen.getByRole('button', { name: /^decline$/i }));
    await Promise.resolve();
    await Promise.resolve();
    expect(mutateAsync).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('Invited tab: cancelling the confirm prompt does not call the mutation', () => {
    const mutateAsync = vi.fn();
    setUp({ invited: tripsState({ data: [makeTrip({ id: 'i-c', invitationId: 'inv-c', invitationStatus: 'pending' })] }) });
    vi.mocked(useDeclineTripInvite).mockReturnValue({ mutateAsync, isPending: false } as never);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /^invited/i }));
    fireEvent.click(screen.getByRole('button', { name: /^decline$/i }));
    expect(mutateAsync).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('Invited tab: no "Decline" button when the invitation is already applied (or invitation_id is absent)', () => {
    setUp({ invited: tripsState({ data: [
      makeTrip({ id: 'i-a', invitationId: 'inv-a', invitationStatus: 'applied' }),
      makeTrip({ id: 'i-b' }),
    ] }) });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /^invited/i }));
    expect(screen.queryByRole('button', { name: /^decline$/i })).toBeNull();
  });

  it('surfaces an error on the Driving tab', () => {
    setUp({ driving: tripsState({ isError: true }) });
    renderPage();
    expect(screen.getByText(/couldn't load your trips/i)).toBeInTheDocument();
  });

  it('Driving chip shows only in_progress + accepted (not selected / completed / cancelled)', () => {
    setUp({ driving: tripsState({ data: [
      makeTrip({ id: 'd-acc', status: 'accepted', toCity: city('cA', 'Accepted-to') }),
      makeTrip({ id: 'd-prog', status: 'in_progress', toCity: city('cB', 'Inprog-to') }),
      makeTrip({ id: 'd-sel', status: 'selected', toCity: city('cC', 'Selected-to') }),
      makeTrip({ id: 'd-done', status: 'completed', toCity: city('cD', 'Done-to') }),
      makeTrip({ id: 'd-cxl', status: 'cancelled', toCity: city('cE', 'Cancelled-to') }),
    ] }) });
    renderPage();
    // Default tab is Driving
    expect(screen.getByText(/vellore → accepted-to/i)).toBeInTheDocument();
    expect(screen.getByText(/vellore → inprog-to/i)).toBeInTheDocument();
    expect(screen.queryByText(/vellore → selected-to/i)).toBeNull();
    expect(screen.queryByText(/vellore → done-to/i)).toBeNull();
    expect(screen.queryByText(/vellore → cancelled-to/i)).toBeNull();
  });

  it('Selected / Completed / Cancelled chips each filter the assigned list to their bucket', () => {
    setUp({ driving: tripsState({ data: [
      makeTrip({ id: 'd-prog', status: 'in_progress', toCity: city('cB', 'Inprog-to') }),
      makeTrip({ id: 'd-sel', status: 'selected', toCity: city('cC', 'Selected-to') }),
      makeTrip({ id: 'd-done', status: 'completed', toCity: city('cD', 'Done-to') }),
      makeTrip({ id: 'd-cxl', status: 'cancelled', toCity: city('cE', 'Cancelled-to') }),
    ] }) });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /^selected/i }));
    expect(screen.getByText(/vellore → selected-to/i)).toBeInTheDocument();
    expect(screen.queryByText(/vellore → inprog-to/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^completed/i }));
    expect(screen.getByText(/vellore → done-to/i)).toBeInTheDocument();
    expect(screen.queryByText(/vellore → selected-to/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^cancelled/i }));
    expect(screen.getByText(/vellore → cancelled-to/i)).toBeInTheDocument();
    expect(screen.queryByText(/vellore → done-to/i)).toBeNull();
  });

  it('All chip unions assigned + invited + applied and sorts by lifecycle priority', () => {
    setUp({
      driving: tripsState({ data: [
        makeTrip({ id: 'd-prog', status: 'in_progress', toCity: city('cB', 'Driving-to') }),
        makeTrip({ id: 'd-cxl', status: 'cancelled', toCity: city('cE', 'Cancelled-to') }),
      ] }),
      invited: tripsState({ data: [makeTrip({ id: 'inv-1', toCity: city('cI', 'Invited-to') })] }),
      applied: appsState({ data: [makeApp({ acceptanceId: 'app-1', status: 'applied', trip: makeTrip({ id: 'app-trip', toCity: city('cP', 'Applied-to') }) })] }),
    });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /^all/i }));
    const cards = screen.getAllByText(/vellore → \w+-to/i);
    expect(cards[0]).toHaveTextContent(/driving-to/i);
    expect(cards[1]).toHaveTextContent(/invited-to/i);
    expect(cards[2]).toHaveTextContent(/applied-to/i);
    expect(cards[3]).toHaveTextContent(/cancelled-to/i);
  });

  it('All chip dedupes — a trip that\'s both assigned and applied appears once, bucketed under Driving', () => {
    const trip = makeTrip({ id: 'shared', status: 'in_progress', toCity: city('cS', 'Shared-to') });
    setUp({
      driving: tripsState({ data: [trip] }),
      applied: appsState({ data: [makeApp({ acceptanceId: 'app-shared', status: 'selected', trip })] }),
    });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /^all/i }));
    const matches = screen.getAllByText(/vellore → shared-to/i);
    expect(matches.length).toBe(1);
    // The driving-bucket card uses PostedTripCard (status badge 'In progress'), not the ApplicationRow
    // (which would show 'Selected — you got it!'). Verify it took the higher-priority bucket.
    expect(screen.queryByText(/selected — you got it/i)).toBeNull();
    expect(screen.getByText(/in progress/i)).toBeInTheDocument();
  });
});
