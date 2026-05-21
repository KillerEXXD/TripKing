import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { MyApplication } from '@/types';

vi.mock('@/hooks/useTrips', () => ({ useAcceptTrip: vi.fn(), useDeclineTrip: vi.fn(), useIncomingOffer: vi.fn() }));
vi.mock('@/hooks/usePlatformConfig', () => ({ useDispatchAlgorithm: vi.fn() }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import { useAcceptTrip, useDeclineTrip, useIncomingOffer } from '@/hooks/useTrips';
import { useDispatchAlgorithm } from '@/hooks/usePlatformConfig';
import { IncomingOfferModal, IncomingOfferGate } from '@/components/dispatch/IncomingOfferModal';

function offer(over: Partial<MyApplication['trip']> = {}): MyApplication {
  return {
    acceptanceId: 'a1',
    status: 'selected',
    appliedAt: new Date().toISOString(),
    trip: {
      id: 't1',
      fromCity: { name: 'Vellore' },
      toCity: { name: 'Chennai' },
      pickupAt: new Date(Date.now() + 3 * 3600_000).toISOString(),
      totalFare: 1500,
      ratePerKm: 15,
      acceptanceDeadlineAt: new Date(Date.now() + 45_000).toISOString(),
      ...over,
    },
  } as unknown as MyApplication;
}

let acceptMutate: ReturnType<typeof vi.fn>;
let declineMutate: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  acceptMutate = vi.fn();
  declineMutate = vi.fn();
  vi.mocked(useAcceptTrip).mockReturnValue({ mutate: acceptMutate, isPending: false } as never);
  vi.mocked(useDeclineTrip).mockReturnValue({ mutate: declineMutate, isPending: false } as never);
});

describe('IncomingOfferModal', () => {
  it('renders the trip summary + countdown + Accept/Decline', () => {
    render(<IncomingOfferModal offer={offer()} onClose={vi.fn()} />);
    expect(screen.getByText('Vellore → Chennai')).toBeInTheDocument();
    expect(screen.getByText(/new trip offer/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /accept/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /decline/i })).toBeInTheDocument();
    // countdown ring shows a number ≤ 60
    expect(screen.getByRole('img', { name: /seconds to accept/i })).toBeInTheDocument();
  });

  it('Accept calls useAcceptTrip with the trip id', () => {
    render(<IncomingOfferModal offer={offer()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /accept/i }));
    expect(acceptMutate).toHaveBeenCalledTimes(1);
    expect(acceptMutate.mock.calls[0][0]).toEqual({ tripId: 't1' });
  });

  it('Decline calls useDeclineTrip with the trip id', () => {
    render(<IncomingOfferModal offer={offer()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /decline/i }));
    expect(declineMutate).toHaveBeenCalledTimes(1);
    expect(declineMutate.mock.calls[0][0]).toEqual({ tripId: 't1' });
  });

  it('auto-closes when the deadline has already passed', () => {
    const onClose = vi.fn();
    render(<IncomingOfferModal offer={offer({ acceptanceDeadlineAt: new Date(Date.now() - 1000).toISOString() })} onClose={onClose} />);
    expect(onClose).toHaveBeenCalled();
  });
});

describe('IncomingOfferGate', () => {
  it('renders nothing in Manual mode (no query/poll)', () => {
    vi.mocked(useDispatchAlgorithm).mockReturnValue('manual');
    const { container } = render(<IncomingOfferGate />);
    expect(container).toBeEmptyDOMElement();
    expect(useIncomingOffer).not.toHaveBeenCalled();
  });

  it('shows the modal in Auto mode when there is a live offer', () => {
    vi.mocked(useDispatchAlgorithm).mockReturnValue('auto');
    vi.mocked(useIncomingOffer).mockReturnValue(offer());
    render(<IncomingOfferGate />);
    expect(screen.getByRole('dialog', { name: /incoming trip offer/i })).toBeInTheDocument();
  });

  it('renders nothing in Auto mode when there is no offer', () => {
    vi.mocked(useDispatchAlgorithm).mockReturnValue('auto');
    vi.mocked(useIncomingOffer).mockReturnValue(null);
    const { container } = render(<IncomingOfferGate />);
    expect(container).toBeEmptyDOMElement();
  });
});
