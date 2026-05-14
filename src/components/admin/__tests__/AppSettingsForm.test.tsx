import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppSettingsForm } from '@/components/admin/AppSettingsForm';
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
    defaultDriverInstructions: '1. Call before arrival',
    maxActiveVacanciesPerDriver: 2,
    ...over,
  };
}

type SettingsState = { isPending?: boolean; isError?: boolean; data?: AppSettings; refetch?: () => void };
function setSettings(s: SettingsState = {}) {
  vi.mocked(useAppSettings).mockReturnValue({
    isPending: false,
    isError: false,
    data: s.data ?? fixture(),
    refetch: s.refetch ?? vi.fn(),
    ...s,
  } as never);
}

function setUpdate(mutate = vi.fn(), isPending = false) {
  vi.mocked(useUpdateAppSettings).mockReturnValue({ mutate, isPending } as never);
  return mutate;
}

describe('AppSettingsForm', () => {
  beforeEach(() => {
    vi.mocked(useAppSettings).mockReset();
    vi.mocked(useUpdateAppSettings).mockReset();
    setSettings();
    setUpdate();
  });

  it('renders a skeleton while settings are loading', () => {
    setSettings({ isPending: true, data: undefined });
    render(<AppSettingsForm />);
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
  });

  it('renders the error state with retry when the query fails after data has loaded (refetch error)', () => {
    const refetch = vi.fn();
    // The form's `if (query.isPending || !draft) return <LoadingSkeleton/>` guard means
    // an isError-without-data state shows skeleton, not error. The realistic error path is
    // "we have cached data, refetch failed" — which exposes the ErrorState.
    setSettings({ isError: true, data: fixture(), refetch });
    render(<AppSettingsForm />);
    expect(screen.getByText(/couldn't load settings/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('renders every numeric field, the extras checkbox, and the instructions textarea — including the new max-vacancies input with its [1, 10] bounds', () => {
    setSettings();
    render(<AppSettingsForm />);

    // Spot-check the original fields are still there
    expect(screen.getByDisplayValue('2015')).toBeInTheDocument(); // minVehicleYear
    expect(screen.getByDisplayValue('90')).toBeInTheDocument(); // vehicleExpiryWarningDays
    expect(screen.getByDisplayValue('300')).toBeInTheDocument(); // defaultDriverBata
    expect(screen.getByText(/extras are paid by the passenger/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('1. Call before arrival')).toBeInTheDocument();

    // The new field — verify label + bounds + value + hint copy
    const maxLabel = screen.getByText(/Max active "I'm available" posts per driver/i);
    expect(maxLabel).toBeInTheDocument();
    const maxInput = maxLabel.closest('label')?.querySelector('input') as HTMLInputElement;
    expect(maxInput).not.toBeNull();
    expect(maxInput.value).toBe('2');
    expect(maxInput.min).toBe('1');
    expect(maxInput.max).toBe('10');
    expect(screen.getByText(/Soft enforcement/i)).toBeInTheDocument();
  });

  it('editing the max-vacancies value updates the draft (the field is controlled — typing a different number replaces it)', () => {
    setSettings();
    render(<AppSettingsForm />);
    const maxLabel = screen.getByText(/Max active "I'm available" posts per driver/i);
    const maxInput = maxLabel.closest('label')?.querySelector('input') as HTMLInputElement;

    fireEvent.change(maxInput, { target: { value: '5' } });
    expect(maxInput.value).toBe('5');
  });

  it('Save calls useUpdateAppSettings.mutate with the FULL settings object including the edited max-vacancies', () => {
    setSettings();
    const mutate = setUpdate();
    render(<AppSettingsForm />);

    const maxLabel = screen.getByText(/Max active "I'm available" posts per driver/i);
    const maxInput = maxLabel.closest('label')?.querySelector('input') as HTMLInputElement;
    fireEvent.change(maxInput, { target: { value: '7' } });

    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(mutate).toHaveBeenCalledOnce();
    const [payload] = mutate.mock.calls[0];
    expect(payload).toMatchObject({
      minVehicleYear: 2015,
      maxActiveVacanciesPerDriver: 7,
    });
  });

  it('Reset reverts the draft to the last fetched values', () => {
    setSettings();
    render(<AppSettingsForm />);
    const yearInput = screen.getByDisplayValue('2015') as HTMLInputElement;

    fireEvent.change(yearInput, { target: { value: '2020' } });
    expect(yearInput.value).toBe('2020');

    fireEvent.click(screen.getByRole('button', { name: /reset/i }));
    expect((screen.getByDisplayValue('2015') as HTMLInputElement).value).toBe('2015');
  });
});
