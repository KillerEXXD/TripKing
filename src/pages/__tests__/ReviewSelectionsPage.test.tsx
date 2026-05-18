import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ReviewSelectionsPage } from '@/pages/ReviewSelectionsPage';
import type { MyApplication, Trip } from '@/types';

vi.mock('@/hooks/useTrips', () => ({ useMyApplications: vi.fn() }));
import { useMyApplications } from '@/hooks/useTrips';

const city = (id: string, name: string) => ({ id, name, state: 'TN', lat: 12.9, lng: 79.1, sortOrder: 1, isActive: true });
function makeTrip(over: Partial<Trip> = {}): Trip {
  return {
    id: 't1',
    postedByUserId: 'agent1',
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
    passengerName: 'P',
    passengerPhone: '+91',
    passengerCount: 2,
    status: 'selected',
    showFareToPassenger: true,
    hidePassengerPhone: false,
    applicantCount: 1,
    pendingInvitationCount: 0,
    createdAt: '2099-05-30T00:00:00.000Z',
    acceptanceWindowMinutes: 15,
    ...over,
  };
}
function makeApp(over: Partial<MyApplication> = {}): MyApplication {
  return { acceptanceId: 'acc1', status: 'selected', appliedAt: '2099-05-31T08:00:00.000Z', trip: makeTrip(), ...over };
}

function setData(data: MyApplication[]) {
  vi.mocked(useMyApplications).mockReturnValue({ isPending: false, isError: false, data, refetch: vi.fn() } as never);
}

function renderAt(state?: { from?: 'home' | 'my-trips' }) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/app/my-trips/review', state: state ?? null }]}>
      <Routes>
        <Route path="/app/my-trips/review" element={<ReviewSelectionsPage />} />
        <Route path="/" element={<div>home page</div>} />
        <Route path="/app/my-trips" element={<div>my trips page</div>} />
        <Route path="/app/trips/:id" element={<div>trip detail</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ReviewSelectionsPage', () => {
  beforeEach(() => vi.mocked(useMyApplications).mockReset());

  it('renders one card per selected application, filtering other statuses out', () => {
    setData([
      makeApp({ acceptanceId: 'a1' }),
      makeApp({ acceptanceId: 'a2', status: 'applied', trip: makeTrip({ id: 't2' }) }),
      makeApp({ acceptanceId: 'a3', trip: makeTrip({ id: 't3', fromCity: city('cx', 'Madurai'), toCity: city('cy', 'Salem') }) }),
    ]);
    renderAt();
    expect(screen.getAllByText(/selected — you got it/i)).toHaveLength(2);
    expect(screen.getByText(/madurai/i)).toBeInTheDocument();
  });

  it('shows the empty state when no trips await review', () => {
    setData([]);
    renderAt();
    expect(screen.getByText(/no trips to review/i)).toBeInTheDocument();
  });

  it('Back routes to / when state.from === "home"', () => {
    setData([]);
    renderAt({ from: 'home' });
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(screen.getByText('home page')).toBeInTheDocument();
  });

  it('Back routes to /my-trips when state.from === "my-trips"', () => {
    setData([]);
    renderAt({ from: 'my-trips' });
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(screen.getByText('my trips page')).toBeInTheDocument();
  });

  it('Back on a deep-link (no origin state) falls back to history (navigate(-1))', () => {
    setData([]);
    renderAt();
    // MemoryRouter starts at /my-trips/review with no prior entry; navigate(-1) is a no-op
    // and we should stay on the review page.
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(screen.getByRole('heading', { name: /trips to review/i })).toBeInTheDocument();
  });
});
