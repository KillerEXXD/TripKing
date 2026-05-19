import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DriverActivityPage } from '@/pages/DriverActivityPage';
import type { MyApplication, Trip, TripsQueryParams, User } from '@/types';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }));
import { useAuth } from '@/contexts/AuthContext';
vi.mock('@/hooks/useTrips', () => ({ useTrips: vi.fn(), useMyApplications: vi.fn(), useWithdrawApplication: vi.fn(), useDeclineTripInvite: vi.fn() }));
import { useDeclineTripInvite, useMyApplications, useTrips, useWithdrawApplication } from '@/hooks/useTrips';
// "Trip details changed" chip on Applied cards reads from useNotifications. Default empty
// so existing tests don't see the chip; the dedicated test below overrides per-call.
vi.mock('@/hooks/useNotifications', () => ({ useNotifications: vi.fn(() => ({ data: [] })) }));
vi.mock('@/stores/myApplicationsStore', async () => {
  const actual = await vi.importActual<typeof import('@/stores/myApplicationsStore')>('@/stores/myApplicationsStore');
  return { ...actual, useMyApplicationsStore: vi.fn() };
});
import { useMyApplicationsStore } from '@/stores/myApplicationsStore';
vi.mock('@/hooks/useDrivers', () => ({ useMyDriver: vi.fn() }));
import { useMyDriver } from '@/hooks/useDrivers';
vi.mock('@/hooks/useVacancies', () => ({ useMyActiveVacancies: vi.fn(), useMyExpiredVacancies: vi.fn(), useCancelVacancy: vi.fn() }));
import { useCancelVacancy, useMyActiveVacancies, useMyExpiredVacancies } from '@/hooks/useVacancies';
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
  vi.mocked(useMyExpiredVacancies).mockReturnValue({ isPending: false, isError: false, data: [], refetch: vi.fn() } as never);
  vi.mocked(useCancelVacancy).mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
  vi.mocked(useWithdrawApplication).mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false } as never);
  vi.mocked(useDeclineTripInvite).mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false } as never);
  vi.mocked(useMyApplicationsStore).mockImplementation(((selector?: (s: unknown) => unknown) => {
    const state = { byTrip: {}, recordApplication: vi.fn(), clearApplication: vi.fn() };
    return selector ? selector(state) : state;
  }) as never);
}
const renderPage = (url = '/app/my-trips') => render(<MemoryRouter initialEntries={[url]}><DriverActivityPage /></MemoryRouter>);

describe('DriverActivityPage', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReset();
    vi.mocked(useTrips).mockReset();
    vi.mocked(useMyApplications).mockReset();
    vi.mocked(useMyDriver).mockReset();
    vi.mocked(useMyActiveVacancies).mockReset();
    vi.mocked(useMyExpiredVacancies).mockReset();
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
    expect(screen.getByRole('link', { name: /view trip/i })).toHaveAttribute('href', '/app/trips/t-sel');
    expect(screen.queryByRole('button', { name: /view details/i })).toBeNull();
  });

  it('renders an applied row without crashing when the trip carries an unrecognised status (Sentry regression)', () => {
    // Prior to the STATUS_META fallback, an unrecognised t.status (e.g. server enum
    // drift) crashed render with "Cannot read properties of undefined (reading 'variant')".
    setUp({ applied: appsState({ data: [makeApp({ status: 'applied', trip: makeTrip({ id: 't-unk', toCity: city('c8', 'Pondicherry'), status: 'unknown_future_status' as never }) })] }) });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /^applied/i }));
    // Render succeeds (route → city line + fallback status label). Pre-fix, this threw.
    expect(screen.getByText('Vellore → Pondicherry')).toBeInTheDocument();
    expect(screen.getByText(/trip is unknown_future_status/i)).toBeInTheDocument();
  });

  it('the Posted tab lists the trips you posted yourself', () => {
    setUp({ posted: tripsState({ data: [makeTrip({ id: 'p-1', toCity: city('c9', 'Salem') })] }) });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /posted by me/i }));
    expect(screen.getByText('Vellore → Salem')).toBeInTheDocument();
  });

  // Regression: user reported the newest-posted trip was landing at the bottom of the Posted
  // tab because the server returns trips ordered by pickup_at ASC. Sort client-side by
  // createdAt DESC for "my posts" so a just-posted trip pops to the top.
  it('the Posted tab sorts newest-posted first (createdAt DESC)', () => {
    setUp({ posted: tripsState({ data: [
      makeTrip({ id: 'p-old',    toCity: city('co', 'OldDest'),    createdAt: '2026-05-10T08:00:00.000Z' }),
      makeTrip({ id: 'p-newest', toCity: city('cn', 'NewestDest'), createdAt: '2026-05-18T08:00:00.000Z' }),
      makeTrip({ id: 'p-mid',    toCity: city('cm', 'MidDest'),    createdAt: '2026-05-14T08:00:00.000Z' }),
    ] }) });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /posted by me/i }));
    const rendered = screen.getAllByText(/vellore → /i).map((el) => el.textContent ?? '');
    // First headline must be the newest trip; the oldest must come last.
    expect(rendered[0]).toMatch(/newestdest/i);
    expect(rendered[rendered.length - 1]).toMatch(/olddest/i);
  });

  // Regression: user reported that tapping a trip from /my-trips?tab=posted → trip detail →
  // Back arrow was returning to the default Driving tab instead of staying on Posted. Fix is
  // to pass linkFromPath="/app/my-trips?tab=posted" to each card, so trip-detail's Back honors it.
  it('the Posted tab encodes ?tab=posted in each trip card link so back-nav preserves the tab', () => {
    setUp({ posted: tripsState({ data: [makeTrip({ id: 'p-back', toCity: city('cb', 'BackCity') })] }) });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /posted by me/i }));
    const links = screen.getAllByRole('link').filter((a) => (a.getAttribute('href') ?? '').startsWith('/app/trips/p-back'));
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      // /my-trips?tab=posted encoded → %2Fapp%2Fmy-trips%3Ftab%3Dposted
      expect(link.getAttribute('href')).toMatch(/[?&]from=%2Fapp%2Fmy-trips%3Ftab%3Dposted/);
    }
  });

  it('empty states — no assigned trips; no applications (with a Browse CTA)', () => {
    setUp();
    renderPage();
    expect(screen.getByText(/no trips assigned to you yet/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^applied/i }));
    expect(screen.getByText(/haven't applied to any trips/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /browse trips/i })).toHaveAttribute('href', '/app/trips');
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
    // Button label is now "Decline invitation" (full button) — matches the more visible affordance.
    fireEvent.click(screen.getByRole('button', { name: /decline invitation/i }));
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
    fireEvent.click(screen.getByRole('button', { name: /decline invitation/i }));
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
    fireEvent.click(screen.getByRole('button', { name: /decline invitation/i }));
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
    expect(screen.queryByRole('button', { name: /decline invitation/i })).toBeNull();
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

  it('?scope=invites-received — hides the tab strip, swaps the header to a back arrow + scoped title, renders just the InvitedList', () => {
    setUp({
      invited: tripsState({ data: [
        makeTrip({ id: 'inv-a', toCity: city('cA', 'InvitedA-to'), invitationId: 'i-a', invitationStatus: 'pending' }),
        makeTrip({ id: 'inv-b', toCity: city('cB', 'InvitedB-to'), invitationId: 'i-b', invitationStatus: 'pending' }),
      ] }),
    });
    renderPage('/app/my-trips?scope=invites-received&from=/app');
    // Scoped header
    expect(screen.getByText('Invites received')).toBeInTheDocument();
    expect(screen.getByText(/2 trips waiting for your decision/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
    // No tab strip — the "All" / "Driving" / "Invited" tab buttons should NOT be present
    expect(screen.queryByRole('button', { name: /^all/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^driving/i })).toBeNull();
    // Both invited trips render
    expect(screen.getByText(/vellore → invitedA-to/i)).toBeInTheDocument();
    expect(screen.getByText(/vellore → invitedB-to/i)).toBeInTheDocument();
  });

  it('?scope=invites-received — count matches the home card (filters out non-pending and already-applied invites)', () => {
    const pending1 = makeTrip({ id: 't-p1', toCity: city('cp1', 'Pending1-to'), invitationId: 'i-p1', invitationStatus: 'pending' });
    const pending2 = makeTrip({ id: 't-p2', toCity: city('cp2', 'Pending2-to'), invitationId: 'i-p2', invitationStatus: 'pending' });
    const alreadyApplied = makeTrip({ id: 't-app', toCity: city('ca', 'AlreadyApplied-to'), invitationId: 'i-app', invitationStatus: 'pending' });
    const declined = makeTrip({ id: 't-dec', toCity: city('cd', 'Declined-to'), invitationId: 'i-dec', invitationStatus: 'declined' });
    setUp({
      invited: tripsState({ data: [pending1, pending2, alreadyApplied, declined] }),
      // alreadyApplied appears as a separate application — must be filtered out of the
      // "waiting for your decision" view (same filter the home card applies).
      applied: appsState({ data: [makeApp({ acceptanceId: 'app-1', status: 'applied', trip: alreadyApplied })] }),
    });
    renderPage('/app/my-trips?scope=invites-received&from=/app');
    expect(screen.getByText(/2 trips waiting for your decision/i)).toBeInTheDocument();
    expect(screen.getByText(/vellore → pending1-to/i)).toBeInTheDocument();
    expect(screen.getByText(/vellore → pending2-to/i)).toBeInTheDocument();
    expect(screen.queryByText(/vellore → alreadyApplied-to/i)).toBeNull();
    expect(screen.queryByText(/vellore → declined-to/i)).toBeNull();
  });

  it('?scope=invites-received — each trip-detail Link carries ?from=/app/my-trips?scope=invites-received so Back returns to the scoped list', () => {
    setUp({
      invited: tripsState({ data: [
        makeTrip({ id: 'inv-x', toCity: city('cX', 'InvitedX-to'), invitationId: 'i-x', invitationStatus: 'pending' }),
      ] }),
    });
    renderPage('/app/my-trips?scope=invites-received&from=/app');
    // The PostedTripCard renders TWO links to the same destination (the headline card area
    // + the "View details" link in the footer). Both must carry the breadcrumb.
    const detailLinks = screen.getAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith('/app/trips/inv-x'));
    expect(detailLinks.length).toBeGreaterThan(0);
    for (const link of detailLinks) {
      const href = link.getAttribute('href') ?? '';
      // Encoded by encodeURIComponent — `/app/my-trips?scope=invites-received&from=/app` becomes
      // `%2Fapp%2Fmy-trips%3Fscope%3Dinvites-received%26from%3D%2F`. Asserting on the decoded form
      // would miss an encoding regression, so check the raw href.
      expect(href).toMatch(/[?&]from=%2Fapp%2Fmy-trips%3Fscope%3Dinvites-received/);
    }
  });

  it('?scope=invites-received — Decline button is rendered INSIDE the PostedTripCard, not as a separate sibling element', () => {
    setUp({
      invited: tripsState({ data: [
        makeTrip({ id: 'inv-d', toCity: city('cD', 'InvitedD-to'), invitationId: 'i-d', invitationStatus: 'pending' }),
      ] }),
    });
    renderPage('/app/my-trips?scope=invites-received&from=/app');
    // Decline button exists, and its nearest Card ancestor is the SAME Card that contains
    // the trip route — proves it's inside the card surface (footerSlot), not a sibling.
    const declineBtn = screen.getByRole('button', { name: /decline invitation/i });
    const routeNode = screen.getByText(/vellore → invitedD-to/i);
    const findCardAncestor = (el: HTMLElement | null): HTMLElement | null => {
      let cur: HTMLElement | null = el;
      while (cur) {
        if (cur.dataset?.slot === 'card' || cur.className?.toString().includes('rounded-card')) return cur;
        cur = cur.parentElement;
      }
      return null;
    };
    const btnCard = findCardAncestor(declineBtn);
    const routeCard = findCardAncestor(routeNode);
    expect(btnCard).not.toBeNull();
    expect(btnCard).toBe(routeCard);
  });

  // Regression for user-reported "after decline it sends me to /my-trips instead of staying
  // on Invites Received". Confirms the Decline action on the scoped list card does NOT
  // navigate — the URL keeps `?scope=invites-received`, so the page stays in the scoped view.
  it('?scope=invites-received — Declining from the list card stays on the scoped URL (does not navigate to plain /my-trips)', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(undefined);
    setUp({
      invited: tripsState({ data: [
        makeTrip({ id: 'inv-stay', toCity: city('cS', 'Stay-to'), invitationId: 'i-stay', invitationStatus: 'pending' }),
        makeTrip({ id: 'inv-other', toCity: city('cO', 'Other-to'), invitationId: 'i-other', invitationStatus: 'pending' }),
      ] }),
    });
    vi.mocked(useDeclineTripInvite).mockReturnValue({ mutateAsync, isPending: false } as never);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage('/app/my-trips?scope=invites-received&from=/app');
    // Snapshot the scoped header presence before decline.
    expect(screen.getByText('Invites received')).toBeInTheDocument();
    const declineBtns = screen.getAllByRole('button', { name: /decline invitation/i });
    fireEvent.click(declineBtns[0]);
    await Promise.resolve();
    expect(mutateAsync).toHaveBeenCalled();
    // The scoped header is STILL present — proving the page didn't navigate away from the
    // scoped view (the plain `/app/my-trips` tabbed view doesn't render this header).
    expect(screen.getByText('Invites received')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  // Regression: user reported stale vacancies still showed in /vacancies. The backend now
  // expires open-ended ones after 24h (migration 057); the driver's own /my-trips?tab=available
  // view shows expired rows in a separate red-tinted section so they can delete or repost.
  it('the I’m vacant tab renders expired vacancies in a separate Expired section with a red badge', () => {
    const city2 = city('cV', 'Vellore');
    const vacancy = (id: string, status: 'active' | 'expired') => ({
      id, driverId: 'd1', status,
      currentCity: city2, currentPlace: null,
      destinationCities: [city('cC', 'Chennai')], destinationPlaces: [],
      availableFrom: '2026-05-17T15:00:00.000Z',
      availableUntil: null, minRatePerKm: null, notes: id,
      createdAt: '2026-05-17T15:00:00.000Z', updatedAt: '2026-05-17T15:00:00.000Z',
    } as never);
    setUp();
    vi.mocked(useMyActiveVacancies).mockReturnValue({ isPending: false, isError: false, data: [vacancy('active-1', 'active')], refetch: vi.fn() } as never);
    vi.mocked(useMyExpiredVacancies).mockReturnValue({ isPending: false, isError: false, data: [vacancy('expired-1', 'expired')], refetch: vi.fn() } as never);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /i'm vacant/i }));
    expect(screen.getByText(/expired — please remove or repost/i)).toBeInTheDocument();
    expect(screen.getByText(/^expired$/i)).toBeInTheDocument(); // the badge
    // Both vacancies render (active one + the expired one)
    expect(screen.getAllByText(/vellore/i).length).toBeGreaterThan(1);
  });
});
