import { Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import * as Sentry from '@sentry/react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { AdminRoute } from '@/components/auth/AdminRoute';
import { AppLayout } from '@/components/layout/AppLayout';
import { V2LayoutShell } from '@/components/v2/shared/V2LayoutShell';
import { LoadingSkeleton, RouteErrorBoundary } from '@/components/feedback';
import { lazyWithRetry } from '@/lib/lazyWithRetry';

const SignInPage = lazyWithRetry(() => import('@/pages/SignInPage'));
const OnboardingPage = lazyWithRetry(() => import('@/pages/OnboardingPage'));
const HomeForRole = lazyWithRetry(() => import('@/pages/HomeForRole'));
const TripFeedPage = lazyWithRetry(() => import('@/pages/TripFeedPage'));
const PostTripPage = lazyWithRetry(() => import('@/pages/PostTripPage'));
const PostedTripsPage = lazyWithRetry(() => import('@/pages/PostedTripsPage'));
const DriverActivityPage = lazyWithRetry(() => import('@/pages/DriverActivityPage'));
const AwaitingDecisionPage = lazyWithRetry(() => import('@/pages/AwaitingDecisionPage'));
const AgentInProgressQueuePage = lazyWithRetry(() => import('@/pages/queue/AgentInProgressQueuePage'));
const AgentNeedsActionQueuePage = lazyWithRetry(() => import('@/pages/queue/AgentNeedsActionQueuePage'));
const ReviewSelectionsPage = lazyWithRetry(() => import('@/pages/ReviewSelectionsPage'));
const TripDetailPage = lazyWithRetry(() => import('@/pages/TripDetailPage'));
const ApplicantReviewPage = lazyWithRetry(() => import('@/pages/ApplicantReviewPage'));
const TripInvitationsPage = lazyWithRetry(() => import('@/pages/TripInvitationsPage'));
const DriverProfilePage = lazyWithRetry(() => import('@/pages/DriverProfilePage'));
const AgentProfilePage = lazyWithRetry(() => import('@/pages/AgentProfilePage'));
const ProfilePage = lazyWithRetry(() => import('@/pages/ProfilePage'));
const AgentAnalyticsPage = lazyWithRetry(() => import('@/pages/AgentAnalyticsPage'));
const DriverEarningsPage = lazyWithRetry(() => import('@/pages/DriverEarningsPage'));
const DriverAnalyticsPage = lazyWithRetry(() => import('@/pages/DriverAnalyticsPage'));
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
const WalletPage = lazyWithRetry(() => import('@/pages/WalletPage'));
const WalletChargesPage = lazyWithRetry(() => import('@/pages/WalletChargesPage'));
const ReferralsPage = lazyWithRetry(() => import('@/pages/ReferralsPage'));
const ReferralLinkDetailPage = lazyWithRetry(() => import('@/pages/ReferralLinkDetailPage'));
const NotFoundPage = lazyWithRetry(() => import('@/pages/NotFoundPage'));
const AdministrationPage = lazyWithRetry(() => import('@/pages/administration/AdministrationPage'));
const AdminConfigPage = lazyWithRetry(() => import('@/pages/administration/AdminConfigPage'));
const KycReviewPage = lazyWithRetry(() => import('@/pages/administration/KycReviewPage'));
const KycDetailPage = lazyWithRetry(() => import('@/pages/administration/KycDetailPage'));
const VideoCallConsolePage = lazyWithRetry(() => import('@/pages/administration/VideoCallConsolePage'));
const VehicleEligibilityPage = lazyWithRetry(() => import('@/pages/administration/VehicleEligibilityPage'));
const ReviewModerationPage = lazyWithRetry(() => import('@/pages/administration/ReviewModerationPage'));
const TranslationManagerPage = lazyWithRetry(() => import('@/pages/administration/TranslationManagerPage'));
const AdminDashboardPage = lazyWithRetry(() => import('@/pages/administration/AdminDashboardPage'));
const AdminAppWalletPage = lazyWithRetry(() => import('@/pages/administration/AdminAppWalletPage'));
const AdminWithdrawalsPage = lazyWithRetry(() => import('@/pages/administration/AdminWithdrawalsPage'));
const AdminReferralsPage = lazyWithRetry(() => import('@/pages/administration/AdminReferralsPage'));
const AdminReferralFlagsPage = lazyWithRetry(() => import('@/pages/administration/AdminReferralFlagsPage'));
const AdminDriversPage = lazyWithRetry(() => import('@/pages/administration/AdminDriversPage'));
const BugsPage = lazyWithRetry(() => import('@/pages/administration/BugsPage'));
const AdminDesignsPage = lazyWithRetry(() => import('@/pages/administration/AdminDesignsPage'));
const AdminAgentsPage = lazyWithRetry(() => import('@/pages/administration/AdminAgentsPage'));
const PassengersPage = lazyWithRetry(() => import('@/pages/administration/PassengersPage'));
// Public marketing pages — no auth, no app layout.
const WebsitePage = lazyWithRetry(() => import('@/pages/WebsitePage'));
const ForAgentsPage = lazyWithRetry(() => import('@/pages/ForAgentsPage'));
// Public passenger portal — the trip OTP is the credential, no login.
const PassengerPage = lazyWithRetry(() => import('@/pages/PassengerPage'));
// v2..v6 prototype skins — one design per top-level prefix. v1 routes untouched.
const V2OperatorTripsPage = lazyWithRetry(() => import('@/pages/v2/operator-console/TripsListPage'));
const V3FieldTripsPage = lazyWithRetry(() => import('@/pages/v2/field-companion/TripsListPage'));
const V4PipelineTripsPage = lazyWithRetry(() => import('@/pages/v2/pipeline-board/TripsListPage'));
const V5EditorialTripsPage = lazyWithRetry(() => import('@/pages/v2/editorial/TripsListPage'));
const V6BharatTripsPage = lazyWithRetry(() => import('@/pages/v2/bharat-native/TripsListPage'));
const V2OperatorTripDetailPage = lazyWithRetry(() => import('@/pages/v2/operator-console/TripDetailPage'));
const V3FieldTripDetailPage = lazyWithRetry(() => import('@/pages/v2/field-companion/TripDetailPage'));
const V4PipelineTripDetailPage = lazyWithRetry(() => import('@/pages/v2/pipeline-board/TripDetailPage'));
const V5EditorialTripDetailPage = lazyWithRetry(() => import('@/pages/v2/editorial/TripDetailPage'));
const V6BharatTripDetailPage = lazyWithRetry(() => import('@/pages/v2/bharat-native/TripDetailPage'));
const V2OperatorHomePage = lazyWithRetry(() => import('@/pages/v2/operator-console/HomePage'));
const V3FieldHomePage = lazyWithRetry(() => import('@/pages/v2/field-companion/HomePage'));
const V4PipelineHomePage = lazyWithRetry(() => import('@/pages/v2/pipeline-board/HomePage'));
const V5EditorialHomePage = lazyWithRetry(() => import('@/pages/v2/editorial/HomePage'));
const V6BharatHomePage = lazyWithRetry(() => import('@/pages/v2/bharat-native/HomePage'));
const V2OperatorProfilePage = lazyWithRetry(() => import('@/pages/v2/operator-console/ProfilePage'));
const V3FieldProfilePage = lazyWithRetry(() => import('@/pages/v2/field-companion/ProfilePage'));
const V4PipelineProfilePage = lazyWithRetry(() => import('@/pages/v2/pipeline-board/ProfilePage'));
const V5EditorialProfilePage = lazyWithRetry(() => import('@/pages/v2/editorial/ProfilePage'));
const V6BharatProfilePage = lazyWithRetry(() => import('@/pages/v2/bharat-native/ProfilePage'));
const V2OperatorMyTripsPage = lazyWithRetry(() => import('@/pages/v2/operator-console/MyTripsPage'));
const V3FieldMyTripsPage = lazyWithRetry(() => import('@/pages/v2/field-companion/MyTripsPage'));
const V4PipelineMyTripsPage = lazyWithRetry(() => import('@/pages/v2/pipeline-board/MyTripsPage'));
const V5EditorialMyTripsPage = lazyWithRetry(() => import('@/pages/v2/editorial/MyTripsPage'));
const V6BharatMyTripsPage = lazyWithRetry(() => import('@/pages/v2/bharat-native/MyTripsPage'));
const V2OperatorNotificationsPage = lazyWithRetry(() => import('@/pages/v2/operator-console/NotificationsPage'));
const V3FieldNotificationsPage = lazyWithRetry(() => import('@/pages/v2/field-companion/NotificationsPage'));
const V4PipelineNotificationsPage = lazyWithRetry(() => import('@/pages/v2/pipeline-board/NotificationsPage'));
const V5EditorialNotificationsPage = lazyWithRetry(() => import('@/pages/v2/editorial/NotificationsPage'));
const V6BharatNotificationsPage = lazyWithRetry(() => import('@/pages/v2/bharat-native/NotificationsPage'));
const V2OperatorPostTripPage = lazyWithRetry(() => import('@/pages/v2/operator-console/PostTripPage'));
const V3FieldPostTripPage = lazyWithRetry(() => import('@/pages/v2/field-companion/PostTripPage'));
const V4PipelinePostTripPage = lazyWithRetry(() => import('@/pages/v2/pipeline-board/PostTripPage'));
const V5EditorialPostTripPage = lazyWithRetry(() => import('@/pages/v2/editorial/PostTripPage'));
const V6BharatPostTripPage = lazyWithRetry(() => import('@/pages/v2/bharat-native/PostTripPage'));
const V2OperatorReferralsPage = lazyWithRetry(() => import('@/pages/v2/operator-console/ReferralsPage'));
const V3FieldReferralsPage = lazyWithRetry(() => import('@/pages/v2/field-companion/ReferralsPage'));
const V4PipelineReferralsPage = lazyWithRetry(() => import('@/pages/v2/pipeline-board/ReferralsPage'));
const V5EditorialReferralsPage = lazyWithRetry(() => import('@/pages/v2/editorial/ReferralsPage'));
const V6BharatReferralsPage = lazyWithRetry(() => import('@/pages/v2/bharat-native/ReferralsPage'));
const V2OperatorWalletPage = lazyWithRetry(() => import('@/pages/v2/operator-console/WalletPage'));
const V3FieldWalletPage = lazyWithRetry(() => import('@/pages/v2/field-companion/WalletPage'));
const V4PipelineWalletPage = lazyWithRetry(() => import('@/pages/v2/pipeline-board/WalletPage'));
const V5EditorialWalletPage = lazyWithRetry(() => import('@/pages/v2/editorial/WalletPage'));
const V6BharatWalletPage = lazyWithRetry(() => import('@/pages/v2/bharat-native/WalletPage'));

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
            <Route path="/trips/:id/invitations" element={<TripInvitationsPage />} />
            <Route path="/posted-trips" element={<PostedTripsPage />} />
            <Route path="/my-trips" element={<DriverActivityPage />} />
            <Route path="/my-trips/awaiting" element={<AwaitingDecisionPage />} />
            <Route path="/queue/in-progress" element={<AgentInProgressQueuePage />} />
            <Route path="/queue/needs-action" element={<AgentNeedsActionQueuePage />} />
            <Route path="/my-trips/review" element={<ReviewSelectionsPage />} />
            <Route path="/drivers/:id" element={<DriverProfilePage />} />
            <Route path="/agents/:id" element={<AgentProfilePage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/analytics" element={<AgentAnalyticsPage />} />
            <Route path="/my-earnings" element={<DriverEarningsPage />} />
            <Route path="/driver-analytics" element={<DriverAnalyticsPage />} />
            <Route path="/verify/documents" element={<VerifyDocumentsPage />} />
            <Route path="/verify/video-call" element={<BookVideoCallPage />} />
            <Route path="/vehicles/new" element={<VehicleFormPage />} />
            <Route path="/vehicles/:id/edit" element={<VehicleFormPage />} />
            <Route path="/vehicles/:id/photos" element={<VehiclePhotosPage />} />
            <Route path="/vacancies" element={<VacanciesPage />} />
            <Route path="/vacancies/new" element={<PostVacancyPage />} />
            <Route path="/vacancies/:id/edit" element={<PostVacancyPage />} />
            <Route path="/alerts" element={<AlertsPage />} />
            <Route path="/alerts/new" element={<CreateAlertPage />} />
            <Route path="/alerts/:id" element={<AlertDetailPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/wallet" element={<WalletPage />} />
            <Route path="/wallet/charges" element={<WalletChargesPage />} />
            <Route path="/referrals" element={<ReferralsPage />} />
            <Route path="/referrals/:linkId" element={<ReferralLinkDetailPage />} />
            <Route path="/administration" element={<AdminRoute><AdministrationPage /></AdminRoute>} />
            <Route path="/administration/dashboard" element={<AdminRoute><AdminDashboardPage /></AdminRoute>} />
            <Route path="/administration/app-wallet" element={<AdminRoute><AdminAppWalletPage /></AdminRoute>} />
            <Route path="/administration/withdrawals" element={<AdminRoute><AdminWithdrawalsPage /></AdminRoute>} />
            <Route path="/administration/referrals" element={<AdminRoute><AdminReferralsPage /></AdminRoute>} />
            <Route path="/administration/referrals/flags" element={<AdminRoute><AdminReferralFlagsPage /></AdminRoute>} />
            <Route path="/administration/config" element={<AdminRoute><AdminConfigPage /></AdminRoute>} />
            <Route path="/administration/kyc" element={<AdminRoute><KycReviewPage /></AdminRoute>} />
            <Route path="/administration/kyc/:kind/:id" element={<AdminRoute><KycDetailPage /></AdminRoute>} />
            <Route path="/administration/drivers" element={<AdminRoute><AdminDriversPage /></AdminRoute>} />
            <Route path="/administration/agents" element={<AdminRoute><AdminAgentsPage /></AdminRoute>} />
            <Route path="/administration/passengers" element={<AdminRoute><PassengersPage /></AdminRoute>} />
            <Route path="/administration/video-calls" element={<AdminRoute><VideoCallConsolePage /></AdminRoute>} />
            <Route path="/administration/vehicles" element={<AdminRoute><VehicleEligibilityPage /></AdminRoute>} />
            <Route path="/administration/reviews" element={<AdminRoute><ReviewModerationPage /></AdminRoute>} />
            <Route path="/administration/translations" element={<AdminRoute><TranslationManagerPage /></AdminRoute>} />
            <Route path="/administration/bugs" element={<AdminRoute><BugsPage /></AdminRoute>} />
            <Route path="/administration/designs" element={<AdminRoute><AdminDesignsPage /></AdminRoute>} />
          </Route>
          {/* v2..v6 prototype skins — each top-level prefix is one design direction. */}
          <Route element={<ProtectedRoute><V2LayoutShell /></ProtectedRoute>}>
            <Route path="/v2" element={<V2OperatorHomePage />} />
            <Route path="/v2/trips" element={<V2OperatorTripsPage />} />
            <Route path="/v2/trips/:id" element={<V2OperatorTripDetailPage />} />
            <Route path="/v3" element={<V3FieldHomePage />} />
            <Route path="/v3/trips" element={<V3FieldTripsPage />} />
            <Route path="/v3/trips/:id" element={<V3FieldTripDetailPage />} />
            <Route path="/v4" element={<V4PipelineHomePage />} />
            <Route path="/v4/trips" element={<V4PipelineTripsPage />} />
            <Route path="/v4/trips/:id" element={<V4PipelineTripDetailPage />} />
            <Route path="/v5" element={<V5EditorialHomePage />} />
            <Route path="/v5/trips" element={<V5EditorialTripsPage />} />
            <Route path="/v5/trips/:id" element={<V5EditorialTripDetailPage />} />
            <Route path="/v6" element={<V6BharatHomePage />} />
            <Route path="/v6/trips" element={<V6BharatTripsPage />} />
            <Route path="/v6/trips/:id" element={<V6BharatTripDetailPage />} />
            <Route path="/v2/profile" element={<V2OperatorProfilePage />} />
            <Route path="/v3/profile" element={<V3FieldProfilePage />} />
            <Route path="/v4/profile" element={<V4PipelineProfilePage />} />
            <Route path="/v5/profile" element={<V5EditorialProfilePage />} />
            <Route path="/v6/profile" element={<V6BharatProfilePage />} />
            <Route path="/v2/my-trips" element={<V2OperatorMyTripsPage />} />
            <Route path="/v3/my-trips" element={<V3FieldMyTripsPage />} />
            <Route path="/v4/my-trips" element={<V4PipelineMyTripsPage />} />
            <Route path="/v5/my-trips" element={<V5EditorialMyTripsPage />} />
            <Route path="/v6/my-trips" element={<V6BharatMyTripsPage />} />
            <Route path="/v2/notifications" element={<V2OperatorNotificationsPage />} />
            <Route path="/v3/notifications" element={<V3FieldNotificationsPage />} />
            <Route path="/v4/notifications" element={<V4PipelineNotificationsPage />} />
            <Route path="/v5/notifications" element={<V5EditorialNotificationsPage />} />
            <Route path="/v6/notifications" element={<V6BharatNotificationsPage />} />
            <Route path="/v2/trips/new" element={<V2OperatorPostTripPage />} />
            <Route path="/v3/trips/new" element={<V3FieldPostTripPage />} />
            <Route path="/v4/trips/new" element={<V4PipelinePostTripPage />} />
            <Route path="/v5/trips/new" element={<V5EditorialPostTripPage />} />
            <Route path="/v6/trips/new" element={<V6BharatPostTripPage />} />
            <Route path="/v2/referrals" element={<V2OperatorReferralsPage />} />
            <Route path="/v3/referrals" element={<V3FieldReferralsPage />} />
            <Route path="/v4/referrals" element={<V4PipelineReferralsPage />} />
            <Route path="/v5/referrals" element={<V5EditorialReferralsPage />} />
            <Route path="/v6/referrals" element={<V6BharatReferralsPage />} />
            <Route path="/v2/wallet" element={<V2OperatorWalletPage />} />
            <Route path="/v3/wallet" element={<V3FieldWalletPage />} />
            <Route path="/v4/wallet" element={<V4PipelineWalletPage />} />
            <Route path="/v5/wallet" element={<V5EditorialWalletPage />} />
            <Route path="/v6/wallet" element={<V6BharatWalletPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </SentryRoutes>
      </Suspense>
    </RouteErrorBoundary>
  );
}

export default AppRoutes;
