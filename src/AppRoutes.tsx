import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { AdminRoute } from '@/components/auth/AdminRoute';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoadingSkeleton } from '@/components/feedback';

const SignInPage = lazy(() => import('@/pages/SignInPage'));
const OnboardingPage = lazy(() => import('@/pages/OnboardingPage'));
const HomePage = lazy(() => import('@/pages/HomePage'));
const TripFeedPage = lazy(() => import('@/pages/TripFeedPage'));
const PostTripPage = lazy(() => import('@/pages/PostTripPage'));
const PostedTripsPage = lazy(() => import('@/pages/PostedTripsPage'));
const TripDetailPage = lazy(() => import('@/pages/TripDetailPage'));
const ApplicantReviewPage = lazy(() => import('@/pages/ApplicantReviewPage'));
const DriverProfilePage = lazy(() => import('@/pages/DriverProfilePage'));
const VacanciesPage = lazy(() => import('@/pages/VacanciesPage'));
const PostVacancyPage = lazy(() => import('@/pages/PostVacancyPage'));
const AlertsPage = lazy(() => import('@/pages/AlertsPage'));
const CreateAlertPage = lazy(() => import('@/pages/CreateAlertPage'));
const AlertDetailPage = lazy(() => import('@/pages/AlertDetailPage'));
const NotificationsPage = lazy(() => import('@/pages/NotificationsPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));
const AdministrationPage = lazy(() => import('@/pages/administration/AdministrationPage'));
const AdminConfigPage = lazy(() => import('@/pages/administration/AdminConfigPage'));
const KycReviewPage = lazy(() => import('@/pages/administration/KycReviewPage'));
// Public marketing pages — no auth, no app layout.
const WebsitePage = lazy(() => import('@/pages/WebsitePage'));
const ForAgentsPage = lazy(() => import('@/pages/ForAgentsPage'));

function PageFallback() {
  return (
    <div className="p-8">
      <LoadingSkeleton rows={5} />
    </div>
  );
}

export function AppRoutes() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/signin" element={<SignInPage />} />
        {/* Public marketing pages */}
        <Route path="/website" element={<WebsitePage />} />
        <Route path="/for-agents" element={<ForAgentsPage />} />
        {/* Post-sign-in onboarding/KYC — auth required, but full-screen (no app shell). */}
        <Route path="/onboarding" element={<ProtectedRoute><OnboardingPage /></ProtectedRoute>} />
        <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route path="/" element={<HomePage />} />
          <Route path="/trips" element={<TripFeedPage />} />
          <Route path="/trips/new" element={<PostTripPage />} />
          <Route path="/trips/:id" element={<TripDetailPage />} />
          <Route path="/trips/:id/applicants" element={<ApplicantReviewPage />} />
          <Route path="/posted-trips" element={<PostedTripsPage />} />
          <Route path="/drivers/:id" element={<DriverProfilePage />} />
          <Route path="/vacancies" element={<VacanciesPage />} />
          <Route path="/vacancies/new" element={<PostVacancyPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/alerts/new" element={<CreateAlertPage />} />
          <Route path="/alerts/:id" element={<AlertDetailPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/administration" element={<AdminRoute><AdministrationPage /></AdminRoute>} />
          <Route path="/administration/config" element={<AdminRoute><AdminConfigPage /></AdminRoute>} />
          <Route path="/administration/kyc" element={<AdminRoute><KycReviewPage /></AdminRoute>} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}

export default AppRoutes;
