import { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { LoadingSkeleton } from '@/components/feedback';

/** Gate an authed route — redirects to `/signin` (remembering `from`) when there's no session. */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="p-8">
        <LoadingSkeleton rows={4} />
      </div>
    );
  }
  if (!isAuthenticated) {
    return <Navigate to="/app/signin" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

export default ProtectedRoute;
