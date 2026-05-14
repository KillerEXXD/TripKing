import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AdminConfigPage } from '@/pages/administration/AdminConfigPage';

vi.mock('@/hooks/useAdminConfig', () => {
  const carTypeRows = [{ id: 'c1', label: 'Sedan', sortOrder: 20, isActive: true }];
  const q = (data: unknown) => () => ({ data, isPending: false, isError: false, error: null, refetch: vi.fn() });
  const m = () => () => ({ mutate: vi.fn(), isPending: false });
  const bundle = (rows: unknown[]) => ({ useList: q(rows), useCreate: m(), useUpdate: m(), useToggleActive: m(), useRemove: m(), useReorder: m() });
  return {
    carTypeHooks: bundle(carTypeRows),
    fuelTypeHooks: bundle([]),
    vehicleMakeHooks: bundle([]),
    vehicleModelHooks: bundle([]),
    cityHooks: bundle([]),
    languageHooks: bundle([]),
    reviewTagHooks: bundle([]),
    cancelReasonHooks: bundle([]),
    useSeatOptions: q([]),
    useCreateSeatOption: m(),
    useToggleSeatOption: m(),
    useRemoveSeatOption: m(),
    useReviewTagsByCategory: q([]),
    useVehicleModelsForMake: q([]),
    useAppSettings: q({
      minVehicleYear: 2015,
      vehicleExpiryWarningDays: 90,
      defaultAlertRadiusKm: 25,
      defaultCommissionPct: 10,
      defaultGstAmount: 100,
      defaultDriverBata: 300,
      defaultExtrasPaidByPassenger: true,
      defaultDriverInstructions: '1. Call the customer before arrival',
    }),
    useUpdateAppSettings: m(),
  };
});

describe('AdminConfigPage', () => {
  it('renders all reference-data sections and opens on General settings', () => {
    render(<AdminConfigPage />);
    for (const label of [
      'General settings',
      'Car types',
      'Fuel types',
      'Vehicle makes & models',
      'Seat options',
      'Cities',
      'Languages',
      'Review tags',
      'Cancellation reasons',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole('heading', { name: /general settings/i })).toBeInTheDocument();
    expect(screen.getByDisplayValue('2015')).toBeInTheDocument();
  });

  it('Car types section lists rows', () => {
    render(<AdminConfigPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Car types' }));
    expect(screen.getByRole('heading', { name: 'Car types' })).toBeInTheDocument();
    expect(screen.getByText('Sedan')).toBeInTheDocument();
  });

  it('Vehicle makes & models section renders the master-detail (empty state)', () => {
    render(<AdminConfigPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Vehicle makes & models' }));
    expect(screen.getByRole('heading', { name: /vehicle makes & models/i })).toBeInTheDocument();
    expect(screen.getByText(/no makes yet/i)).toBeInTheDocument();
    expect(screen.getByText(/pick a make on the left/i)).toBeInTheDocument();
  });

  it('Review tags section renders the three vocabularies', () => {
    render(<AdminConfigPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Review tags' }));
    expect(screen.getByText('Passenger → driver')).toBeInTheDocument();
    expect(screen.getByText('Agent → driver')).toBeInTheDocument();
    expect(screen.getByText('Driver → agent')).toBeInTheDocument();
  });

  it('Cities / Languages / Seat options / Cancellation reasons render without crashing', () => {
    render(<AdminConfigPage />);
    for (const tab of ['Cities', 'Languages', 'Seat options', 'Cancellation reasons']) {
      fireEvent.click(screen.getByRole('button', { name: tab }));
      expect(screen.getByRole('heading', { name: tab })).toBeInTheDocument();
    }
  });
});
