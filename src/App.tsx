import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
} from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

import { LanguageProvider } from '@/contexts/LanguageContext';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';

// Feature screens — see src/features/<feature>/
import { SplashPage } from '@/features/auth/SplashPage';
import { AuthPage } from '@/features/auth/AuthPage';
import { OnboardingPage } from '@/features/auth/OnboardingPage';
import { DriverHomePage } from '@/features/home/DriverHomePage';
import { TripFeedPage } from '@/features/trips/TripFeedPage';
import { TripDetailPage } from '@/features/trips/TripDetailPage';
import { PostTripPage } from '@/features/trips/PostTripPage';
import { PostVacancyPage } from '@/features/vacancies/PostVacancyPage';
import { VacanciesPage } from '@/features/vacancies/VacanciesPage';
import { PostedTripsPage } from '@/features/manage-trips/PostedTripsPage';
import { ApplicantReviewPage } from '@/features/manage-trips/ApplicantReviewPage';
import { MyActivityPage } from '@/features/my-activity/MyActivityPage';
import { AssignedTripDetailPage } from '@/features/assigned-trips/AssignedTripDetailPage';
import { AlertsPage } from '@/features/alerts/AlertsPage';
import { CreateAlertPage } from '@/features/alerts/CreateAlertPage';
import { AlertDetailPage } from '@/features/alerts/AlertDetailPage';
import { ProfilePage } from '@/features/profile/ProfilePage';
import { DriverProfilePage } from '@/features/profile/DriverProfilePage';
import { PassengerPage } from '@/features/passenger/PassengerPage';
import { AdminDashboardPage } from '@/features/admin/AdminDashboardPage';
import { AdminKycQueuePage } from '@/features/admin/AdminKycQueuePage';
import { AdminDriversPage } from '@/features/admin/AdminDriversPage';
import { AdminVehicleEligibilityPage } from '@/features/admin/AdminVehicleEligibilityPage';
import { AdminTranslationManagerPage } from '@/features/admin/AdminTranslationManagerPage';
import { ForAgentsPage } from '@/features/marketing/ForAgentsPage';
import { WebsitePage } from '@/features/marketing/WebsitePage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

/** Gate for the registered-account area. Sends unregistered visitors back
 *  to the splash, where they can start the phone-OTP flow. */
function RequireAuth() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Outlet /> : <Navigate to="/" replace />;
}

/** Root: a returning (already-registered) device skips the splash entirely
 *  and lands on the home hub. The account persists in localStorage, so this
 *  is per-device — no need to register again until the user signs out. */
function RootLanding() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Navigate to="/home" replace /> : <SplashPage />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              {/* Public */}
              <Route path="/" element={<RootLanding />} />
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/login" element={<Navigate to="/auth" replace />} />
              <Route path="/passenger" element={<PassengerPage />} />
              <Route path="/for-agents" element={<ForAgentsPage />} />
              <Route path="/website" element={<WebsitePage />} />

              {/* Registered account — one user, every capability */}
              <Route element={<RequireAuth />}>
                <Route path="/welcome" element={<OnboardingPage />} />
                <Route path="/home" element={<DriverHomePage />} />

                {/* Legacy role-home paths → unified hub */}
                <Route path="/driver" element={<Navigate to="/home" replace />} />
                <Route path="/manager" element={<Navigate to="/home" replace />} />

                {/* Trips */}
                <Route path="/driver/trips" element={<TripFeedPage />} />
                <Route path="/driver/trips/:tripId" element={<TripDetailPage />} />

                {/* Post / manage */}
                <Route path="/driver/post-vacancy" element={<PostVacancyPage />} />
                <Route path="/driver/post-trip" element={<PostTripPage />} />
                <Route path="/manager/post-trip" element={<PostTripPage />} />
                <Route path="/manager/posted-trips" element={<PostedTripsPage />} />
                <Route
                  path="/manager/posted-trips/:tripId/applicants"
                  element={<ApplicantReviewPage />}
                />

                {/* "My Trips" — one tabbed page (Trips / Applications / Vacancies) */}
                <Route path="/driver/my-trips" element={<MyActivityPage />} />
                <Route path="/driver/my-applications" element={<Navigate to="/driver/my-trips?tab=applications" replace />} />
                <Route path="/driver/my-vacancies" element={<Navigate to="/driver/my-trips?tab=vacancies" replace />} />
                <Route
                  path="/driver/my-trips/:tripId"
                  element={<AssignedTripDetailPage />}
                />

                {/* Vacant flow */}
                <Route path="/driver/vacancies" element={<VacanciesPage role="driver" />} />
                <Route path="/manager/find-driver" element={<VacanciesPage role="manager" />} />

                {/* Alerts */}
                <Route path="/driver/alerts" element={<AlertsPage />} />
                <Route path="/driver/alerts/new" element={<CreateAlertPage />} />
                <Route path="/driver/alerts/:alertId" element={<AlertDetailPage />} />

                {/* Profile */}
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/driver/profile" element={<Navigate to="/profile" replace />} />
                <Route path="/manager/profile" element={<Navigate to="/profile" replace />} />
                <Route path="/drivers/:driverId" element={<DriverProfilePage />} />

                {/* Administration — a separate area, used only by admins */}
                <Route path="/administration" element={<AdminDashboardPage />} />
                <Route path="/admin" element={<Navigate to="/administration" replace />} />
                <Route path="/administration/kyc" element={<AdminKycQueuePage />} />
                <Route path="/administration/drivers" element={<AdminDriversPage />} />
                <Route path="/administration/vehicles" element={<AdminVehicleEligibilityPage />} />
                <Route
                  path="/administration/translations"
                  element={<AdminTranslationManagerPage />}
                />
                {/* Legacy /admin/* → /administration/* */}
                <Route path="/admin/kyc" element={<Navigate to="/administration/kyc" replace />} />
                <Route path="/admin/drivers" element={<Navigate to="/administration/drivers" replace />} />
                <Route path="/admin/vehicles" element={<Navigate to="/administration/vehicles" replace />} />
                <Route path="/admin/translations" element={<Navigate to="/administration/translations" replace />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </LanguageProvider>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
