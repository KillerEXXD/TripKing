import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/hooks/useTrips', () => ({ useOverlappingApplications: vi.fn() }));
import { useOverlappingApplications } from '@/hooks/useTrips';

import { AcceptTripDialog } from '@/components/trip/AcceptTripDialog';
import type { MyApplication, Trip } from '@/types';

const trip: Trip = {
  id: 't1',
  postedByUserId: 'u1',
  postedByRole: 'trip_manager',
  postedByName: 'A',
  postedByHandle: 'A1B2C3D',
  fromCity: { id: 'c1', name: 'Vellore', state: 'TN', lat: 12.9, lng: 79.1, sortOrder: 1, isActive: true },
  toCity: { id: 'c2', name: 'Chennai', state: 'TN', lat: 13.0, lng: 80.2, sortOrder: 1, isActive: true },
  pickupAt: '2099-06-01T09:00:00Z',
  expectedDistanceKm: 140,
  carTypeId: 'ct1',
  seatsRequired: 4,
  acRequired: true,
  ratePerKm: 14,
  totalFare: 1960,
  commissionPct: 10,
  gstAmount: 98,
  driverBata: 300,
  extrasPaidByPassenger: true,
  driverPayout: 2200,
  passengerName: 'P',
  passengerPhone: '+91',
  passengerCount: 2,
  status: 'selected',
  showFareToPassenger: true,
  hidePassengerPhone: false,
  applicantCount: 0,
  pendingInvitationCount: 0,
  createdAt: '2099-05-30T00:00:00Z',
  acceptanceWindowMinutes: 15,
};

function setOverlap(data: MyApplication[] = [], isSuccess = true, isPending = false) {
  vi.mocked(useOverlappingApplications).mockReturnValue({
    data,
    isSuccess,
    isPending,
    isError: false,
    refetch: vi.fn(),
  } as never);
}

describe('AcceptTripDialog', () => {
  beforeEach(() => {
    vi.mocked(useOverlappingApplications).mockReset();
  });

  it('auto-confirms exactly once on the empty-overlap path even when the parent passes a non-stable onConfirm (Sentry #7487250955)', () => {
    // Reproduces the parent pattern `onConfirm={(ids) => void runAccept(ids)}` — a fresh
    // function reference on every render. Before the fix, the empty-overlap useEffect
    // re-fired on every reference change, calling onConfirm() in a tight loop until
    // React's "Maximum update depth exceeded".
    setOverlap([]);
    const onConfirm = vi.fn();
    const { rerender } = render(
      <AcceptTripDialog trip={trip} open={true} onClose={vi.fn()} onConfirm={onConfirm} pending={false} />,
    );
    // Simulate the parent re-rendering with a NEW onConfirm reference 3 times.
    for (let i = 0; i < 3; i++) {
      rerender(
        <AcceptTripDialog trip={trip} open={true} onClose={vi.fn()} onConfirm={() => onConfirm()} pending={false} />,
      );
    }
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith([]);
  });

  it('resets the auto-confirm guard when the dialog closes, so re-opening still works', () => {
    setOverlap([]);
    const onConfirm = vi.fn();
    const { rerender } = render(
      <AcceptTripDialog trip={trip} open={true} onClose={vi.fn()} onConfirm={onConfirm} pending={false} />,
    );
    expect(onConfirm).toHaveBeenCalledTimes(1);
    rerender(<AcceptTripDialog trip={trip} open={false} onClose={vi.fn()} onConfirm={onConfirm} pending={false} />);
    rerender(<AcceptTripDialog trip={trip} open={true} onClose={vi.fn()} onConfirm={onConfirm} pending={false} />);
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });

  it('renders the overlap list when there are conflicting applications', () => {
    setOverlap([
      {
        acceptanceId: 'a1',
        status: 'applied',
        appliedAt: '2099-05-31T00:00:00Z',
        trip: { ...trip, id: 'other1', fromCity: { ...trip.fromCity, name: 'Salem' }, toCity: { ...trip.toCity, name: 'Tirupati' } },
      } as MyApplication,
    ]);
    render(<AcceptTripDialog trip={trip} open={true} onClose={vi.fn()} onConfirm={vi.fn()} pending={false} />);
    expect(screen.getByText(/1 other trip/i)).toBeInTheDocument();
    expect(screen.getByText(/Salem/i)).toBeInTheDocument();
  });

  it('does not auto-confirm while the overlap query is still pending', () => {
    setOverlap([], false, true);
    const onConfirm = vi.fn();
    render(<AcceptTripDialog trip={trip} open={true} onClose={vi.fn()} onConfirm={onConfirm} pending={false} />);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
