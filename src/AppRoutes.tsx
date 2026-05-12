import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { AdminRoute } from '@/components/auth/AdminRoute';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoadingSkeleton } from '@/components/feedback';

const SignInPage = lazy(() => import('@/pages/SignInPage'));
const HomePage = lazy(() => import('@/pages/HomePage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));
const AdministrationPage = lazy(() => import('@/pages/administration/AdministrationPage'));
const AdminConfigPage = lazy(() => import('@/pages/administration/AdminConfigPage'));

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
        <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route path="/" element={<HomePage />} />
          <Route path="/administration" element={<AdminRoute><AdministrationPage /></AdminRoute>} />
          <Route path="/administration/config" element={<AdminRoute><AdminConfigPage /></AdminRoute>} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}

export default AppRoutes;
