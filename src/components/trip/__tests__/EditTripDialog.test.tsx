import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/hooks/useTrips', () => ({ useUpdateTripDetails: vi.fn() }));
import { useUpdateTripDetails } from '@/hooks/useTrips';

vi.mock('@/hooks/useAdminConfig', () => ({
  carTypeHooks: { useList: vi.fn() },
}));
import { carTypeHooks } from '@/hooks/useAdminConfig';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { toast } from 'sonner';

import { ApiError } from '@/lib/api/client';
import { EditTripDialog } from '@/components/trip/EditTripDialog';
import type { Trip } from '@/types';

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  const base = {
    id: 't1',
    tripType: 'one_way',
    status: 'open',
    fromCity: { id: 'c1', name: 'Vellore', stateName: 'TN', isActive: true },
    toCity: { id: 'c2', name: 'Chennai', stateName: 'TN', isActive: true },
    pickupAt: '2026-05-20T08:30:00.000Z',
    expectedDistanceKm: 162,
    carTypeId: 'ct-suv',
    carTypeLabel: 'SUV',
    seatsRequired: 4,
    acRequired: true,
    ratePerKm: 20,
    totalFare: 3240,
    commissionPct: 10,
    gstAmount: 100,
    driverBata: 300,
    driverPayout: 3116,
    extrasPaidByPassenger: true,
    showFareToPassenger: true,
    driverInstructions: '',
    passengerName: '',
    passengerPhone: '',
    passengerCount: 1,
    hidePassengerPhone: false,
    applicantCount: 0,
    postedByName: 'A',
    postedByRole: 'trip_manager',
    postedByUserId: 'u1',
    postedAt: '2026-05-16T00:00:00.000Z',
  } as unknown as Trip;
  return { ...base, ...overrides };
}

beforeEach(() => {
  vi.mocked(carTypeHooks.useList).mockReturnValue({
    isPending: false,
    isError: false,
    data: [
      { id: 'ct-suv', label: 'SUV', sortOrder: 0, isActive: true },
      { id: 'ct-sedan', label: 'Sedan', sortOrder: 1, isActive: true },
      { id: 'ct-old', label: 'Old', sortOrder: 2, isActive: false },
    ],
    refetch: vi.fn(),
  } as never);
});

describe('EditTripDialog', () => {
  it('only PATCHes fields that actually changed and closes on success', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({} as never);
    vi.mocked(useUpdateTripDetails).mockReturnValue({ mutateAsync, isPending: false } as never);
    const onClose = vi.fn();
    render(<EditTripDialog trip={makeTrip()} open onClose={onClose} />);

    const rateInput = screen.getByLabelText(/Rate per km/i);
    fireEvent.change(rateInput, { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: /Save changes/i }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({ tripId: 't1', input: { ratePerKm: 25 } });
    expect(toast.success).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('shows a "trip locked" toast and closes when the server returns 409', async () => {
    const mutateAsync = vi.fn().mockRejectedValue(new ApiError('locked', 409, ''));
    vi.mocked(useUpdateTripDetails).mockReturnValue({ mutateAsync, isPending: false } as never);
    const onClose = vi.fn();
    render(<EditTripDialog trip={makeTrip()} open onClose={onClose} />);

    fireEvent.change(screen.getByLabelText(/Rate per km/i), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: /Save changes/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    const msg = vi.mocked(toast.error).mock.calls[0]?.[0] ?? '';
    expect(String(msg)).toMatch(/applied|invited/i);
    expect(onClose).toHaveBeenCalled();
  });

  it('omits inactive car types from the dropdown', () => {
    vi.mocked(useUpdateTripDetails).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    render(<EditTripDialog trip={makeTrip()} open onClose={vi.fn()} />);
    const select = screen.getByLabelText(/Car type/i) as HTMLSelectElement;
    const labels = Array.from(select.options).map((o) => o.text);
    expect(labels).toContain('SUV');
    expect(labels).toContain('Sedan');
    expect(labels).not.toContain('Old');
  });
});
