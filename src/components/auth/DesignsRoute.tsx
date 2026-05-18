import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { LoadingSkeleton, ErrorState } from '@/components/feedback';

/**
 * Gate for `/administration/designs` — the in-app Design Previews index. Allows EITHER:
 *   - an admin (`users.role === 'admin'`), OR
 *   - a user whose phone is in the design-preview allowlist
 *     (`feature_flags.design_previews === true` from /auth/me; see migration 056).
 *
 * Less strict than `<AdminRoute>` because the page is a feedback surface for hand-picked
 * teammates / beta users — they're not admins, but they're meant to see the design tour.
 * Anonymous users still bounce to /signin like every other protected route.
 */
export function DesignsRoute({ children }: { children: ReactNode }) {
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
  const isAdmin = user.role === 'admin';
  const hasDesignPreviews = user.featureFlags?.designPreviews === true;
  if (!isAdmin && !hasDesignPreviews) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-8">
        <ErrorState
          title="403 — not available"
          message="Design previews are only visible to teammates we've added to the allowlist. Ask an admin if you need access."
        />
      </div>
    );
  }
  return <>{children}</>;
}

export default DesignsRoute;
