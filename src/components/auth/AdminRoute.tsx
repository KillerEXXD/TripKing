import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { LoadingSkeleton, ErrorState } from '@/components/feedback';

/** Gate an admin route — 403s a signed-in non-admin, bounces an anonymous user to `/signin`. */
export function AdminRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="p-8">
        <LoadingSkeleton rows={4} />
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/app/signin" replace />;
  }
  if (user.role !== 'admin') {
    return (
      <div className="flex min-h-dvh items-center justify-center p-8">
        <ErrorState title="403 — admins only" message="You don't have access to the administration area." />
      </div>
    );
  }
  return <>{children}</>;
}

export default AdminRoute;
