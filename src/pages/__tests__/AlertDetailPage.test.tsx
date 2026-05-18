import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AlertDetailPage } from '@/pages/AlertDetailPage';
import { ApiError } from '@/lib/api/client';
import type { Alert } from '@/types';

vi.mock('@/hooks/useAlerts', () => ({ useAlert: vi.fn(), useDeleteAlert: vi.fn(), useSetAlertActive: vi.fn() }));
import { useAlert, useDeleteAlert, useSetAlertActive } from '@/hooks/useAlerts';
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const city = (id: string, name: string) => ({ id, name, state: 'TN', lat: 12.9, lng: 79.1, sortOrder: 1, isActive: true });
function makeAlert(over: Partial<Alert> = {}): Alert {
  return {
    id: 'a1',
    userId: 'u1',
    name: 'Vellore runs',
    fromCity: city('c1', 'Vellore'),
    fromRadiusKm: 25,
    toCity: city('c2', 'Chennai'),
    toRadiusKm: 25,
    minRatePerKm: 14,
    carTypeIds: ['ct1'],
    notifyVia: ['in_app', 'push'],
    isActive: true,
    createdAt: '2099-05-30T00:00:00.000Z',
    ...over,
  };
}

type AState = { isPending?: boolean; isError?: boolean; error?: unknown; data?: Alert; refetch?: () => void };
function setAlert(s: AState) {
  vi.mocked(useAlert).mockReturnValue({ isPending: false, isError: false, error: null, data: undefined, refetch: vi.fn(), ...s } as never);
}
function setMutations() {
  const setActiveMut = { mutate: vi.fn(), isPending: false };
  const delMut = { mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false };
  vi.mocked(useSetAlertActive).mockReturnValue(setActiveMut as never);
  vi.mocked(useDeleteAlert).mockReturnValue(delMut as never);
  return { setActiveMut, delMut };
}

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={['/app/alerts/a1']}>
      <Routes>
        <Route path="/app/alerts/:id" element={<AlertDetailPage />} />
        <Route path="/app/alerts" element={<div>alerts list</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AlertDetailPage', () => {
  beforeEach(() => {
    vi.mocked(useAlert).mockReset();
    vi.mocked(useSetAlertActive).mockReset();
    vi.mocked(useDeleteAlert).mockReset();
    setMutations();
  });

  it('renders a skeleton while loading', () => {
    setAlert({ isPending: true });
    renderDetail();
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
  });

  it('renders a "not found" state (no retry) on a 404', () => {
    setAlert({ isError: true, error: new ApiError('Alert not found', 404) });
    renderDetail();
    expect(screen.getByText(/alert not found/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
  });

  it('renders an error state with retry on a generic failure', () => {
    const refetch = vi.fn();
    setAlert({ isError: true, error: new Error('boom'), refetch });
    renderDetail();
    expect(screen.getByText(/couldn't load this alert/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it('shows the alert and a "Pause" button for an active alert; pausing calls setAlertActive', () => {
    const { setActiveMut } = setMutations();
    setAlert({ data: makeAlert({ isActive: true }) });
    renderDetail();
    expect(screen.getByRole('heading', { name: 'Vellore runs' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^pause$/i }));
    expect(setActiveMut.mutate).toHaveBeenCalledWith({ id: 'a1', isActive: false });
  });

  it('shows a "Resume" button for a paused alert', () => {
    setAlert({ data: makeAlert({ isActive: false }) });
    renderDetail();
    expect(screen.getByRole('button', { name: /^resume$/i })).toBeInTheDocument();
  });

  it('deleting the alert navigates back to the list', async () => {
    const { delMut } = setMutations();
    setAlert({ data: makeAlert() });
    renderDetail();
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));
    await waitFor(() => expect(delMut.mutateAsync).toHaveBeenCalledWith('a1'));
    expect(await screen.findByText('alerts list')).toBeInTheDocument();
  });
});
