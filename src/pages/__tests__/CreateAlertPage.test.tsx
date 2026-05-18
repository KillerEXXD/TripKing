import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { CreateAlertPage } from '@/pages/CreateAlertPage';

vi.mock('@/hooks/useAlerts', () => ({ useCreateAlert: vi.fn() }));
import { useCreateAlert } from '@/hooks/useAlerts';
vi.mock('@/hooks/useAdminConfig', () => ({ cityHooks: { useList: vi.fn() }, carTypeHooks: { useList: vi.fn() }, useAppSettings: vi.fn() }));
import { carTypeHooks, cityHooks, useAppSettings } from '@/hooks/useAdminConfig';
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { toast } from 'sonner';
// Stub the place-pin affordance: a button that "pins" a fixed place (or removes it).
vi.mock('@/components/location/PlacePinField', () => ({
  PlacePinField: ({ value, onChange, pinLabel }: { value: { id: string; name: string } | null; onChange: (p: { id: string; name: string } | null) => void; pinLabel?: string }) =>
    value ? (
      <button type="button" aria-label={`Remove ${value.name}`} onClick={() => onChange(null)}>
        {value.name}
      </button>
    ) : (
      <button type="button" onClick={() => onChange({ id: 'p1', name: 'Katpadi, Vellore' })}>
        {pinLabel ?? 'pin'}
      </button>
    ),
}));

const city = (id: string, name: string) => ({ id, name, state: 'TN', lat: 12.9, lng: 79.1, sortOrder: 1, isActive: true });
const carType = (id: string, label: string) => ({ id, label, sortOrder: 1, isActive: true });

type ListState = { isPending?: boolean; isError?: boolean; data?: unknown[]; refetch?: () => void };
function setLists(citiesOver: ListState = {}, carTypesOver: ListState = {}) {
  vi.mocked(cityHooks.useList).mockReturnValue({ isPending: false, isError: false, data: [city('c1', 'Vellore'), city('c2', 'Chennai')], refetch: vi.fn(), ...citiesOver } as never);
  vi.mocked(carTypeHooks.useList).mockReturnValue({ isPending: false, isError: false, data: [carType('ct1', 'Sedan')], refetch: vi.fn(), ...carTypesOver } as never);
}
function setCreate(over: Partial<{ mutateAsync: ReturnType<typeof vi.fn>; isPending: boolean; isError: boolean }> = {}) {
  const mutateAsync = vi.fn().mockResolvedValue({ id: 'newalert' });
  vi.mocked(useCreateAlert).mockReturnValue({ mutateAsync, isPending: false, isError: false, ...over } as never);
  return mutateAsync;
}

function renderCreate() {
  return render(
    <MemoryRouter initialEntries={['/app/alerts/new']}>
      <Routes>
        <Route path="/app/alerts/new" element={<CreateAlertPage />} />
        <Route path="/app/alerts" element={<div>alerts list</div>} />
      </Routes>
    </MemoryRouter>,
  );
}
function pickCity(namePattern: RegExp, value: string) {
  fireEvent.change(screen.getByRole('combobox', { name: namePattern }), { target: { value } });
}

describe('CreateAlertPage', () => {
  beforeEach(() => {
    vi.mocked(useCreateAlert).mockReset();
    vi.mocked(cityHooks.useList).mockReset();
    vi.mocked(carTypeHooks.useList).mockReset();
    vi.mocked(useAppSettings).mockReset().mockReturnValue({ data: { defaultAlertRadiusKm: 25 } } as never);
    vi.mocked(toast.error).mockClear();
    setLists();
    setCreate();
  });

  it('renders a skeleton while the lookups load', () => {
    setLists({ isPending: true });
    renderCreate();
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
  });

  it('renders an error state with retry when the lookups fail', () => {
    const refetch = vi.fn();
    setLists({ isError: true, refetch });
    renderCreate();
    expect(screen.getByText(/couldn't load the form/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it('renders the form with the city + car-type options', () => {
    renderCreate();
    expect(screen.getByRole('heading', { name: /new alert/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^create alert$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sedan' })).toBeInTheDocument();
  });

  it('keeps "Create alert" disabled until a pickup city is chosen', () => {
    const mutateAsync = setCreate();
    renderCreate();
    expect(screen.getByRole('button', { name: /^create alert$/i })).toBeDisabled();
    pickCity(/pickup city/i, 'c1');
    expect(screen.getByRole('button', { name: /^create alert$/i })).toBeEnabled();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('creates the alert with the chosen city, a pinned exact pickup point, default radius and in-app channel, then navigates back', async () => {
    const mutateAsync = setCreate();
    renderCreate();
    pickCity(/pickup city/i, 'c1');
    fireEvent.click(screen.getByRole('button', { name: /pin the exact pickup point/i })); // sets fromPlace = p1 (stubbed)
    fireEvent.click(screen.getByRole('button', { name: /^create alert$/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ fromCityId: 'c1', fromPlaceId: 'p1', fromRadiusKm: 25, notifyVia: ['in_app'], isActive: true })));
    expect(await screen.findByText('alerts list')).toBeInTheDocument();
  });

  it('the Cancel button returns to the alerts list', () => {
    renderCreate();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.getByText('alerts list')).toBeInTheDocument();
  });
});
