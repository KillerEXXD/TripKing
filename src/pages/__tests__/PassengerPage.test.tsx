import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { PassengerPage } from '@/pages/PassengerPage';
import type { Driver, Trip } from '@/types';

vi.mock('@/hooks/useTrips', () => ({ useTripByOtp: vi.fn() }));
import { useTripByOtp } from '@/hooks/useTrips';
vi.mock('@/hooks/useDrivers', () => ({ useDriver: vi.fn() }));
import { useDriver } from '@/hooks/useDrivers';

const city = (id: string, name: string) => ({ id, name, state: 'TN', lat: 12.9, lng: 79.1, sortOrder: 1, isActive: true });
function makeTrip(over: Partial<Trip> = {}): Trip {
  return {
    id: 't1',
    postedByUserId: 'u9',
    postedByRole: 'trip_manager',
    postedByName: 'Agent A',
    postedByPhone: '+919000000000',
    fromCity: city('c1', 'Vellore'),
    toCity: city('c2', 'Chennai'),
    pickupAt: '2099-06-01T09:00:00.000Z',
    expectedDistanceKm: 140,
    carTypeId: 'ct1',
    carTypeLabel: 'Sedan',
    seatsRequired: 4,
    acRequired: true,
    ratePerKm: 14,
    totalFare: 1960,
    commissionPct: 10,
    gstAmount: 98,
    driverBata: 300,
    extrasPaidByPassenger: true,
    driverPayout: 2200,
    passengerName: 'Priya Sharma',
    passengerPhone: '+919999999999',
    passengerCount: 2,
    status: 'assigned',
    assignedDriverId: 'd1',
    showFareToPassenger: true,
    hidePassengerPhone: false,
    applicantCount: 1,
    createdAt: '2099-05-30T00:00:00.000Z',
    ...over,
  };
}
const driver: Driver = {
  id: 'd1',
  userId: 'du1',
  fullName: 'Ravi Kumar',
  phone: '+918888888888',
  profilePhotoUrl: '',
  kycStatus: 'approved',
  ratingAvg: 4.7,
  ratingCount: 12,
  ratingDistribution: { '1': 0, '2': 0, '3': 1, '4': 3, '5': 8 },
  topTags: [],
  managerTopTags: [],
  totalTripsCompleted: 30,
  vehicles: [{ id: 'v1', makeLabel: 'Toyota', modelName: 'Etios', year: 2021, carTypeLabel: 'Sedan', seats: 4, ac: true }],
};

type Q<T> = { isPending?: boolean; isError?: boolean; error?: unknown; data?: T; refetch?: () => void };
function setTripByOtp(s: Q<Trip>) {
  vi.mocked(useTripByOtp).mockReturnValue({ isPending: false, isError: false, error: null, data: undefined, refetch: vi.fn(), ...s } as never);
}
function setDriver(s: Q<Driver> = {}) {
  vi.mocked(useDriver).mockReturnValue({ isPending: false, isError: false, error: null, data: driver, refetch: vi.fn(), ...s } as never);
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/passenger" element={<PassengerPage />} />
        <Route path="/passenger/:otp" element={<PassengerPage />} />
        <Route path="/" element={<div>home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PassengerPage', () => {
  beforeEach(() => {
    vi.mocked(useTripByOtp).mockReset();
    vi.mocked(useDriver).mockReset();
    setTripByOtp({ data: makeTrip() });
    setDriver();
  });

  it('shows the OTP gate at /passenger and navigates to the trip view on submit', () => {
    renderAt('/passenger');
    expect(screen.getByText(/enter your trip otp/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/trip otp/i), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /view my trip/i }));
    expect(screen.getByText('Vellore → Chennai')).toBeInTheDocument();
  });

  it('shows a skeleton while the trip loads', () => {
    setTripByOtp({ isPending: true });
    renderAt('/passenger/123456');
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
  });

  it('shows an "OTP not recognised" state on lookup failure', () => {
    setTripByOtp({ isError: true, error: new Error('not found') });
    renderAt('/passenger/000000');
    expect(screen.getByText(/otp not recognised/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try another otp/i }));
    expect(screen.getByText(/enter your trip otp/i)).toBeInTheDocument();
  });

  it('renders the trip — route, driver, trip manager, fare', () => {
    setTripByOtp({ data: makeTrip() });
    renderAt('/passenger/123456');
    expect(screen.getByText('Vellore → Chennai')).toBeInTheDocument();
    expect(screen.getByText(/hello, priya/i)).toBeInTheDocument();
    expect(screen.getByText('Ravi Kumar')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /call ravi kumar/i })).toBeInTheDocument();
    expect(screen.getByText('Agent A')).toBeInTheDocument();
    expect(screen.getByText(/total to the driver/i)).toBeInTheDocument();
  });

  it('hides the fare when the trip manager opted out', () => {
    setTripByOtp({ data: makeTrip({ showFareToPassenger: false }) });
    renderAt('/passenger/123456');
    expect(screen.getByText(/fare handled separately/i)).toBeInTheDocument();
    expect(screen.queryByText(/total to the driver/i)).toBeNull();
  });

  it('notes when no driver has been assigned yet', () => {
    setTripByOtp({ data: makeTrip({ status: 'has_applicants', assignedDriverId: undefined }) });
    renderAt('/passenger/123456');
    expect(screen.getByText(/driver hasn't been assigned/i)).toBeInTheDocument();
  });
});
