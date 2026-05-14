import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { axe } from 'vitest-axe';
import { PostTripPage } from '@/pages/PostTripPage';

vi.mock('@/hooks/useTrips', () => ({ usePostTrip: vi.fn() }));
import { usePostTrip } from '@/hooks/useTrips';
vi.mock('@/hooks/useDrivers', () => ({ useMyDriver: vi.fn(), useMyAgent: vi.fn() }));
import { useMyAgent, useMyDriver } from '@/hooks/useDrivers';
vi.mock('@/hooks/usePassengers', () => ({ useLookupPassengerByPhone: vi.fn(), isLookupablePhone: (p?: string) => (p ?? '').replace(/\D/g, '').length >= 10 }));
import { useLookupPassengerByPhone } from '@/hooks/usePassengers';
vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }));
import { useAuth } from '@/contexts/AuthContext';
vi.mock('@/hooks/useAdminConfig', () => ({ cityHooks: { useList: vi.fn() }, carTypeHooks: { useList: vi.fn() }, useAppSettings: vi.fn() }));
import { carTypeHooks, cityHooks, useAppSettings } from '@/hooks/useAdminConfig';
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { toast } from 'sonner';
vi.mock('@/components/share/ShareTripModal', () => ({
  ShareTripModal: ({ onClose }: { onClose: () => void }) => (
    <div>
      share modal
      <button type="button" onClick={onClose}>
        close share
      </button>
    </div>
  ),
}));
// Stub the place-pin affordance: a button that "pins" a fixed place (with coords, so the distance
// auto-calc has a point to work with) or removes it.
const PINNED_PLACE = { id: 'p1', name: 'Katpadi, Vellore', lat: 11.0, lng: 76.96 };
vi.mock('@/components/location/PlacePinField', () => ({
  PlacePinField: ({ value, onChange, pinLabel }: { value: { id: string; name: string } | null; onChange: (p: typeof PINNED_PLACE | null) => void; pinLabel?: string }) =>
    value ? (
      <button type="button" aria-label={`Remove ${value.name}`} onClick={() => onChange(null)}>
        {value.name}
      </button>
    ) : (
      <button type="button" onClick={() => onChange(PINNED_PLACE)}>
        {pinLabel ?? 'pin'}
      </button>
    ),
}));

const city = (id: string, name: string, lat = 12.9, lng = 79.1) => ({ id, name, state: 'TN', lat, lng, sortOrder: 1, isActive: true, canReportBugs: false });
const carType = (id: string, label: string) => ({ id, label, sortOrder: 1, isActive: true, canReportBugs: false });

type ListState = { isPending?: boolean; isError?: boolean; data?: unknown[]; refetch?: () => void };
function setLists(citiesOver: ListState = {}, carTypesOver: ListState = {}) {
  vi.mocked(cityHooks.useList).mockReturnValue({ isPending: false, isError: false, data: [city('c1', 'Vellore', 12.92, 79.13), city('c2', 'Chennai', 13.08, 80.27)], refetch: vi.fn(), ...citiesOver } as never);
  vi.mocked(carTypeHooks.useList).mockReturnValue({ isPending: false, isError: false, data: [carType('ct1', 'Sedan'), carType('ct2', 'SUV')], refetch: vi.fn(), ...carTypesOver } as never);
}
function setPostTrip(over: Partial<{ mutateAsync: ReturnType<typeof vi.fn>; isPending: boolean; isError: boolean }> = {}) {
  const mutateAsync = vi.fn().mockResolvedValue({ id: 'newtrip' });
  vi.mocked(usePostTrip).mockReturnValue({ mutateAsync, isPending: false, isError: false, ...over } as never);
  return mutateAsync;
}
function setPoster(role: 'driver' | 'trip_manager' = 'trip_manager', kycStatus: string | undefined = 'approved') {
  vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1', role, displayName: 'X', phone: '+91', preferredLanguage: 'en', isActive: true, canReportBugs: false }, isAuthenticated: true, isLoading: false, requestOtp: vi.fn(), verifyOtp: vi.fn(), logout: vi.fn() } as never);
  const profQ = { isPending: false, isError: false, data: kycStatus ? { id: 'p1', kycStatus } : undefined, refetch: vi.fn() } as never;
  const emptyQ = { isPending: false, isError: false, data: undefined, refetch: vi.fn() } as never;
  vi.mocked(useMyDriver).mockReturnValue(role === 'driver' ? profQ : emptyQ);
  vi.mocked(useMyAgent).mockReturnValue(role === 'trip_manager' ? profQ : emptyQ);
}
function setPassengerLookup(over: { isFetching?: boolean; isSuccess?: boolean; isError?: boolean; data?: unknown } = {}) {
  vi.mocked(useLookupPassengerByPhone).mockReturnValue({ isFetching: false, isSuccess: false, isError: false, data: undefined, refetch: vi.fn(), ...over } as never);
}

function renderPost() {
  return render(
    <MemoryRouter initialEntries={['/trips/new']}>
      <Routes>
        <Route path="/trips/new" element={<PostTripPage />} />
        <Route path="/" element={<div>home</div>} />
        <Route path="/trips/:id" element={<div>trip detail</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function set(container: HTMLElement, name: string, value: string) {
  const el = container.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);
  if (!el) throw new Error(`no control [name="${name}"]`);
  fireEvent.change(el, { target: { value } });
}

/** Expand the passenger details collapsible (collapsed by default in step 2). */
function expandPassengerSection() {
  fireEvent.click(screen.getByRole('button', { name: /passenger details/i }));
}

/** Fill the step-1 form (route + vehicle, + pin an exact pickup point) and advance to step 2.
 *  The distance is computed automatically from the route â€” we wait for it before clicking Next. */
async function completeStep1(container: HTMLElement) {
  set(container, 'fromCityId', 'c1');
  set(container, 'toCityId', 'c2');
  set(container, 'pickupAt', '2099-06-01T09:00');
  fireEvent.click(screen.getByRole('button', { name: 'Sedan' }));
  fireEvent.click(screen.getByRole('button', { name: /pin the exact pickup point/i })); // sets fromPlace = p1 (stubbed)
  await waitFor(() => expect(Number(container.querySelector<HTMLInputElement>('[name="expectedDistanceKm"]')!.value)).toBeGreaterThanOrEqual(1));
  fireEvent.click(screen.getByRole('button', { name: /next: price/i }));
  await screen.findByRole('button', { name: /^post trip$/i });
}

describe('PostTripPage', () => {
  beforeEach(() => {
    vi.mocked(usePostTrip).mockReset();
    vi.mocked(cityHooks.useList).mockReset();
    vi.mocked(carTypeHooks.useList).mockReset();
    vi.mocked(useAppSettings).mockReset().mockReturnValue({ data: undefined } as never);
    vi.mocked(useAuth).mockReset();
    vi.mocked(useMyDriver).mockReset();
    vi.mocked(useMyAgent).mockReset();
    vi.mocked(useLookupPassengerByPhone).mockReset();
    vi.mocked(toast.error).mockClear();
    setLists();
    setPostTrip();
    setPoster('trip_manager', 'approved');
    setPassengerLookup();
  });

  it('renders a skeleton while the city / car-type lists load', () => {
    setLists({ isPending: true });
    renderPost();
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
  });

  it('renders an error state with retry when the lists fail', () => {
    const refetch = vi.fn();
    setLists({ isError: true, refetch });
    renderPost();
    expect(screen.getByText(/couldn't load the form/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it('starts on step 1 â€” route + vehicle, with the city + car-type choices', () => {
    renderPost();
    expect(screen.getByRole('heading', { name: /post a trip/i })).toBeInTheDocument();
    expect(screen.getByText(/step 1 of 2/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next: price/i })).toBeInTheDocument();
    // "Vellore" appears in both the From and To selects
    expect(screen.getAllByRole('option', { name: 'Vellore' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Sedan' })).toBeInTheDocument();
  });

  it('the back arrow leaves the wizard from step 1', () => {
    renderPost();
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(screen.getByText('home')).toBeInTheDocument();
  });

  it('keeps "Next" disabled until step 1 is valid (and when the cities match)', () => {
    const { container } = renderPost();
    expect(screen.getByRole('button', { name: /next: price/i })).toBeDisabled();
    set(container, 'fromCityId', 'c1');
    set(container, 'toCityId', 'c1'); // same as pickup â€” and so no distance is computed
    set(container, 'pickupAt', '2099-06-01T09:00');
    fireEvent.click(screen.getByRole('button', { name: 'Sedan' }));
    expect(screen.getByRole('button', { name: /next: price/i })).toBeDisabled();
  });

  it('computes the expected distance from the route â€” read-only, with a spinner while working, and re-runs when an exact point is pinned', async () => {
    const { container } = renderPost();
    const distanceInput = () => container.querySelector<HTMLInputElement>('[name="expectedDistanceKm"]')!;
    expect(distanceInput()).toHaveAttribute('readonly'); // the agent / driver can't type it
    set(container, 'fromCityId', 'c1');
    set(container, 'toCityId', 'c2'); // distinct coords â†’ triggers a calculation
    expect(screen.getByText(/calculating route/i)).toBeInTheDocument(); // the processing indicator
    await waitFor(() => expect(Number(distanceInput().value)).toBeGreaterThanOrEqual(1));
    expect(screen.queryByText(/calculating route/i)).toBeNull();
    const fromCities = Number(distanceInput().value);
    fireEvent.click(screen.getByRole('button', { name: /pin the exact pickup point/i })); // re-runs with the pinned coords
    await waitFor(() => expect(Number(distanceInput().value)).not.toBe(fromCities));
  });

  it('advances to step 2 and the back arrow returns to step 1', async () => {
    const { container } = renderPost();
    await completeStep1(container);
    expect(screen.getByText(/step 2 of 2/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(screen.getByText(/step 1 of 2/i)).toBeInTheDocument();
  });

  it('posts a valid trip, opens the share modal, then navigates to the new trip', async () => {
    const mutateAsync = setPostTrip();
    const { container } = renderPost();
    await completeStep1(container);
    set(container, 'ratePerKm', '15');
    expandPassengerSection();
    set(container, 'passengerName', 'Passenger P');
    set(container, 'passengerPhone', '+919999999999');
    fireEvent.click(screen.getByRole('button', { name: /^post trip$/i }));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ fromCityId: 'c1', toCityId: 'c2', fromPlaceId: 'p1', carTypeId: 'ct1', expectedDistanceKm: expect.any(Number), ratePerKm: 15, totalFare: expect.any(Number), passengerName: 'Passenger P' }),
      ),
    );
    expect(await screen.findByText('share modal')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /close share/i }));
    expect(await screen.findByText('trip detail')).toBeInTheDocument();
  });

  it('shows the verification gate instead of the wizard when the poster is not approved', () => {
    setPoster('driver', 'video_pending');
    renderPost();
    expect(screen.getByRole('link', { name: /go to verification/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /next: price/i })).toBeNull();
  });

  it('shows a processing indicator while it checks whether the passenger phone is already known', async () => {
    setPassengerLookup({ isFetching: true });
    const { container } = renderPost();
    await completeStep1(container);
    expandPassengerSection();
    set(container, 'passengerPhone', '+919876543210');
    await waitFor(() => expect(screen.getByText(/checking if this passenger exists/i)).toBeInTheDocument());
  });

  it('prefills the passenger name from the directory when the phone matches an existing passenger', async () => {
    const { container } = renderPost();
    await completeStep1(container);
    expandPassengerSection();
    setPassengerLookup({ isSuccess: true, data: { id: 'p1', phone: '+919876543210', name: 'Jane Sharma', aliases: [], referredByUserId: 'u9', referredBy: { id: 'u9', displayName: 'Agent A', role: 'trip_manager' }, firstSeenAt: '2026-05-01T00:00:00.000Z', tripsCount: 4 } });
    set(container, 'passengerPhone', '+919876543210'); // note: name left blank
    await waitFor(() => expect(screen.getByText(/existing passenger â€” jane sharma/i)).toBeInTheDocument());
    expect(container.querySelector<HTMLInputElement>('[name="passengerName"]')!.value).toBe('Jane Sharma');
  });

  it('a11y: step 1 wizard has no axe violations', async () => {
    const { container } = renderPost();
    expect(await axe(container)).toHaveNoViolations();
  });
});
