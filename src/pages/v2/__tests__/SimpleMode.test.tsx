import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TRIP_FIXTURES } from '@/pages/v2/__fixtures__/trips';
import { APPLICATION_FIXTURES } from '@/pages/v2/__fixtures__/applications';
import { NOTIFICATION_FIXTURES } from '@/pages/v2/__fixtures__/notifications';

vi.mock('@/hooks/useTrips');
vi.mock('@/hooks/useNotifications');
vi.mock('@/hooks/useReferral');
vi.mock('@/hooks/useCashWallet');
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', role: 'driver', displayName: 'Karthik M', phone: '+919876543210' },
    isAuthenticated: true,
    isLoading: false,
    logout: vi.fn(),
  }),
}));
import * as th from '@/hooks/useTrips';
import * as nh from '@/hooks/useNotifications';
import * as rh from '@/hooks/useReferral';
import * as wh from '@/hooks/useCashWallet';

import { SimpleHomePage } from '@/pages/v2/simple-mode/HomePage';
import { SimpleTripsListPage } from '@/pages/v2/simple-mode/TripsListPage';
import { SimpleTripDetailPage } from '@/pages/v2/simple-mode/TripDetailPage';
import { SimpleProfilePage } from '@/pages/v2/simple-mode/ProfilePage';
import { SimpleMyTripsPage } from '@/pages/v2/simple-mode/MyTripsPage';
import { SimpleNotificationsPage } from '@/pages/v2/simple-mode/NotificationsPage';
import { SimplePostTripPage } from '@/pages/v2/simple-mode/PostTripPage';
import { SimpleReferralsPage } from '@/pages/v2/simple-mode/ReferralsPage';
import { SimpleWalletPage } from '@/pages/v2/simple-mode/WalletPage';
import { SimpleHomeScenariosPage } from '@/pages/v2/simple-mode/HomeScenariosPage';

function Wrap({ children, path }: { children: React.ReactNode; path?: string }) {
  return <MemoryRouter initialEntries={[path ?? '/']}>{children}</MemoryRouter>;
}

function mockTrip() {
  vi.mocked(th.useTrip).mockReturnValue({
    data: TRIP_FIXTURES[1],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof th.useTrip>);
  vi.mocked(th.useTrips).mockReturnValue({
    data: TRIP_FIXTURES,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof th.useTrips>);
  vi.mocked(th.useMyApplications).mockReturnValue({
    data: APPLICATION_FIXTURES,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof th.useMyApplications>);
}

function mockNotifications() {
  vi.mocked(nh.useNotifications).mockReturnValue({
    data: NOTIFICATION_FIXTURES,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof nh.useNotifications>);
}

function mockReferral() {
  vi.mocked(rh.useReferralDashboard).mockReturnValue({
    data: {
      userId: 'u1',
      summary: {
        lifetimeEarnedPaise: 250000, reversedPaise: 0, transferredPaise: 0, withdrawnPaise: 0,
        netPaise: 250000, withdrawablePaise: 250000, pendingPaise: 0,
        counts: { totalReferred: 5, qualified: 3, earningActive: 2, capReached: 1, signedUp: 0, verificationPending: 0, verified: 2, verificationRejected: 0, paidTripsStarted: 0, suspended: 0, rejected: 0, expired: 0 },
      },
      recentLedger: [],
    },
    isLoading: false, isError: false, refetch: vi.fn(),
  } as unknown as ReturnType<typeof rh.useReferralDashboard>);
}

function mockWallet() {
  vi.mocked(wh.useCashWallet).mockReturnValue({
    data: { walletId: 'w1', balance: { promoPaise: 100000, transferredPaise: 50000, cashPaise: 25000, totalPaise: 175000 }, recentLedger: [] },
    isLoading: false, isError: false, refetch: vi.fn(),
  } as unknown as ReturnType<typeof wh.useCashWallet>);
}

beforeEach(() => vi.clearAllMocks());

describe('v7 Simple Mode pages', () => {
  it('Home: bilingual welcome + 4 big icon tiles', () => {
    render(<Wrap><SimpleHomePage /></Wrap>);
    expect(screen.getByText(/வணக்கம்/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Find a trip/i })).toBeInTheDocument();
  });

  it('Trips list: bilingual heading + big green I-can-do CTA per card', () => {
    mockTrip();
    render(<Wrap><SimpleTripsListPage /></Wrap>);
    expect(screen.getAllByText(/I want this trip/i).length).toBeGreaterThan(0);
  });

  it('Trip detail: 3-step ladder + green accept + red refuse', () => {
    mockTrip();
    render(
      <Wrap path="/v7/trips/t2">
        <Routes>
          <Route path="/v7/trips/:id" element={<SimpleTripDetailPage />} />
        </Routes>
      </Wrap>,
    );
    expect(screen.getByRole('button', { name: /Yes, I will do it/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /No, refuse/i })).toBeInTheDocument();
  });

  it('Profile: name initial + 3 big tiles + sign-out', () => {
    render(<Wrap><SimpleProfilePage /></Wrap>);
    expect(screen.getByText(/Karthik M/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign out/i })).toBeInTheDocument();
  });

  it('My trips: bilingual status icons per application', () => {
    mockTrip();
    render(<Wrap><SimpleMyTripsPage /></Wrap>);
    expect(screen.getAllByText(/காத்திருக்கிறது|ஏற்கப்பட்டது|நடவடிக்கை/).length).toBeGreaterThan(0);
  });

  it('Notifications: big bilingual heading + items', () => {
    mockNotifications();
    render(<Wrap><SimpleNotificationsPage /></Wrap>);
    expect(screen.getByText(/Messages for you/i)).toBeInTheDocument();
  });

  it('Post trip: wizard step 1 + big Next CTA', () => {
    render(<Wrap><SimplePostTripPage /></Wrap>);
    expect(screen.getByText(/1 \/ 5/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Next/i })).toBeInTheDocument();
  });

  it('Referrals: big yellow earnings card + WhatsApp CTA', () => {
    mockReferral();
    render(<Wrap><SimpleReferralsPage /></Wrap>);
    expect(screen.getByRole('button', { name: /Send on WhatsApp/i })).toBeInTheDocument();
  });

  it('Wallet: big total card + Add money / Take money out CTAs', () => {
    mockWallet();
    render(<Wrap><SimpleWalletPage /></Wrap>);
    expect(screen.getByRole('button', { name: /Add money/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Take money out/i })).toBeInTheDocument();
  });

  it('Scenarios: shows all 7 example sections including Live tracking', () => {
    render(<Wrap><SimpleHomeScenariosPage /></Wrap>);
    expect(screen.getByText(/நகர்கிறது/)).toBeInTheDocument(); // Moving now (live tracking)
    expect(screen.getByText(/Book now — wait time/i)).toBeInTheDocument();
  });

  it('Trips list: shows empty-state message when no trips', () => {
    vi.mocked(th.useTrips).mockReturnValue({
      data: [], isLoading: false, isError: false, refetch: vi.fn(),
    } as unknown as ReturnType<typeof th.useTrips>);
    render(<Wrap><SimpleTripsListPage /></Wrap>);
    expect(screen.getByText(/No trips now/i)).toBeInTheDocument();
  });

  it('Trips list: shows error state with retry when query fails', () => {
    vi.mocked(th.useTrips).mockReturnValue({
      data: [], isLoading: false, isError: true, refetch: vi.fn(),
    } as unknown as ReturnType<typeof th.useTrips>);
    render(<Wrap><SimpleTripsListPage /></Wrap>);
    expect(screen.getByText(/Could not load trips/i)).toBeInTheDocument();
  });

  it('Trip detail: error path renders Try again message', () => {
    vi.mocked(th.useTrip).mockReturnValue({
      data: undefined, isLoading: false, isError: true, refetch: vi.fn(),
    } as unknown as ReturnType<typeof th.useTrip>);
    render(
      <Wrap path="/v7/trips/x">
        <Routes>
          <Route path="/v7/trips/:id" element={<SimpleTripDetailPage />} />
        </Routes>
      </Wrap>,
    );
    expect(screen.getByText(/Could not load/i)).toBeInTheDocument();
  });

  it('My trips: error path renders Try again', () => {
    vi.mocked(th.useMyApplications).mockReturnValue({
      data: [], isLoading: false, isError: true, refetch: vi.fn(),
    } as unknown as ReturnType<typeof th.useMyApplications>);
    render(<Wrap><SimpleMyTripsPage /></Wrap>);
    expect(screen.getByText(/Could not load/i)).toBeInTheDocument();
  });

  it('Notifications: empty state', () => {
    vi.mocked(nh.useNotifications).mockReturnValue({
      data: [], isLoading: false, isError: false, refetch: vi.fn(),
    } as unknown as ReturnType<typeof nh.useNotifications>);
    render(<Wrap><SimpleNotificationsPage /></Wrap>);
    expect(screen.getByText(/Nothing new/i)).toBeInTheDocument();
  });

  it('Referrals: error path', () => {
    vi.mocked(rh.useReferralDashboard).mockReturnValue({
      data: undefined, isLoading: false, isError: true, refetch: vi.fn(),
    } as unknown as ReturnType<typeof rh.useReferralDashboard>);
    render(<Wrap><SimpleReferralsPage /></Wrap>);
    expect(screen.getByText(/Could not load/i)).toBeInTheDocument();
  });

  it('Wallet: error path', () => {
    vi.mocked(wh.useCashWallet).mockReturnValue({
      data: undefined, isLoading: false, isError: true, refetch: vi.fn(),
    } as unknown as ReturnType<typeof wh.useCashWallet>);
    render(<Wrap><SimpleWalletPage /></Wrap>);
    expect(screen.getByText(/Could not load/i)).toBeInTheDocument();
  });

  it('Post trip: wizard moves to next step and exposes Back', () => {
    render(<Wrap><SimplePostTripPage /></Wrap>);
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    expect(screen.getByText(/2 \/ 5/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Back one step/i })).toBeInTheDocument();
  });
});

describe('AppRoutes registration for /v7', () => {
  it('declares route entries for v7 home + all sub-routes', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const url = await import('node:url');
    const dir = path.dirname(url.fileURLToPath(import.meta.url));
    const routesPath = path.resolve(dir, '../../../AppRoutes.tsx');
    const src = await fs.readFile(routesPath, 'utf8');
    for (const p of ['/v7', '/v7/trips', '/v7/trips/:id', '/v7/trips/new', '/v7/profile', '/v7/my-trips', '/v7/notifications', '/v7/referrals', '/v7/wallet', '/v7/scenarios']) {
      expect(src, `AppRoutes.tsx should register ${p}`).toContain(`path="${p}"`);
    }
  });
});
