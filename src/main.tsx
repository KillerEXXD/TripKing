import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { toast } from 'sonner';
import { initSentry } from '@/lib/sentry';
import { installGlobalErrorHandlers } from '@/lib/globalErrorHandlers';
import { installSwErrorBridge } from '@/lib/swErrorBridge';
import { initPostHog } from '@/lib/posthog';
import { wireWebVitals } from '@/lib/webVitals';
import { installConsoleHook } from '@/lib/logBuffer';
import { logger } from '@/lib/logger';
import App from '@/App';
import './index.css';

// Observability + error reporting init before React renders (see CLAUDE.md §"providers + bootstrap").
// The SW bridge funnels service-worker-scope errors (which window.unhandledrejection can't see)
// into Sentry tagged `source: 'service-worker'`. The matching SW listener lives in src/sw.ts.
initSentry();
installGlobalErrorHandlers();
installSwErrorBridge();
initPostHog();
wireWebVitals();
installConsoleHook();

// Service-worker update flow — when a new bundle is deployed, show a toast with a Refresh
// action instead of auto-reloading the tab. Why: silent auto-reloads on a partly-typed form
// or mid-flow can lose user state. The toast lets the user pick the moment.
//
// `onNeedRefresh` fires once the new SW has finished installing and is waiting to activate.
// Tapping Refresh calls updateSW(true), which sends SKIP_WAITING to the SW and reloads the
// page onto the new bundle. The SW's install handler no longer auto-skipWaiting itself —
// that change lives in src/sw.ts.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    toast.info('New version available', {
      description: 'Refresh to load the latest update.',
      duration: Infinity,
      action: {
        label: 'Refresh',
        onClick: () => {
          void updateSW(true);
        },
      },
    });
  },
  onRegisterError(error) {
    logger.debug('[PWA] service worker registration failed:', error);
  },
});

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found');
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
