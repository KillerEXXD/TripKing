import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { Trip, User } from '@/types';

vi.mock('@/hooks/useTrips', () => ({
  useTrip: vi.fn(),
  useCompleteTrip: vi.fn(),
  useEndOdoUploadUrl: vi.fn(() => ({
    mutateAsync: vi.fn().mockResolvedValue({ bucket: 'trip-executions-photos', path: 't1/end_odo', signedUrl: 'https://x', token: 'tok' }),
    isPending: false,
  })),
}));
import { useTrip, useCompleteTrip } from '@/hooks/useTrips';
vi.mock('@/hooks/useReviews', () => ({ useCreateReview: vi.fn() }));
import { useCreateReview } from '@/hooks/useReviews';
vi.mock('@/hooks/useAdminConfig', () => ({ useReviewTagsByCategory: vi.fn(() => ({ data: [] })) }));
vi.mock('@/hooks/useDrivers', () => ({ useMyDriver: vi.fn() }));
import { useMyDriver } from '@/hooks/useDrivers';
vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }));
import { useAuth } from '@/contexts/AuthContext';
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
import { CompleteTripPage } from '@/pages/CompleteTripPage';

vi.mock('@/components/form', async () => {
  const actual = await vi.importActual<typeof import('@/components/form')>('@/components/form');
  return {
    ...actual,
    FileUpload: ({ label, onUploaded }: { label: string; onUploaded: (path: string) => void }) => (
      <button type="button" onClick={() => onUploaded('t1/end_odo')}>{`mock-upload:${label}`}</button>
    ),
  };
});

const driver: User = { id: 'u1', role: 'driver', phone: '+91', displayName: 'D', preferredLanguage: 'en', isActive: true, canReportBugs: false };
const city = (id: string, name: string) => ({ id, name, state: 'TN', lat: 12, lng: 80, sortOrder: 0, isActive: true });
function makeTrip(over: Partial<Trip> = {}): Trip {
  return {
    id: 't1', postedByUserId: 'u9', postedByRole: 'trip_manager', postedByName: 'A', postedByHandle: 'A1B2',
    fromCity: city('c1', 'V'), toCity: city('c2', 'C'), pickupAt: '2099-06-01T09:00:00.000Z',
    expectedDistanceKm: 100, carTypeId: 'ct1', seatsRequired: 4, acRequired: true, ratePerKm: 14,
    totalFare: 1400, commissionPct: 10, gstAmount: 50, driverBata: 200, extrasPaidByPassenger: true,
    driverPayout: 1410, passengerName: 'P', passengerPhone: '+91', passengerCount: 2,
    status: 'in_progress', showFareToPassenger: true, hidePassengerPhone: false, applicantCount: 0,
    pendingInvitationCount: 0, createdAt: '2099-05-30T00:00:00.000Z', acceptanceWindowMinutes: 15,
    assignedDriverId: 'd1',
    ...over,
  } as Trip;
}

let completeMutate: ReturnType<typeof vi.fn>;
let reviewMutate: ReturnType<typeof vi.fn>;
function setUp(trip = makeTrip()) {
  completeMutate = vi.fn().mockResolvedValue({});
  reviewMutate = vi.fn().mockResolvedValue({});
  vi.mocked(useTrip).mockReturnValue({ isPending: false, isError: false, data: trip, refetch: vi.fn() } as never);
  vi.mocked(useCompleteTrip).mockReturnValue({ mutateAsync: completeMutate, isPending: false } as never);
  vi.mocked(useCreateReview).mockReturnValue({ mutateAsync: reviewMutate, isPending: false } as never);
  vi.mocked(useMyDriver).mockReturnValue({ isPending: false, isError: false, data: { id: 'd1' }, refetch: vi.fn() } as never);
  vi.mocked(useAuth).mockReturnValue({ user: driver, isAuthenticated: true, isLoading: false, requestOtp: vi.fn(), verifyOtp: vi.fn(), logout: vi.fn() } as never);
}
function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/trips/t1/complete']}>
      <Routes>
        <Route path="/trips/:id/complete" element={<CompleteTripPage />} />
        <Route path="/my-trips" element={<div data-testid="my-trips">my trips</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CompleteTripPage', () => {
  beforeEach(() => {
    vi.mocked(useTrip).mockReset();
    vi.mocked(useCompleteTrip).mockReset();
    vi.mocked(useCreateReview).mockReset();
    vi.mocked(useMyDriver).mockReset();
    vi.mocked(useAuth).mockReset();
  });

  it('renders step 1 of 2 with the payout preview, advances to step 2 only after photo + reading are set', () => {
    setUp();
    renderPage();
    expect(screen.getByText(/step 1 of 2/i)).toBeInTheDocument();
    expect(screen.getByText(/payout preview/i)).toBeInTheDocument();
    expect(screen.getByText(/original payout/i)).toBeInTheDocument();
    // Next is disabled until photo + reading
    const next = screen.getByRole('button', { name: /next/i });
    expect(next).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /mock-upload:ending odometer photo/i }));
    fireEvent.change(screen.getByLabelText(/end odometer reading/i), { target: { value: '50125' } });
    expect(screen.getByRole('button', { name: /next/i })).not.toBeDisabled();
  });

  it('the live preview shows extra-KM fare and toll line when applicable', () => {
    setUp();
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /mock-upload:ending odometer photo/i }));
    // Without start odo on the Trip type, the preview shows extra = 0; once Phase 6 exposes it
    // we can sharpen this assertion. For now check the toll-line behaviour.
    fireEvent.change(screen.getByLabelText(/toll paid by you/i), { target: { value: '75' } });
    expect(screen.getByText(/toll reimbursement/i)).toBeInTheDocument();
    expect(screen.getByText(/\+ ₹75/i)).toBeInTheDocument();
  });

  it('the "Complete trip" button fires completeTrip with the captured fields and navigates to /my-trips', async () => {
    setUp();
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /mock-upload:ending odometer photo/i }));
    fireEvent.change(screen.getByLabelText(/end odometer reading/i), { target: { value: '50125' } });
    fireEvent.change(screen.getByLabelText(/toll paid by you/i), { target: { value: '75' } });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    // Step 2 — leave the review blank but add a private note.
    fireEvent.change(screen.getByLabelText(/private note to the agent/i), { target: { value: 'Pays on time' } });
    fireEvent.click(screen.getByRole('button', { name: /complete trip/i }));
    await waitFor(() => expect(completeMutate).toHaveBeenCalledWith({
      tripId: 't1',
      input: { endOdoUrl: 't1/end_odo', endOdoReading: 50125, tollPaidByDriver: 75, driverReviewNote: 'Pays on time' },
    }));
    // No rating → no review create call.
    expect(reviewMutate).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('my-trips')).toBeInTheDocument());
  });

  it('blocks non-assigned drivers with an error state', () => {
    setUp(makeTrip({ assignedDriverId: 'other-driver' }));
    renderPage();
    expect(screen.getByText(/this trip can't be completed from here/i)).toBeInTheDocument();
  });
});
