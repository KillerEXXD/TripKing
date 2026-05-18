import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { VehiclePhotosPage } from '@/pages/VehiclePhotosPage';
import type { Vehicle } from '@/types';

vi.mock('@/hooks/useVehicles', () => ({ useVehicle: vi.fn(), useUpdateVehicle: vi.fn() }));
import { useUpdateVehicle, useVehicle } from '@/hooks/useVehicles';
vi.mock('@/lib/api/services/vehicles', () => ({ getVehiclePhotoUploadUrl: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/form', () => ({
  FileUpload: ({ label, onUploaded }: { label: string; onUploaded: (p: string) => void }) => (
    <button type="button" aria-label={`Upload ${label}`} onClick={() => onUploaded(`path/${label}`)}>{label}</button>
  ),
}));

function vehicle(over: Partial<Vehicle> = {}): Vehicle {
  return {
    id: 'veh-1',
    driverId: 'd1',
    year: 2021,
    carTypeId: 'ct-suv',
    seats: 7,
    ac: true,
    registrationNumber: 'TN09AB1234',
    photoFrontUrl: '',
    photoBackUrl: '',
    photoLeftUrl: '',
    photoRightUrl: '',
    photoPlateUrl: '',
    photoInteriorUrl: '',
    rcBookUrl: '',
    insuranceUrl: '',
    permitUrl: '',
    isPrimary: true,
    ...over,
  } as Vehicle;
}

function setVehicle(v: Partial<{ isPending: boolean; isError: boolean; data: unknown }> = {}) {
  vi.mocked(useVehicle).mockReturnValue({ isPending: false, isError: false, data: vehicle(), refetch: vi.fn(), ...v } as never);
}
function setUpdate() {
  const u = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };
  vi.mocked(useUpdateVehicle).mockReturnValue(u as never);
  return u;
}
function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/app/vehicles/veh-1/photos']}>
      <Routes>
        <Route path="/app/vehicles/:id/photos" element={<VehiclePhotosPage />} />
        <Route path="/app/profile" element={<div>profile page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('VehiclePhotosPage', () => {
  beforeEach(() => {
    vi.mocked(useVehicle).mockReset();
    vi.mocked(useUpdateVehicle).mockReset();
    setVehicle();
    setUpdate();
  });

  it('renders the photo/paper slots and lists what is still missing', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /vehicle photos & papers/i })).toBeInTheDocument();
    for (const label of ['Front', 'Back', 'Left side', 'Right side', 'Number plate', 'Interior (optional)', 'RC book', 'Insurance']) {
      expect(screen.getByRole('button', { name: `Upload ${label}` })).toBeInTheDocument();
    }
    expect(screen.getByText(/still needed:/i)).toBeInTheDocument();
  });

  it('saves an uploaded photo path onto the vehicle', () => {
    const u = setUpdate();
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Upload Front' }));
    expect(u.mutate).toHaveBeenCalledWith({ id: 'veh-1', patch: { photoFrontUrl: 'path/Front' } }, expect.anything());
  });

  it('shows the all-clear banner once every required slot is filled', () => {
    setVehicle({
      data: vehicle({ photoFrontUrl: 'a', photoBackUrl: 'b', photoLeftUrl: 'c', photoRightUrl: 'd', photoPlateUrl: 'e', rcBookUrl: 'f', insuranceUrl: 'g' }),
    });
    renderPage();
    expect(screen.getByText(/all required photos & papers are in/i)).toBeInTheDocument();
    expect(screen.queryByText(/still needed:/i)).toBeNull();
  });
});
