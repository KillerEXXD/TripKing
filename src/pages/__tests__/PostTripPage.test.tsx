import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { PostTripPage } from '@/pages/PostTripPage';

vi.mock('@/hooks/useTrips', () => ({ usePostTrip: vi.fn() }));
import { usePostTrip } from '@/hooks/useTrips';
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

function renderPost() {
  return render(
    <MemoryRouter initialEntries={['/trips/new']}>
      <Routes>
        <Route path="/trips/new" element={<PostTripPage />} />
        <Route path="/trips" element={<div>trip feed</div>} />
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
function fillValid(container: HTMLElement, over: Record<string, string> = {}) {
  const v: Record<string, string> = {
    fromCityId: 'c1',
    toCityId: 'c2',
    pickupAt: '2099-06-01T09:00',
    expectedDistanceKm: '140',
    carTypeId: 'ct1',
    ratePerKm: '15',
    passengerName: 'Passenger P',
    passengerPhone: '+919999999999',
    ...over,
  };
  for (const [k, val] of Object.entries(v)) set(container, k, val);
}

describe('PostTripPage', () => {
  beforeEach(() => {
    vi.mocked(usePostTrip).mockReset();
    vi.mocked(cityHooks.useList).mockReset();
    vi.mocked(carTypeHooks.useList).mockReset();
    vi.mocked(useAppSettings).mockReset().mockReturnValue({ data: undefined } as never);
    vi.mocked(toast.error).mockClear();
    setLists();
    setPostTrip();
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

  it('renders the form with the city + car-type options', () => {
    renderPost();
    expect(screen.getByRole('heading', { name: /post a trip/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^post trip$/i })).toBeInTheDocument();
    // "Vellore" appears in both the From and To selects
    expect(screen.getAllByRole('option', { name: 'Vellore' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('option', { name: 'Sedan' })).toBeInTheDocument();
  });

  it('the Cancel button returns to the trip feed', () => {
    renderPost();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.getByText('trip feed')).toBeInTheDocument();
  });

  it('blocks posting when the pickup and drop-off cities are the same', async () => {
    const mutateAsync = setPostTrip();
    const { container } = renderPost();
    fillValid(container, { toCityId: 'c1' }); // same as fromCityId
    fireEvent.click(screen.getByRole('button', { name: /^post trip$/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('posts a valid trip, opens the share modal, then navigates to the new trip', async () => {
    const mutateAsync = setPostTrip();
    const { container } = renderPost();
    fillValid(container);
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
});
