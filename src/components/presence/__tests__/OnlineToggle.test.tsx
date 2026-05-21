import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { DriverPresence } from '@/types';

vi.mock('@/hooks/usePresence', () => ({
  usePresence: vi.fn(),
  useGoOnline: vi.fn(),
  useGoOffline: vi.fn(),
  useHeartbeat: vi.fn(),
}));
vi.mock('@/hooks/useVehicles', () => ({ useDriverVehicles: vi.fn() }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import { usePresence, useGoOnline, useGoOffline } from '@/hooks/usePresence';
import { useDriverVehicles } from '@/hooks/useVehicles';
import { OnlineToggle } from '@/components/presence/OnlineToggle';

function presence(over: Partial<DriverPresence> = {}): DriverPresence {
  return { status: 'offline', isOnline: false, onlineSince: null, lastHeartbeatAt: null, graceExpiresAt: null, vehicleId: null, busyTripId: null, currentLat: null, currentLng: null, ...over };
}

let onlineMutate: ReturnType<typeof vi.fn>;
let offlineMutate: ReturnType<typeof vi.fn>;

function setup(p: DriverPresence, vehicles: unknown[] = []) {
  onlineMutate = vi.fn();
  offlineMutate = vi.fn();
  vi.mocked(usePresence).mockReturnValue({ data: p } as never);
  vi.mocked(useGoOnline).mockReturnValue({ mutate: onlineMutate, isPending: false } as never);
  vi.mocked(useGoOffline).mockReturnValue({ mutate: offlineMutate, isPending: false } as never);
  vi.mocked(useDriverVehicles).mockReturnValue({ data: vehicles } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom has no geolocation — stub a success fix.
  Object.defineProperty(globalThis.navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition: vi.fn((ok: PositionCallback) => ok({ coords: { latitude: 12.9, longitude: 79.1 } } as GeolocationPosition)) },
  });
});

describe('OnlineToggle', () => {
  it('offline → shows "Go Online"', () => {
    setup(presence());
    render(<OnlineToggle driverId="d1" />);
    expect(screen.getByText("You’re Offline")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /go online/i })).toBeInTheDocument();
  });

  it('clicking Go Online grabs GPS and calls goOnline with the chosen vehicle', () => {
    setup(presence(), [{ id: 'v1', isPrimary: true, isActive: true, registrationNumber: 'TN01AB1234', makeLabel: 'Maruti', modelName: 'Dzire' }]);
    render(<OnlineToggle driverId="d1" />);
    fireEvent.click(screen.getByRole('button', { name: /go online/i }));
    expect(onlineMutate).toHaveBeenCalledTimes(1);
    expect(onlineMutate.mock.calls[0][0]).toEqual({ lat: 12.9, lng: 79.1, vehicleId: 'v1' });
  });

  it('online → shows "Go Offline" and calls goOffline', () => {
    setup(presence({ status: 'online', isOnline: true }));
    render(<OnlineToggle driverId="d1" />);
    expect(screen.getByText("You’re Online")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /go offline/i }));
    expect(offlineMutate).toHaveBeenCalledTimes(1);
  });

  it('grace → shows the keep-your-place countdown + "I’m back online"', () => {
    setup(presence({ status: 'grace', graceExpiresAt: new Date(Date.now() + 120_000).toISOString() }));
    render(<OnlineToggle driverId="d1" />);
    expect(screen.getByText(/keep your place/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back online/i })).toBeInTheDocument();
  });

  it('on a trip → no toggle, shows the re-join note', () => {
    setup(presence({ status: 'online', isOnline: true, busyTripId: 't1' }));
    render(<OnlineToggle driverId="d1" />);
    expect(screen.getByText(/on a trip/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /go offline/i })).not.toBeInTheDocument();
  });
});
