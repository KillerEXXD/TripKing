import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { VehicleFormPage } from '@/pages/VehicleFormPage';
import type { Vehicle } from '@/types';

vi.mock('@/hooks/useVehicles', () => ({ useVehicle: vi.fn(), useAddVehicle: vi.fn(), useUpdateVehicle: vi.fn() }));
import { useAddVehicle, useUpdateVehicle, useVehicle } from '@/hooks/useVehicles';
vi.mock('@/hooks/useAdminConfig', () => ({
  carTypeHooks: { useList: () => ({ data: [{ id: 'ct-sedan', label: 'Sedan' }, { id: 'ct-suv', label: 'SUV' }] }) },
  fuelTypeHooks: { useList: () => ({ data: [{ id: 'fuel-diesel', label: 'Diesel' }] }) },
  vehicleMakeHooks: { useList: () => ({ data: [{ id: 'make-maruti', label: 'Maruti Suzuki' }] }) },
  useSeatOptions: () => ({ data: [{ value: 4 }, { value: 5 }, { value: 7 }] }),
  useVehicleModelsForMake: () => ({ data: [] }),
  useAppSettings: () => ({ data: { minVehicleYear: 2015 } }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function setQuery(mock: ReturnType<typeof vi.fn>, v: Partial<{ isPending: boolean; isError: boolean; data: unknown }> = {}) {
  mock.mockReturnValue({ isPending: false, isError: false, data: undefined, refetch: vi.fn(), ...v } as never);
}

function renderNew() {
  return render(
    <MemoryRouter initialEntries={['/app/vehicles/new']}>
      <Routes>
        <Route path="/app/vehicles/new" element={<VehicleFormPage />} />
        <Route path="/app/vehicles/:id/photos" element={<div>photos page</div>} />
        <Route path="/app/profile" element={<div>profile page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('VehicleFormPage (add)', () => {
  beforeEach(() => {
    vi.mocked(useVehicle).mockReset();
    vi.mocked(useAddVehicle).mockReset();
    vi.mocked(useUpdateVehicle).mockReset();
    setQuery(vi.mocked(useVehicle));
    vi.mocked(useAddVehicle).mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue({ id: 'veh-9' } as Vehicle), isPending: false } as never);
    vi.mocked(useUpdateVehicle).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
  });

  it('rejects a year older than the minimum and keeps the submit button disabled', () => {
    renderNew();
    expect(screen.getByRole('heading', { name: /add your vehicle/i })).toBeInTheDocument();
    const submit = screen.getByRole('button', { name: /add vehicle & continue/i });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/^year/i), { target: { value: '2010' } });
    expect(screen.getByText(/must be 2015 or newer/i)).toBeInTheDocument();
    expect(submit).toBeDisabled();
  });

  it('adds the vehicle and goes to its photos screen once the required fields are filled', async () => {
    const add = { mutateAsync: vi.fn().mockResolvedValue({ id: 'veh-9' } as Vehicle), isPending: false };
    vi.mocked(useAddVehicle).mockReturnValue(add as never);
    renderNew();

    fireEvent.change(screen.getByLabelText(/^year/i), { target: { value: '2021' } });
    fireEvent.change(screen.getByLabelText(/car type/i), { target: { value: 'ct-suv' } });
    fireEvent.change(screen.getByLabelText(/^seats/i), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText(/registration number/i), { target: { value: 'tn09ab1234' } });

    const submit = screen.getByRole('button', { name: /add vehicle & continue/i });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() =>
      expect(add.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ year: 2021, carTypeId: 'ct-suv', seats: 7, registrationNumber: 'TN09AB1234', ac: true, isPrimary: true }),
      ),
    );
    expect(await screen.findByText('photos page')).toBeInTheDocument();
  });
});
