import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AlertsPage } from '@/pages/AlertsPage';
import type { Alert } from '@/types';

vi.mock('@/hooks/useAlerts', () => ({ useMyAlerts: vi.fn() }));
import { useMyAlerts } from '@/hooks/useAlerts';

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

type AState = { isPending?: boolean; isError?: boolean; isSuccess?: boolean; data?: Alert[]; refetch?: () => void };
function setAlerts(s: AState) {
  vi.mocked(useMyAlerts).mockReturnValue({ isPending: false, isError: false, isSuccess: true, data: [], refetch: vi.fn(), ...s } as never);
}
function renderAlerts() {
  return render(
    <MemoryRouter>
      <AlertsPage />
    </MemoryRouter>,
  );
}

describe('AlertsPage', () => {
  beforeEach(() => vi.mocked(useMyAlerts).mockReset());

  it('renders a skeleton while loading', () => {
    setAlerts({ isPending: true, isSuccess: false });
    renderAlerts();
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
  });

  it('renders an error state with retry on failure', () => {
    const refetch = vi.fn();
    setAlerts({ isError: true, isSuccess: false, refetch });
    renderAlerts();
    expect(screen.getByText(/couldn't load your alerts/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it('renders an empty state with a "New alert" action', () => {
    setAlerts({ data: [] });
    renderAlerts();
    expect(screen.getByText(/no alerts yet/i)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /new alert/i }).length).toBeGreaterThan(0);
  });

  it('renders an alert card with name, route and state, linking to the detail', () => {
    setAlerts({ data: [makeAlert(), makeAlert({ id: 'a2', name: 'Paused one', isActive: false })] });
    renderAlerts();
    expect(screen.getByText('Vellore runs')).toBeInTheDocument();
    expect(screen.getByText(/paused one/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /vellore runs/i })).toHaveAttribute('href', '/alerts/a1');
    expect(screen.getByRole('link', { name: /paused one/i })).toHaveAttribute('href', '/alerts/a2');
  });
});
