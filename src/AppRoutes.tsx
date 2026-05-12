import { Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import * as Sentry from '@sentry/react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { AdminRoute } from '@/components/auth/AdminRoute';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoadingSkeleton, RouteErrorBoundary } from '@/components/feedback';
import { lazyWithRetry } from '@/lib/lazyWithRetry';

const SignInPage = lazyWithRetry(() => import('@/pages/SignInPage'));
const OnboardingPage = lazyWithRetry(() => import('@/pages/OnboardingPage'));
const HomeForRole = lazyWithRetry(() => import('@/pages/HomeForRole'));
const TripFeedPage = lazyWithRetry(() => import('@/pages/TripFeedPage'));
const PostTripPage = lazyWithRetry(() => import('@/pages/PostTripPage'));
const PostedTripsPage = lazyWithRetry(() => import('@/pages/PostedTripsPage'));
const TripDetailPage = lazyWithRetry(() => import('@/pages/TripDetailPage'));
const ApplicantReviewPage = lazyWithRetry(() => import('@/pages/ApplicantReviewPage'));
const DriverProfilePage = lazyWithRetry(() => import('@/pages/DriverProfilePage'));
const ProfilePage = lazyWithRetry(() => import('@/pages/ProfilePage'));
const AgentAnalyticsPage = lazyWithRetry(() => import('@/pages/AgentAnalyticsPage'));
const VerifyDocumentsPage = lazyWithRetry(() => import('@/pages/VerifyDocumentsPage'));
const VehicleFormPage = lazyWithRetry(() => import('@/pages/VehicleFormPage'));
const VehiclePhotosPage = lazyWithRetry(() => import('@/pages/VehiclePhotosPage'));
const BookVideoCallPage = lazyWithRetry(() => import('@/pages/BookVideoCallPage'));
const VacanciesPage = lazyWithRetry(() => import('@/pages/VacanciesPage'));
const PostVacancyPage = lazyWithRetry(() => import('@/pages/PostVacancyPage'));
const AlertsPage = lazyWithRetry(() => import('@/pages/AlertsPage'));
const CreateAlertPage = lazyWithRetry(() => import('@/pages/CreateAlertPage'));
const AlertDetailPage = lazyWithRetry(() => import('@/pages/AlertDetailPage'));
const NotificationsPage = lazyWithRetry(() => import('@/pages/NotificationsPage'));
const NotFoundPage = lazyWithRetry(() => import('@/pages/NotFoundPage'));
const AdministrationPage = lazyWithRetry(() => import('@/pages/administration/AdministrationPage'));
const AdminConfigPage = lazyWithRetry(() => import('@/pages/administration/AdminConfigPage'));
const KycReviewPage = lazyWithRetry(() => import('@/pages/administration/KycReviewPage'));
const VideoCallConsolePage = lazyWithRetry(() => import('@/pages/administration/VideoCallConsolePage'));
const VehicleEligibilityPage = lazyWithRetry(() => import('@/pages/administration/VehicleEligibilityPage'));
const ReviewModerationPage = lazyWithRetry(() => import('@/pages/administration/ReviewModerationPage'));
const TranslationManagerPage = lazyWithRetry(() => import('@/pages/administration/TranslationManagerPage'));
const AdminDashboardPage = lazyWithRetry(() => import('@/pages/administration/AdminDashboardPage'));
// Public marketing pages — no auth, no app layout.
const WebsitePage = lazyWithRetry(() => import('@/pages/WebsitePage'));
const ForAgentsPage = lazyWithRetry(() => import('@/pages/ForAgentsPage'));
// Public passenger portal — the trip OTP is the credential, no login.
const PassengerPage = lazyWithRetry(() => import('@/pages/PassengerPage'));

function PageFallback() {
  return (
    <div className="p-8">
      <LoadingSkeleton rows={5} />
    </div>
  );
}

/** `<Routes>` wrapped with Sentry's React-Router-v7 instrumentation (route-level transactions / pageload spans). */
const SentryRoutes = Sentry.withSentryReactRouterV7Routing(Routes);

export function AppRoutes() {
  return (
    <RouteErrorBoundary>
      <Suspense fallback={<PageFallback />}>
        <SentryRoutes>
          <Route path="/signin" element={<SignInPage />} />
          {/* Public marketing pages */}
          <Route path="/website" element={<WebsitePage />} />
          <Route path="/for-agents" element={<ForAgentsPage />} />
          {/* Public passenger portal — OTP is the credential */}
          <Route path="/passenger" element={<PassengerPage />} />
          <Route path="/passenger/:otp" element={<PassengerPage />} />
          {/* Post-sign-in onboarding/KYC — auth required, but full-screen (no app shell). */}
          <Route path="/onboarding" element={<ProtectedRoute><OnboardingPage /></ProtectedRoute>} />
          <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route path="/" element={<HomeForRole />} />
            <Route path="/trips" element={<TripFeedPage />} />
            <Route path="/trips/new" element={<PostTripPage />} />
            <Route path="/trips/:id" element={<TripDetailPage />} />
            <Route path="/trips/:id/applicants" element={<ApplicantReviewPage />} />
            <Route path="/posted-trips" element={<PostedTripsPage />} />
            <Route path="/drivers/:id" element={<DriverProfilePage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/analytics" element={<AgentAnalyticsPage />} />
            <Route path="/verify/documents" element={<VerifyDocumentsPage />} />
            <Route path="/verify/video-call" element={<BookVideoCallPage />} />
            <Route path="/vehicles/new" element={<VehicleFormPage />} />
            <Route path="/vehicles/:id/edit" element={<VehicleFormPage />} />
            <Route path="/vehicles/:id/photos" element={<VehiclePhotosPage />} />
            <Route path="/vacancies" element={<VacanciesPage />} />
            <Route path="/vacancies/new" element={<PostVacancyPage />} />
            <Route path="/alerts" element={<AlertsPage />} />
            <Route path="/alerts/new" element={<CreateAlertPage />} />
            <Route path="/alerts/:id" element={<AlertDetailPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/administration" element={<AdminRoute><AdministrationPage /></AdminRoute>} />
            <Route path="/administration/dashboard" element={<AdminRoute><AdminDashboardPage /></AdminRoute>} />
            <Route path="/administration/config" element={<AdminRoute><AdminConfigPage /></AdminRoute>} />
            <Route path="/administration/kyc" element={<AdminRoute><KycReviewPage /></AdminRoute>} />
            <Route path="/administration/video-calls" element={<AdminRoute><VideoCallConsolePage /></AdminRoute>} />
            <Route path="/administration/vehicles" element={<AdminRoute><VehicleEligibilityPage /></AdminRoute>} />
            <Route path="/administration/reviews" element={<AdminRoute><ReviewModerationPage /></AdminRoute>} />
            <Route path="/administration/translations" element={<AdminRoute><TranslationManagerPage /></AdminRoute>} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </SentryRoutes>
      </Suspense>
    </RouteErrorBoundary>
  );
}

export default AppRoutes;
