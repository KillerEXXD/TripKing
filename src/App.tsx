import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { queryClient } from '@/lib/queryClient';
import { AuthProvider } from '@/contexts/AuthContext';
import { ErrorBoundary } from '@/components/feedback';
import { PostHogPageviewTracker } from '@/components/PostHogPageviewTracker';
import { useRealtimeSubscriptions } from '@/hooks/useRealtimeSubscriptions';
import { AppRoutes } from '@/AppRoutes';

/** Opens the live-update Realtime channels while signed in (renders nothing).
 *  Must sit under both QueryClientProvider and AuthProvider. */
function RealtimeBridge() {
  useRealtimeSubscriptions();
  return null;
}

/** Root: error boundary → React Query → auth → router (+ pageview tracker + toaster). */
export function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RealtimeBridge />
          <BrowserRouter>
            <PostHogPageviewTracker />
            <AppRoutes />
            <Toaster richColors position="top-center" />
            <SpeedInsights />
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
