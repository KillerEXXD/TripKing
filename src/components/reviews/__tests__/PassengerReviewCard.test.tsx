import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PassengerReviewCard } from '@/components/reviews/PassengerReviewCard';
import { ApiError } from '@/lib/api/client';
import type { Trip } from '@/types';

vi.mock('@/hooks/useReviews', () => ({ useCreatePassengerReview: vi.fn() }));
import { useCreatePassengerReview } from '@/hooks/useReviews';
vi.mock('@/hooks/useAdminConfig', () => ({ useReviewTagsByCategory: vi.fn() }));
import { useReviewTagsByCategory } from '@/hooks/useAdminConfig';
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
import { toast } from 'sonner';

const city = (id: string, name: string) => ({ id, name, state: 'TN', lat: 12.9, lng: 79.1, sortOrder: 1, isActive: true });
const trip = {
  id: 'trip-x', postedByUserId: 'u1', postedByRole: 'trip_manager', postedByName: 'Agent', postedByHandle: 'A',
  fromCity: city('c1', 'Vellore'), toCity: city('c2', 'Chennai'),
  pickupAt: '2026-05-17T09:00:00Z', expectedDistanceKm: 140, carTypeId: 'ct1', seatsRequired: 4, acRequired: true,
  ratePerKm: 14, totalFare: 1960, commissionPct: 10, gstAmount: 98, driverBata: 300, extrasPaidByPassenger: true,
  driverPayout: 2200, passengerName: 'P', passengerPhone: '+91', passengerCount: 2, status: 'completed',
  showFareToPassenger: true, hidePassengerPhone: false, applicantCount: 0, pendingInvitationCount: 0,
  createdAt: '2026-05-16T00:00:00Z', acceptanceWindowMinutes: 15,
  assignedDriver: { id: 'd1', userId: 'du1', fullName: 'Murugan S', phone: null, profilePhotoUrl: null, kycStatus: 'approved', ratingAvg: 0, ratingCount: 0, totalTripsCompleted: 0 },
} as unknown as Trip;

function setSubmit(over: Partial<{ mutateAsync: ReturnType<typeof vi.fn>; isPending: boolean }> = {}) {
  const mutateAsync = vi.fn().mockResolvedValue({});
  vi.mocked(useCreatePassengerReview).mockReturnValue({ mutateAsync, isPending: false, ...over } as never);
  return mutateAsync;
}

describe('PassengerReviewCard', () => {
  beforeEach(() => {
    vi.mocked(useCreatePassengerReview).mockReset();
    vi.mocked(useReviewTagsByCategory).mockReturnValue({ data: [] } as never);
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.info).mockClear();
    vi.mocked(toast.error).mockClear();
    setSubmit();
  });

  it('renders the star picker + comment box for a fresh review', () => {
    render(<PassengerReviewCard trip={trip} passengerOtp="123456" />);
    expect(screen.getByText(/rate your driver/i)).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(5);
    expect(screen.getByLabelText(/comment/i)).toBeInTheDocument();
    expect(screen.getByText(/how was your trip with murugan s/i)).toBeInTheDocument();
  });

  it('shows a thanks message instead of the form when the passenger has already rated', () => {
    render(<PassengerReviewCard trip={trip} passengerOtp="123456" existingReview={{ score: 4, comment: 'Great driver.' }} />);
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.getByText(/your review/i)).toBeInTheDocument();
    const matches = screen.getAllByText((_, el) => el?.textContent?.includes('Thanks — you rated this driver 4') ?? false);
    expect(matches.length).toBeGreaterThan(0);
    expect(screen.getByText(/"great driver\."/i)).toBeInTheDocument();
  });

  it('submits with the picked star score + comment + OTP', async () => {
    const mutateAsync = setSubmit();
    const onSubmitted = vi.fn();
    render(<PassengerReviewCard trip={trip} passengerOtp="otp-987" onSubmitted={onSubmitted} />);
    fireEvent.click(screen.getByRole('radio', { name: /3 stars/i }));
    fireEvent.change(screen.getByLabelText(/comment/i), { target: { value: 'Smooth ride.' } });
    fireEvent.click(screen.getByRole('button', { name: /submit review/i }));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        tripId: 'trip-x',
        passengerOtp: 'otp-987',
        score: 3,
        comment: 'Smooth ride.',
        tagIds: undefined,
      }),
    );
    expect(onSubmitted).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalled();
  });

  it('treats a 409 (already submitted) as a soft success and calls onSubmitted', async () => {
    setSubmit({ mutateAsync: vi.fn().mockRejectedValue(new ApiError('exists', 409)) });
    const onSubmitted = vi.fn();
    render(<PassengerReviewCard trip={trip} passengerOtp="x" onSubmitted={onSubmitted} />);
    fireEvent.click(screen.getByRole('button', { name: /submit review/i }));
    await waitFor(() => expect(toast.info).toHaveBeenCalled());
    expect(onSubmitted).toHaveBeenCalled();
  });

  it('surfaces a friendly error toast when the OTP fails to match (403)', async () => {
    setSubmit({ mutateAsync: vi.fn().mockRejectedValue(new ApiError('OTP does not match', 403)) });
    render(<PassengerReviewCard trip={trip} passengerOtp="wrong" />);
    fireEvent.click(screen.getByRole('button', { name: /submit review/i }));
    await waitFor(() =>
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith(expect.stringMatching(/otp doesn.t match/i)),
    );
  });
});
