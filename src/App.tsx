import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ErrorBoundary } from '@/components/feedback';

/**
 * Root application shell.
 *
 * Scaffold stage: a single placeholder route. The QueryClientProvider,
 * AuthProvider, route guards and the real route tree land in the
 * "providers + router" commit (Phase 1).
 */
export function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route
            path="*"
            element={
              <main className="flex min-h-dvh items-center justify-center p-8 text-center">
                <div>
                  <h1 className="text-2xl font-bold">TripKing</h1>
                  <p className="mt-2 text-sm text-secondary">
                    Production scaffold — see <code>CLAUDE.md</code> and{' '}
                    <code>docs/PLATFORM_AND_ADMIN_REQUIREMENTS.md</code>.
                  </p>
                </div>
              </main>
            }
          />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
