import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AwaitingDecisionPage } from '@/pages/AwaitingDecisionPage';
import type { MyApplication, Trip } from '@/types';

vi.mock('@/hooks/useTrips', () => ({ useMyApplications: vi.fn() }));
import { useMyApplications } from '@/hooks/useTrips';

const city = (id: string, name: string) => ({ id, name, state: 'TN', lat: 12.9, lng: 79.1, sortOrder: 1, isActive: true });
function makeTrip(over: Partial<Trip> = {}): Trip {
  return { id: 't1', postedByUserId: 'u1', postedByRole: 'trip_manager', postedByName: 'Agent', postedByHandle: 'A1B2C3D', fromCity: city('c1', 'Vellore'), toCity: city('c2', 'Chennai'), pickupAt: '2099-06-01T09:00:00Z', expectedDistanceKm: 140, carTypeId: 'ct1', seatsRequired: 4, acRequired: true, ratePerKm: 14, totalFare: 1960, commissionPct: 10, gstAmount: 98, driverBata: 300, extrasPaidByPassenger: true, driverPayout: 2200, passengerName: 'P', passengerPhone: '+91', passengerCount: 2, status: 'selected', showFareToPassenger: true, hidePassengerPhone: false, applicantCount: 0, pendingInvitationCount: 0, createdAt: '2099-05-30T00:00:00Z', acceptanceWindowMinutes: 15, ...over };
}
function makeApp(over: Partial<MyApplication> = {}): MyApplication {
  return { acceptanceId: 'acc-1', status: 'selected', appliedAt: '2099-05-30T00:00:00Z', trip: makeTrip(), ...over };
}
type QS = { isPending?: boolean; isError?: boolean; data?: unknown; refetch?: () => void };
function setApps(s: QS = {}) {
  vi.mocked(useMyApplications).mockReturnValue({ isPending: false, isError: false, data: [], refetch: vi.fn(), ...s } as never);
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/my-trips/awaiting']}>
      <Routes>
        <Route path="/my-trips/awaiting" element={<AwaitingDecisionPage />} />
        <Route path="/" element={<div>home page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AwaitingDecisionPage', () => {
  beforeEach(() => vi.mocked(useMyApplications).mockReset());

  it('lists selected applications and links each to the trip detail with ?from=/my-trips/awaiting', () => {
    setApps({ data: [makeApp({ acceptanceId: 'a1', trip: makeTrip({ id: 'trip-1' }) })] });
    renderPage();
    const link = screen.getByRole('link', { name: /Vellore → Chennai/i });
    expect(link).toHaveAttribute('href', '/trips/trip-1?from=/my-trips/awaiting');
  });

  it('filters out non-selected statuses', () => {
    setApps({ data: [makeApp({ status: 'applied' }), makeApp({ acceptanceId: 'a2', status: 'rejected' })] });
    renderPage();
    expect(screen.getByText(/no selections waiting/i)).toBeInTheDocument();
  });

  it('back button goes to Home', () => {
    setApps({ data: [makeApp()] });
    renderPage();
    // ScopedPageHeader renders the back arrow as a <Link aria-label="Back">.
    fireEvent.click(screen.getByRole('link', { name: /back/i }));
    expect(screen.getByText('home page')).toBeInTheDocument();
  });

  it('shows an empty state on initial-empty load (no auto-redirect)', () => {
    setApps({ data: [] });
    renderPage();
    expect(screen.getByText(/no selections waiting/i)).toBeInTheDocument();
  });
});
