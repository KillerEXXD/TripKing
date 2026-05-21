import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { DispatchSettingsForm } from '@/components/admin/DispatchSettingsForm';
import type { AppSettings } from '@/types';

vi.mock('@/hooks/useAdminConfig', () => ({
  useAppSettings: vi.fn(),
  useUpdateAppSettings: vi.fn(),
}));
import { useAppSettings, useUpdateAppSettings } from '@/hooks/useAdminConfig';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function fixture(over: Partial<AppSettings> = {}): AppSettings {
  return {
    minVehicleYear: 2015,
    vehicleExpiryWarningDays: 90,
    defaultAlertRadiusKm: 25,
    defaultCommissionPct: 10,
    defaultGstAmount: 100,
    defaultDriverBata: 300,
    defaultExtrasPaidByPassenger: true,
    defaultDriverInstructions: 'x',
    maxActiveVacanciesPerDriver: 2,
    inviteMaxRadiusKm: 15,
    dispatchAlgorithm: 'manual',
    dispatchOfferSeconds: 60,
    dispatchOfflineGraceSeconds: 180,
    dispatchInitialRadiusKm: 3,
    dispatchRadiusWidenKm: 10,
    dispatchMaxPasses: 2,
    dispatchRetryCooldownSeconds: 120,
    dispatchMaxRetries: 3,
    dispatchHeartbeatStaleSeconds: 90,
    ...over,
  };
}

function setSettings(data?: AppSettings) {
  vi.mocked(useAppSettings).mockReturnValue({ isPending: false, isError: false, data: data ?? fixture(), refetch: vi.fn() } as never);
}
function setUpdate() {
  const mutate = vi.fn();
  vi.mocked(useUpdateAppSettings).mockReturnValue({ mutate, isPending: false } as never);
  return mutate;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DispatchSettingsForm', () => {
  it('shows the algorithm toggle and the currently-live mode', () => {
    setSettings();
    setUpdate();
    render(<DispatchSettingsForm />);
    expect(screen.getByRole('button', { name: 'manual' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'auto' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText(/currently live:/i)).toBeInTheDocument();
  });

  it('clicking the inactive algorithm opens a confirm dialog (does not switch immediately)', () => {
    setSettings();
    const mutate = setUpdate();
    render(<DispatchSettingsForm />);
    fireEvent.click(screen.getByRole('button', { name: 'auto' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/qa has been briefed/i)).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled(); // not until confirmed
  });

  it('confirming the switch mutates only dispatch_algorithm', () => {
    setSettings();
    const mutate = setUpdate();
    render(<DispatchSettingsForm />);
    fireEvent.click(screen.getByRole('button', { name: 'auto' }));
    fireEvent.click(screen.getByRole('button', { name: /enable auto-dispatch/i }));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toEqual({ dispatchAlgorithm: 'auto' });
  });

  it('clicking the already-live algorithm does nothing', () => {
    setSettings();
    setUpdate();
    render(<DispatchSettingsForm />);
    fireEvent.click(screen.getByRole('button', { name: 'manual' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Save sends the tuning fields (and not the algorithm)', () => {
    setSettings();
    const mutate = setUpdate();
    render(<DispatchSettingsForm />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(mutate).toHaveBeenCalledTimes(1);
    const payload = mutate.mock.calls[0][0];
    expect(payload).toMatchObject({ dispatchOfferSeconds: 60, dispatchMaxRetries: 3, dispatchInitialRadiusKm: 3 });
    expect(payload).not.toHaveProperty('dispatchAlgorithm');
  });
});
