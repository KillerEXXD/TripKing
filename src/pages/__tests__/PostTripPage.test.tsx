import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { PostTripPage } from '@/pages/PostTripPage';

vi.mock('@/hooks/useTrips', () => ({ usePostTrip: vi.fn() }));
import { usePostTrip } from '@/hooks/useTrips';
vi.mock('@/hooks/useDrivers', () => ({ useMyDriver: vi.fn(), useMyAgent: vi.fn() }));
import { useMyAgent, useMyDriver } from '@/hooks/useDrivers';
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

const city = (id: string, name: string) => ({ id, name, state: 'TN', lat: 12.9, lng: 79.1, sortOrder: 1, isActive: true });
const carType = (id: string, label: string) => ({ id, label, sortOrder: 1, isActive: true });

type ListState = { isPending?: boolean; isError?: boolean; data?: unknown[]; refetch?: () => void };
function setLists(citiesOver: ListState = {}, carTypesOver: ListState = {}) {
  vi.mocked(cityHooks.useList).mockReturnValue({ isPending: false, isError: false, data: [city('c1', 'Vellore'), city('c2', 'Chennai')], refetch: vi.fn(), ...citiesOver } as never);
  vi.mocked(carTypeHooks.useList).mockReturnValue({ isPending: false, isError: false, data: [carType('ct1', 'Sedan'), carType('ct2', 'SUV')], refetch: vi.fn(), ...carTypesOver } as never);
}
function setPostTrip(over: Partial<{ mutateAsync: ReturnType<typeof vi.fn>; isPending: boolean; isError: boolean }> = {}) {
  const mutateAsync = vi.fn().mockResolvedValue({ id: 'newtrip' });
  vi.mocked(usePostTrip).mockReturnValue({ mutateAsync, isPending: false, isError: false, ...over } as never);
  return mutateAsync;
}
function setPoster(role: 'driver' | 'trip_manager' = 'trip_manager', kycStatus: string | undefined = 'approved') {
  vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1', role, displayName: 'X', phone: '+91', preferredLanguage: 'en', isActive: true }, isAuthenticated: true, isLoading: false, requestOtp: vi.fn(), verifyOtp: vi.fn(), logout: vi.fn() } as never);
  const profQ = { isPending: false, isError: false, data: kycStatus ? { id: 'p1', kycStatus } : undefined, refetch: vi.fn() } as never;
  const emptyQ = { isPending: false, isError: false, data: undefined, refetch: vi.fn() } as never;
  vi.mocked(useMyDriver).mockReturnValue(role === 'driver' ? profQ : emptyQ);
  vi.mocked(useMyAgent).mockReturnValue(role === 'trip_manager' ? profQ : emptyQ);
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

/** Fill the step-1 form (route + vehicle) and advance to step 2. */
async function completeStep1(container: HTMLElement) {
  set(container, 'fromCityId', 'c1');
  set(container, 'toCityId', 'c2');
  set(container, 'pickupAt', '2099-06-01T09:00');
  set(container, 'expectedDistanceKm', '140');
  fireEvent.click(screen.getByRole('button', { name: 'Sedan' }));
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
    vi.mocked(toast.error).mockClear();
    setLists();
    setPostTrip();
    setPoster('trip_manager', 'approved');
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

  it('starts on step 1 — route + vehicle, with the city + car-type choices', () => {
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
    set(container, 'toCityId', 'c1'); // same as pickup
    set(container, 'pickupAt', '2099-06-01T09:00');
    set(container, 'expectedDistanceKm', '140');
    fireEvent.click(screen.getByRole('button', { name: 'Sedan' }));
    expect(screen.getByRole('button', { name: /next: price/i })).toBeDisabled();
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
    set(container, 'passengerName', 'Passenger P');
    set(container, 'passengerPhone', '+919999999999');
    fireEvent.click(screen.getByRole('button', { name: /^post trip$/i }));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ fromCityId: 'c1', toCityId: 'c2', carTypeId: 'ct1', expectedDistanceKm: 140, ratePerKm: 15, totalFare: 2100, passengerName: 'Passenger P' }),
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
});
