import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { PostVacancyPage } from '@/pages/PostVacancyPage';
import { formatClockTime } from '@/lib/utils';

vi.mock('@/hooks/useVacancies', () => ({ usePostVacancy: vi.fn() }));
import { usePostVacancy } from '@/hooks/useVacancies';
vi.mock('@/hooks/useDrivers', () => ({ useMyDriver: vi.fn() }));
import { useMyDriver } from '@/hooks/useDrivers';
vi.mock('@/hooks/useAdminConfig', () => ({ cityHooks: { useList: vi.fn() } }));
import { cityHooks } from '@/hooks/useAdminConfig';
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// Stub the custom Popover-based DateTimeField with a native datetime-local input so the
// existing `fireEvent.change(getByLabelText(/available from/i), { value: '…' })` assertions
// can drive it. The production component is exercised in its own unit test.
vi.mock('@/components/form', async () => {
  const actual = await vi.importActual<typeof import('@/components/form')>('@/components/form');
  return {
    ...actual,
    DateTimeField: ({ value, onChange, id }: { value: string; onChange: (v: string) => void; id?: string }) => (
      <input type="datetime-local" id={id} value={value} onChange={(e) => onChange(e.target.value)} title="datetime field (mock)" />
    ),
  };
});
// Stub the place-search panel so this test doesn't pull in the React Query stack — it just
// renders a button that "picks" a fixed place when clicked.
const fakePlace = { id: 'p1', provider: 'nominatim', providerPlaceId: 'N1', name: 'Katpadi, Vellore', formattedAddress: null, state: 'TN', country: 'IN', lat: 12.97, lng: 79.13, cityId: null, isActive: true, createdAt: '2026-05-12T00:00:00Z' };
vi.mock('@/components/location/LocationSearchPanel', () => ({
  LocationSearchPanel: ({ onPick }: { onPick: (p: typeof fakePlace) => void }) => (
    <button type="button" onClick={() => onPick(fakePlace)}>
      mock-pick-place
    </button>
  ),
}));

const city = (id: string, name: string) => ({ id, name, state: 'TN', lat: 12.9, lng: 79.1, sortOrder: 1, isActive: true });

type ListState = { isPending?: boolean; isError?: boolean; data?: unknown[]; refetch?: () => void };
function setCities(over: ListState = {}) {
  vi.mocked(cityHooks.useList).mockReturnValue({ isPending: false, isError: false, data: [city('c1', 'Vellore'), city('c2', 'Chennai')], refetch: vi.fn(), ...over } as never);
}
function setPost(over: Partial<{ mutateAsync: ReturnType<typeof vi.fn>; isPending: boolean; isError: boolean }> = {}) {
  const mutateAsync = vi.fn().mockResolvedValue({ id: 'newvac' });
  vi.mocked(usePostVacancy).mockReturnValue({ mutateAsync, isPending: false, isError: false, ...over } as never);
  return mutateAsync;
}
function setMyDriver(kycStatus: string | undefined = 'approved') {
  vi.mocked(useMyDriver).mockReturnValue({ isPending: false, isError: false, data: kycStatus ? { id: 'd1', kycStatus } : undefined, refetch: vi.fn() } as never);
}

function renderPost() {
  return render(
    <MemoryRouter initialEntries={['/vacancies/new']}>
      <Routes>
        <Route path="/vacancies/new" element={<PostVacancyPage />} />
        <Route path="/vacancies" element={<div>vacancy feed</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PostVacancyPage', () => {
  beforeEach(() => {
    vi.mocked(usePostVacancy).mockReset();
    vi.mocked(cityHooks.useList).mockReset();
    vi.mocked(useMyDriver).mockReset();
    setCities();
    setPost();
    setMyDriver('approved');
  });

  it('renders a skeleton while the city list loads', () => {
    setCities({ isPending: true });
    renderPost();
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
  });

  it('renders an error state with retry when the city list fails', () => {
    const refetch = vi.fn();
    setCities({ isError: true, refetch });
    renderPost();
    expect(screen.getByText(/couldn't load the form/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it('keeps "Post vacant" disabled until a city and at least one destination are set (the start time defaults to now)', () => {
    renderPost();
    const submit = () => screen.getByRole('button', { name: /^post vacant$/i });
    expect(submit()).toBeDisabled();
    fireEvent.change(screen.getByRole('combobox', { name: /where are you/i }), { target: { value: 'c1' } });
    expect(submit()).toBeDisabled(); // still no destination
    fireEvent.click(screen.getByRole('button', { name: 'Chennai' }));
    expect(submit()).toBeEnabled();
  });

  it('shows the availability window from the start time and updates it when the hours change', () => {
    renderPost();
    const startInput = screen.getByLabelText(/available from/i) as HTMLInputElement;
    const start = new Date(startInput.value); // the "now" the form defaulted to (datetime-local, minute precision)
    const end4 = new Date(start.getTime() + 4 * 3_600_000); // default window is 4 hrs
    expect(screen.getAllByText((t) => t.includes(formatClockTime(start)) && t.includes(formatClockTime(end4))).length).toBeGreaterThan(0);
    expect(screen.getAllByText((t) => t.includes('(4 hrs)')).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /more hours/i })); // 4 → 4.5
    fireEvent.click(screen.getByRole('button', { name: /more hours/i })); // 4.5 → 5
    const end5 = new Date(start.getTime() + 5 * 3_600_000);
    expect(screen.getAllByText((t) => t.includes(formatClockTime(start)) && t.includes(formatClockTime(end5))).length).toBeGreaterThan(0);
    expect(screen.getAllByText((t) => t.includes('(5 hrs)')).length).toBeGreaterThan(0);
  });

  it('filters the destination chips by the search box and keeps a selected chip visible', () => {
    renderPost();
    expect(screen.getByRole('button', { name: 'Vellore' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chennai' })).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/filter the cities/i), { target: { value: 'chen' } });
    expect(screen.queryByRole('button', { name: 'Vellore' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chennai' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Chennai' })); // select it
    fireEvent.change(screen.getByPlaceholderText(/filter the cities/i), { target: { value: 'vell' } });
    expect(screen.getByRole('button', { name: 'Chennai' })).toBeInTheDocument(); // still shown — it's selected
    expect(screen.getByRole('button', { name: 'Vellore' })).toBeInTheDocument(); // matches the query
  });

  it('posts the availability with the chosen city, start time, hours window and destinations, then navigates back', async () => {
    const mutateAsync = setPost();
    renderPost();
    fireEvent.change(screen.getByRole('combobox', { name: /where are you/i }), { target: { value: 'c1' } });
    fireEvent.change(screen.getByLabelText(/available from/i), { target: { value: '2099-06-01T09:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Chennai' }));
    fireEvent.click(screen.getByRole('button', { name: /more hours/i })); // 4 → 4.5
    fireEvent.click(screen.getByRole('button', { name: /more hours/i })); // 4.5 → 5
    fireEvent.click(screen.getByRole('button', { name: /^post vacant$/i }));
    const start = new Date('2099-06-01T09:00'); // datetime-local strings parse as local time
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          currentCityId: 'c1',
          availableFrom: start.toISOString(),
          availableUntil: new Date(start.getTime() + 5 * 3_600_000).toISOString(),
          destinationCityIds: ['c2'],
          destinations: [{ cityId: 'c2' }],
        }),
      ),
    );
    expect(await screen.findByText('vacancy feed')).toBeInTheDocument();
  });

  it('adding a "place not in the list" destination shows a removable chip and sends it in the destinations array', async () => {
    const mutateAsync = setPost();
    renderPost();
    fireEvent.change(screen.getByRole('combobox', { name: /where are you/i }), { target: { value: 'c1' } });
    expect(screen.getByRole('button', { name: /^post vacant$/i })).toBeDisabled(); // no destination yet
    fireEvent.click(screen.getByRole('button', { name: /a place that's not in the list/i }));
    fireEvent.click(screen.getByRole('button', { name: /mock-pick-place/i })); // adds Katpadi, Vellore
    const chip = screen.getByRole('button', { name: /remove the destination katpadi/i });
    expect(chip).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^post vacant$/i })).toBeEnabled(); // a destination place alone is enough
    fireEvent.click(chip); // removable
    expect(screen.queryByRole('button', { name: /remove the destination katpadi/i })).toBeNull();
    // re-add it, also pick a city chip, submit
    fireEvent.click(screen.getByRole('button', { name: /a place that's not in the list/i }));
    fireEvent.click(screen.getByRole('button', { name: /mock-pick-place/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Chennai' }));
    fireEvent.click(screen.getByRole('button', { name: /^post vacant$/i }));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ currentCityId: 'c1', destinationCityIds: ['c2'], destinations: [{ cityId: 'c2' }, { placeId: 'p1' }] })),
    );
    expect(await screen.findByText('vacancy feed')).toBeInTheDocument();
  });

  it('pinning an exact spot shows a removable place chip and sends currentPlaceId on submit', async () => {
    const mutateAsync = setPost();
    renderPost();
    fireEvent.change(screen.getByRole('combobox', { name: /where are you/i }), { target: { value: 'c1' } });
    // pin a place via the (stubbed) search panel
    fireEvent.click(screen.getByRole('button', { name: /pin your exact spot/i }));
    fireEvent.click(screen.getByRole('button', { name: /mock-pick-place/i })); // "picks" Katpadi, Vellore
    const chip = screen.getByRole('button', { name: /remove the pinned location katpadi/i });
    expect(chip).toBeInTheDocument();
    // the chip removes the pin
    fireEvent.click(chip);
    expect(screen.getByRole('button', { name: /pin your exact spot/i })).toBeInTheDocument();
    // re-pin, add a destination, submit
    fireEvent.click(screen.getByRole('button', { name: /pin your exact spot/i }));
    fireEvent.click(screen.getByRole('button', { name: /mock-pick-place/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Chennai' }));
    fireEvent.click(screen.getByRole('button', { name: /^post vacant$/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ currentCityId: 'c1', currentPlaceId: 'p1', destinationCityIds: ['c2'] })));
    expect(await screen.findByText('vacancy feed')).toBeInTheDocument();
  });

  it('the Cancel button returns to the vacancy feed', () => {
    renderPost();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.getByText('vacancy feed')).toBeInTheDocument();
  });

  it('shows the verification gate instead of the form when the driver is not approved', () => {
    setMyDriver('docs_submitted');
    renderPost();
    expect(screen.getByRole('link', { name: /go to verification/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^post vacant$/i })).toBeNull();
  });
});
