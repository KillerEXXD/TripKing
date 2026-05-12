import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PassengerLinkModal } from '@/components/share/PassengerLinkModal';
import type { Trip } from '@/types';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const city = (id: string, name: string) => ({ id, name, state: 'TN', lat: 12.9, lng: 79.1, sortOrder: 1, isActive: true });
const trip: Trip = {
  id: 't1',
  postedByUserId: 'u1',
  postedByRole: 'trip_manager',
  postedByName: 'Agent A',
  fromCity: city('c1', 'Vellore'),
  toCity: city('c2', 'Chennai'),
  pickupAt: '2099-06-01T09:00:00.000Z',
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
  passengerName: 'Priya',
  passengerPhone: '+91',
  passengerCount: 2,
  status: 'assigned',
  showFareToPassenger: true,
  hidePassengerPhone: false,
  applicantCount: 1,
  createdAt: '2099-05-30T00:00:00.000Z',
};

describe('PassengerLinkModal', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the passenger-portal link with the OTP baked in', () => {
    render(<PassengerLinkModal trip={trip} otp="123456" onClose={vi.fn()} />);
    expect(screen.getByText(/share with the passenger/i)).toBeInTheDocument();
    expect(screen.getByText(/\/passenger\/123456$/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open the passenger view/i })).toHaveAttribute('href', expect.stringContaining('/passenger/123456'));
  });

  it('copies the share caption when navigator.share is unavailable', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText } });
    render(<PassengerLinkModal trip={trip} otp="999000" onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /copy the link/i }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/passenger/999000'));
  });

  it('calls onClose when dismissed', () => {
    const onClose = vi.fn();
    render(<PassengerLinkModal trip={trip} otp="123456" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /^close$/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
