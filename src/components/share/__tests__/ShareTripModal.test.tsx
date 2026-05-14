import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ShareTripModal } from '@/components/share/ShareTripModal';
import type { Trip } from '@/types';

// Real TripShareCard renders (it forwards the ref the modal snapshots); only the
// html-to-image / share plumbing is stubbed so the test is deterministic.
vi.mock('@/lib/share/tripShare', () => ({
  buildShareCaption: () => 'CAPTION TEXT',
  shareFilename: () => 'tripking-x.png',
  nodeToPngBlob: vi.fn().mockResolvedValue(new Blob(['x'], { type: 'image/png' })),
  nativeShareTrip: vi.fn().mockResolvedValue('shared'),
  downloadBlob: vi.fn(),
  // TripShareCard imports these (migration 024 — Phase 4 share variants).
  shareVariant: () => 'one_way_drop',
  VARIANT_LABEL: { one_way_drop: 'One-way drop', round_trip_return: 'Round-trip return back', multi_way_drop: 'Multi-way drop', multi_way_return: 'Multi-way return back' },
}));
import { downloadBlob, nativeShareTrip, nodeToPngBlob } from '@/lib/share/tripShare';
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const city = (id: string, name: string) => ({ id, name, state: 'TN', lat: 12.9, lng: 79.1, sortOrder: 1, isActive: true });
const trip = {
  id: 't1',
  postedByUserId: 'u1',
  postedByRole: 'trip_manager',
  postedByName: 'Agent A',
  postedByHandle: 'A1B2C3D',
  fromCity: city('c1', 'Vellore'),
  toCity: city('c2', 'Chennai'),
  pickupAt: '2099-06-01T03:30:00.000Z',
  expectedDistanceKm: 140,
  carTypeId: 'ct1',
  carTypeLabel: 'Sedan',
  seatsRequired: 4,
  acRequired: true,
  ratePerKm: 15,
  totalFare: 2100,
  commissionPct: 10,
  gstAmount: 100,
  driverBata: 300,
  extrasPaidByPassenger: true,
  driverPayout: 2090,
  passengerName: 'P',
  passengerPhone: '+91',
  passengerCount: 2,
  status: 'open',
  showFareToPassenger: true,
  hidePassengerPhone: false,
  applicantCount: 0,
  pendingInvitationCount: 0,
  createdAt: '2099-05-30T00:00:00.000Z',
} as Trip;

describe('ShareTripModal', () => {
  beforeEach(() => {
    // `mockReset: true` (vitest config) wipes implementations between tests — re-apply them.
    vi.mocked(nodeToPngBlob).mockResolvedValue(new Blob(['x'], { type: 'image/png' }));
    vi.mocked(nativeShareTrip).mockResolvedValue('shared');
    vi.mocked(downloadBlob).mockClear();
  });

  it('renders the share sheet with the card preview and the share / caption / image actions', () => {
    render(<ShareTripModal trip={trip} onClose={vi.fn()} />);
    expect(screen.getByText('Share this trip')).toBeInTheDocument();
    // the real share card renders (preview + offscreen snapshot source)
    expect(screen.getAllByText('🚗 Car type required').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /share/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /caption/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /image/i })).toBeInTheDocument();
  });

  it('"Done" closes the modal', () => {
    const onClose = vi.fn();
    render(<ShareTripModal trip={trip} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /^done$/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('"View the trip" runs the onViewTrip callback', () => {
    const onViewTrip = vi.fn();
    render(<ShareTripModal trip={trip} onClose={vi.fn()} onViewTrip={onViewTrip} />);
    fireEvent.click(screen.getByRole('button', { name: /view the trip/i }));
    expect(onViewTrip).toHaveBeenCalled();
  });

  it('"Image" downloads the generated PNG once it is ready', async () => {
    render(<ShareTripModal trip={trip} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /image/i })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /image/i }));
    expect(downloadBlob).toHaveBeenCalled();
  });
});
