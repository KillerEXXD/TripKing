import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { DriverProfilePage } from '@/pages/DriverProfilePage';
import { ApiError } from '@/lib/api/client';
import type { Driver } from '@/types';

vi.mock('@/hooks/useDrivers', () => ({ useDriver: vi.fn() }));
import { useDriver } from '@/hooks/useDrivers';

const city = (id: string, name: string) => ({ id, name, state: 'Tamil Nadu', lat: 12.9, lng: 79.1, sortOrder: 1, isActive: true });
function makeDriver(over: Partial<Driver> = {}): Driver {
  return {
    id: 'd1',
    userId: 'u1',
    fullName: 'Ravi Kumar',
    phone: '+919876500000',
    homeCity: city('c1', 'Vellore'),
    currentCity: city('c2', 'Chennai'),
    profilePhotoUrl: '',
    kycStatus: 'approved',
    ratingAvg: 4.8,
    ratingCount: 12,
    ratingDistribution: { '1': 0, '2': 1, '3': 1, '4': 3, '5': 7 },
    topTags: ['Punctual', 'Clean car'],
    managerTopTags: ['Reliable'],
    totalTripsCompleted: 41,
    vehicles: [{ id: 'v1', makeLabel: 'Toyota', modelName: 'Innova Crysta', year: 2021, carTypeLabel: 'Innova', seats: 7, ac: true }],
    ...over,
  };
}

type DriverState = { isPending?: boolean; isError?: boolean; error?: unknown; data?: Driver; refetch?: () => void };
function setDriver(state: DriverState) {
  vi.mocked(useDriver).mockReturnValue({ isPending: false, isError: false, error: null, data: undefined, refetch: vi.fn(), ...state } as never);
}

function renderProfile() {
  return render(
    <MemoryRouter initialEntries={['/drivers/d1']}>
      <Routes>
        <Route path="/drivers/:id" element={<DriverProfilePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('DriverProfilePage', () => {
  beforeEach(() => vi.mocked(useDriver).mockReset());

  it('renders a skeleton while the profile loads', () => {
    setDriver({ isPending: true });
    renderProfile();
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
  });

  it('renders an error state with retry on a generic failure', () => {
    const refetch = vi.fn();
    setDriver({ isError: true, error: new Error('boom'), refetch });
    renderProfile();
    expect(screen.getByText(/couldn't load this profile/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it('renders a "not found" state (no retry) on a 404', () => {
    setDriver({ isError: true, error: new ApiError('Driver not found', 404) });
    renderProfile();
    expect(screen.getByText(/driver not found/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
  });

  it('renders the driver name, rating, tags and vehicles', () => {
    setDriver({ data: makeDriver() });
    renderProfile();
    expect(screen.getByRole('heading', { name: 'Ravi Kumar' })).toBeInTheDocument();
    expect(screen.getByText(/12 reviews/i)).toBeInTheDocument();
    expect(screen.getByText('★ Punctual')).toBeInTheDocument();
    expect(screen.getByText('★ Reliable')).toBeInTheDocument();
    expect(screen.getByText(/Toyota Innova Crysta 2021/)).toBeInTheDocument();
  });

  it('shows "No ratings yet" for a driver with no reviews', () => {
    setDriver({ data: makeDriver({ ratingCount: 0, ratingAvg: 0, topTags: [], managerTopTags: [] }) });
    renderProfile();
    expect(screen.getByText(/no ratings yet/i)).toBeInTheDocument();
  });
});
