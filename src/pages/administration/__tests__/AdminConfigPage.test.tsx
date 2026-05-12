import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AdminConfigPage } from '@/pages/administration/AdminConfigPage';

vi.mock('@/hooks/useAdminConfig', () => {
  const lookupRows = [
    { id: 'c1', label: 'Sedan', sortOrder: 20, isActive: true },
    { id: 'c2', label: 'SUV', sortOrder: 30, isActive: false },
  ];
  const query = (data: unknown) => () => ({ data, isPending: false, isError: false, error: null, refetch: vi.fn() });
  const mutation = () => () => ({ mutate: vi.fn(), isPending: false });
  const lookupBundle = () => ({
    useList: query(lookupRows),
    useCreate: mutation(),
    useUpdate: mutation(),
    useToggleActive: mutation(),
    useRemove: mutation(),
    useReorder: mutation(),
  });
  return {
    carTypeHooks: lookupBundle(),
    fuelTypeHooks: lookupBundle(),
    useAppSettings: query({
      minVehicleYear: 2015,
      vehicleExpiryWarningDays: 90,
      defaultAlertRadiusKm: 25,
      defaultCommissionPct: 10,
      defaultGstPct: 5,
      defaultDriverBata: 300,
      defaultExtrasPaidByPassenger: true,
      defaultDriverInstructions: '1. Call the customer before arrival',
    }),
    useUpdateAppSettings: mutation(),
  };
});

describe('AdminConfigPage', () => {
  it('opens on the General settings section with the app-settings form populated', () => {
    render(<AdminConfigPage />);
    expect(screen.getByRole('heading', { name: /general settings/i })).toBeInTheDocument();
    expect(screen.getByDisplayValue('2015')).toBeInTheDocument();
    expect(screen.getByDisplayValue('300')).toBeInTheDocument();
  });

  it('switches to the Car types section and lists rows (inactive ones dimmed)', () => {
    render(<AdminConfigPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Car types' }));
    expect(screen.getByRole('heading', { name: 'Car types' })).toBeInTheDocument();
    expect(screen.getByText('Sedan')).toBeInTheDocument();
    expect(screen.getByText('SUV')).toBeInTheDocument();
    // the inactive row offers "Enable", the active one offers "Disable"
    expect(screen.getByRole('button', { name: /^enable$/i })).toBeInTheDocument();
  });

  it('shows the "more lists — next iteration" note under More lists', () => {
    render(<AdminConfigPage />);
    fireEvent.click(screen.getByRole('button', { name: 'More lists' }));
    expect(screen.getByText(/next iteration/i)).toBeInTheDocument();
  });
});
