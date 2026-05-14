import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PassengerLinkModal } from '@/components/share/PassengerLinkModal';
import type { Trip } from '@/types';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/share/tripShareImage', () => ({
  renderTripShareImage: vi.fn(async () => new File([new Uint8Array([1, 2, 3])], 'tripking-trip.png', { type: 'image/png' })),
}));
import { renderTripShareImage } from '@/lib/share/tripShareImage';

const city = (id: string, name: string) => ({ id, name, state: 'TN', lat: 12.9, lng: 79.1, sortOrder: 1, isActive: true });
const trip: Trip = {
  id: 't1',
  postedByUserId: 'u1',
  postedByRole: 'trip_manager',
  postedByName: 'Agent A',
  postedByHandle: 'A1B2C3D',
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
  status: 'accepted',
  showFareToPassenger: true,
  hidePassengerPhone: false,
  applicantCount: 1,
  pendingInvitationCount: 0,
  createdAt: '2099-05-30T00:00:00.000Z',
  acceptanceWindowMinutes: 15,
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
    fireEvent.click(screen.getByRole('button', { name: /copy the caption/i }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/passenger/999000'));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Passenger OTP: 999000'));
  });

  it('share with files when the platform supports it — attaches the trip image PNG', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);
    vi.stubGlobal('navigator', { ...navigator, share, canShare });
    render(<PassengerLinkModal trip={trip} otp="654321" onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /share with passenger/i }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(renderTripShareImage).toHaveBeenCalledWith(expect.objectContaining({ otp: '654321', url: expect.stringContaining('/passenger/654321') }));
    const arg = share.mock.calls[0][0];
    expect(arg.text).toContain('Passenger OTP: 654321');
    expect(arg.text).toContain('/passenger/654321');
    expect(arg.files).toHaveLength(1);
    expect(arg.files[0]).toBeInstanceOf(File);
    expect(arg.files[0].type).toBe('image/png');
  });

  it('text-only share when canShare({files}) is false (desktop fallback)', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(false);
    vi.stubGlobal('navigator', { ...navigator, share, canShare });
    render(<PassengerLinkModal trip={trip} otp="111222" onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /share with passenger/i }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    const arg = share.mock.calls[0][0];
    expect(arg.files).toBeUndefined();
    expect(arg.text).toContain('Passenger OTP: 111222');
  });

  it('calls onClose when dismissed', () => {
    const onClose = vi.fn();
    render(<PassengerLinkModal trip={trip} otp="123456" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /^close$/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
