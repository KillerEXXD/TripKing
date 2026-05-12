import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminDriversPage } from '@/pages/administration/AdminDriversPage';
import type { Driver } from '@/types';

vi.mock('@/hooks/useDrivers', () => ({ useDrivers: vi.fn() }));
import { useDrivers } from '@/hooks/useDrivers';

const city = (id: string, name: string) => ({ id, name, state: 'TN', lat: 12.9, lng: 79.1, sortOrder: 1, isActive: true });
function makeDriver(over: Partial<Driver> = {}): Driver {
  return {
    id: 'd1',
    userId: 'u1',
    fullName: 'Ravi Kumar',
    phone: '+919876500000',
    homeCity: city('c1', 'Vellore'),
    currentCity: city('c1', 'Vellore'),
    profilePhotoUrl: '',
    kycStatus: 'approved',
    ratingAvg: 4.7,
    ratingCount: 9,
    ratingDistribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
    topTags: [],
    managerTopTags: [],
    totalTripsCompleted: 20,
    vehicles: [{ id: 'v1', year: 2021, seats: 5, ac: true, carTypeLabel: 'Sedan' }],
    ...over,
  } as Driver;
}

type Q = { isPending?: boolean; isError?: boolean; data?: Driver[]; refetch?: () => void };
function setDrivers(q: Q = {}) {
  vi.mocked(useDrivers).mockReturnValue({ isPending: false, isError: false, data: [], refetch: vi.fn(), ...q } as never);
}
function renderPage() {
  return render(<MemoryRouter><AdminDriversPage /></MemoryRouter>);
}

describe('AdminDriversPage', () => {
  beforeEach(() => {
    vi.mocked(useDrivers).mockReset();
    setDrivers({ data: [] });
  });

  it('lists drivers with their KYC badge, rating and a profile link', () => {
    setDrivers({ data: [makeDriver(), makeDriver({ id: 'd2', userId: 'u2', fullName: 'Suresh P', kycStatus: 'pending', ratingCount: 0, totalTripsCompleted: 0, vehicles: [] })] });
    renderPage();
    expect(screen.getByRole('heading', { name: /^drivers$/i })).toBeInTheDocument();
    expect(screen.getByText('Ravi Kumar')).toBeInTheDocument();
    expect(screen.getByText('Verified', { selector: '[data-slot="badge"]' })).toBeInTheDocument();
    expect(screen.getByText(/9 reviews/)).toBeInTheDocument();
    expect(screen.getByText('Suresh P')).toBeInTheDocument();
    expect(screen.getByText('Pending', { selector: '[data-slot="badge"]' })).toBeInTheDocument();
    const profileLinks = screen.getAllByRole('link', { name: /profile/i });
    expect(profileLinks.length).toBeGreaterThanOrEqual(2);
    expect(profileLinks[0]).toHaveAttribute('href', '/drivers/d1');
  });

  it('filters the loaded list by the search box (name / phone)', () => {
    setDrivers({ data: [makeDriver(), makeDriver({ id: 'd2', userId: 'u2', fullName: 'Suresh P', phone: '+918000000000' })] });
    renderPage();
    fireEvent.change(screen.getByLabelText(/search drivers/i), { target: { value: 'suresh' } });
    expect(screen.queryByText('Ravi Kumar')).toBeNull();
    expect(screen.getByText('Suresh P')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/search drivers/i), { target: { value: '987650' } });
    expect(screen.getByText('Ravi Kumar')).toBeInTheDocument();
    expect(screen.queryByText('Suresh P')).toBeNull();
  });

  it('a KYC chip narrows the server query', () => {
    setDrivers({ data: [makeDriver()] });
    renderPage();
    const lastCallArg = () => {
      const calls = vi.mocked(useDrivers).mock.calls;
      return calls[calls.length - 1]?.[0];
    };
    // initial render: no kycStatus, limit 200
    expect(lastCallArg()).toEqual({ limit: 200 });
    fireEvent.click(screen.getByRole('button', { name: 'Pending' }));
    expect(lastCallArg()).toEqual({ kycStatus: 'pending', limit: 200 });
  });

  it('shows loading, error and empty states', () => {
    setDrivers({ isPending: true });
    const { rerender } = renderPage();
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
    setDrivers({ isError: true });
    rerender(<MemoryRouter><AdminDriversPage /></MemoryRouter>);
    expect(screen.getByText(/couldn't load drivers/i)).toBeInTheDocument();
    setDrivers({ data: [] });
    rerender(<MemoryRouter><AdminDriversPage /></MemoryRouter>);
    expect(screen.getByText('No drivers')).toBeInTheDocument();
  });
});
