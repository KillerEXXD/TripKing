import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppRoutes } from '@/AppRoutes';
import type { User } from '@/types';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }));
import { useAuth } from '@/contexts/AuthContext';
// These pages' data hooks are exercised in their own tests — here we only check routing.
vi.mock('@/pages/OnboardingPage', () => ({ default: () => <div>onboarding screen</div> }));
vi.mock('@/pages/HomeForRole', () => ({ default: () => <div>home for role</div> }));
vi.mock('@/pages/TripFeedPage', () => ({ default: () => <div>trip feed</div> }));
vi.mock('@/pages/PostTripPage', () => ({ default: () => <div>post trip</div> }));
vi.mock('@/pages/PostedTripsPage', () => ({ default: () => <div>posted trips</div> }));
vi.mock('@/pages/TripDetailPage', () => ({ default: () => <div>trip detail</div> }));
vi.mock('@/pages/ApplicantReviewPage', () => ({ default: () => <div>applicant review</div> }));
vi.mock('@/pages/ReviewSelectionsPage', () => ({ default: () => <div>review selections page</div> }));
vi.mock('@/pages/DriverProfilePage', () => ({ default: () => <div>driver profile</div> }));
vi.mock('@/pages/ProfilePage', () => ({ default: () => <div>my profile page</div> }));
vi.mock('@/pages/VacanciesPage', () => ({ default: () => <div>vacancies page</div> }));
vi.mock('@/pages/PostVacancyPage', () => ({ default: () => <div>post vacancy page</div> }));
vi.mock('@/pages/AlertsPage', () => ({ default: () => <div>alerts page</div> }));
vi.mock('@/pages/CreateAlertPage', () => ({ default: () => <div>create alert page</div> }));
vi.mock('@/pages/AlertDetailPage', () => ({ default: () => <div>alert detail page</div> }));
vi.mock('@/pages/NotificationsPage', () => ({ default: () => <div>notifications page</div> }));
vi.mock('@/pages/administration/KycReviewPage', () => ({ default: () => <div>kyc review page</div> }));
vi.mock('@/pages/administration/VehicleEligibilityPage', () => ({ default: () => <div>vehicle eligibility page</div> }));
vi.mock('@/pages/administration/ReviewModerationPage', () => ({ default: () => <div>review moderation page</div> }));
vi.mock('@/pages/administration/TranslationManagerPage', () => ({ default: () => <div>translation manager page</div> }));

const admin: User = { id: 'a', role: 'admin', phone: '+91', displayName: 'Admin', preferredLanguage: 'en', isActive: true, canReportBugs: false };
const driver: User = { ...admin, id: 'd', role: 'driver', displayName: 'Driver' };

function setAuth(user: User | null, isLoading = false) {
  vi.mocked(useAuth).mockReturnValue({
    user,
    isAuthenticated: user !== null,
    isLoading,
    requestOtp: vi.fn(),
    verifyOtp: vi.fn(),
    logout: vi.fn(),
  });
}

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AppRoutes', () => {
  beforeEach(() => vi.mocked(useAuth).mockReset());

  it('/app/signin renders the sign-in page', async () => {
    setAuth(null);
    renderAt('/app/signin');
    expect(await screen.findByRole('button', { name: /send otp/i })).toBeInTheDocument();
  });

  it('/app redirects an anonymous user to /app/signin', async () => {
    setAuth(null);
    renderAt('/app');
    expect(await screen.findByRole('button', { name: /send otp/i })).toBeInTheDocument();
  });

  it('/app renders the role-aware home for a signed-in user', async () => {
    setAuth(driver);
    renderAt('/app');
    expect(await screen.findByText(/home for role/i)).toBeInTheDocument();
  });

  it('/app/onboarding renders the onboarding screen for a signed-in user', async () => {
    setAuth(driver);
    renderAt('/app/onboarding');
    expect(await screen.findByText(/onboarding screen/i)).toBeInTheDocument();
  });

  it('/app/onboarding redirects an anonymous user to /app/signin', async () => {
    setAuth(null);
    renderAt('/app/onboarding');
    expect(await screen.findByRole('button', { name: /send otp/i })).toBeInTheDocument();
  });

  it('/app/trips renders the trip feed for a signed-in user', async () => {
    setAuth(driver);
    renderAt('/app/trips');
    expect(await screen.findByText(/trip feed/i)).toBeInTheDocument();
  });

  it('/app/trips/new renders the post-trip page for a signed-in user', async () => {
    setAuth(driver);
    renderAt('/app/trips/new');
    expect(await screen.findByText(/post trip/i)).toBeInTheDocument();
  });

  it('/app/trips/:id renders the trip detail for a signed-in user', async () => {
    setAuth(driver);
    renderAt('/app/trips/abc123');
    expect(await screen.findByText(/trip detail/i)).toBeInTheDocument();
  });

  it('/app/trips/:id/applicants renders the applicant-review page for a signed-in user', async () => {
    setAuth(driver);
    renderAt('/app/trips/abc123/applicants');
    expect(await screen.findByText(/applicant review/i)).toBeInTheDocument();
  });

  it('/app/my-trips/review renders the review-selections page for a signed-in user', async () => {
    setAuth(driver);
    renderAt('/app/my-trips/review');
    expect(await screen.findByText(/review selections page/i)).toBeInTheDocument();
  });

  it('/app/posted-trips renders the posted-trips page for a signed-in user', async () => {
    setAuth(driver);
    renderAt('/app/posted-trips');
    expect(await screen.findByText(/posted trips/i)).toBeInTheDocument();
  });

  it('/app/drivers/:id renders the driver profile for a signed-in user', async () => {
    setAuth(driver);
    renderAt('/app/drivers/abc');
    expect(await screen.findByText(/driver profile/i)).toBeInTheDocument();
  });

  it('/app/profile renders the account page for a signed-in user', async () => {
    setAuth(driver);
    renderAt('/app/profile');
    expect(await screen.findByText(/my profile page/i)).toBeInTheDocument();
  });

  it('/app/vacancies renders the available-drivers feed for a signed-in user', async () => {
    setAuth(driver);
    renderAt('/app/vacancies');
    expect(await screen.findByText(/^vacancies page$/i)).toBeInTheDocument();
  });

  it('/app/vacancies/new renders the post-vacancy page for a signed-in user', async () => {
    setAuth(driver);
    renderAt('/app/vacancies/new');
    expect(await screen.findByText(/post vacancy page/i)).toBeInTheDocument();
  });

  it('/app/alerts renders the alerts list for a signed-in user', async () => {
    setAuth(driver);
    renderAt('/app/alerts');
    expect(await screen.findByText(/^alerts page$/i)).toBeInTheDocument();
  });

  it('/app/alerts/new renders the create-alert page for a signed-in user', async () => {
    setAuth(driver);
    renderAt('/app/alerts/new');
    expect(await screen.findByText(/create alert page/i)).toBeInTheDocument();
  });

  it('/app/alerts/:id renders the alert detail for a signed-in user', async () => {
    setAuth(driver);
    renderAt('/app/alerts/abc');
    expect(await screen.findByText(/alert detail page/i)).toBeInTheDocument();
  });

  it('/app/notifications renders the notifications page for a signed-in user', async () => {
    setAuth(driver);
    renderAt('/app/notifications');
    expect(await screen.findByText(/notifications page/i)).toBeInTheDocument();
  });

  it('/app/administration renders the admin hub for an admin', async () => {
    setAuth(admin);
    renderAt('/app/administration');
    expect(await screen.findByRole('heading', { name: /administration/i })).toBeInTheDocument();
  });

  it('/app/administration 403s a signed-in non-admin', async () => {
    setAuth(driver);
    renderAt('/app/administration');
    expect(await screen.findByText(/admins only/i)).toBeInTheDocument();
  });

  it('/app/administration/kyc renders the KYC review queue for an admin', async () => {
    setAuth(admin);
    renderAt('/app/administration/kyc');
    expect(await screen.findByText(/kyc review page/i)).toBeInTheDocument();
  });

  it('/app/administration/kyc 403s a signed-in non-admin', async () => {
    setAuth(driver);
    renderAt('/app/administration/kyc');
    expect(await screen.findByText(/admins only/i)).toBeInTheDocument();
  });

  it('/app/administration/vehicles renders the vehicle-eligibility dashboard for an admin', async () => {
    setAuth(admin);
    renderAt('/app/administration/vehicles');
    expect(await screen.findByText(/vehicle eligibility page/i)).toBeInTheDocument();
  });

  it('/app/administration/reviews renders the reviews-moderation queue for an admin', async () => {
    setAuth(admin);
    renderAt('/app/administration/reviews');
    expect(await screen.findByText(/review moderation page/i)).toBeInTheDocument();
  });

  it('/app/administration/translations renders the translation manager for an admin', async () => {
    setAuth(admin);
    renderAt('/app/administration/translations');
    expect(await screen.findByText(/translation manager page/i)).toBeInTheDocument();
  });

  it('an unknown path renders the 404 page', async () => {
    setAuth(driver);
    renderAt('/no/such/page');
    expect(await screen.findByText(/404/i)).toBeInTheDocument();
  });
});
