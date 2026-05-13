import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { initSentry } from '@/lib/sentry';
import { installGlobalErrorHandlers } from '@/lib/globalErrorHandlers';
import { installSwErrorBridge } from '@/lib/swErrorBridge';
import { initPostHog } from '@/lib/posthog';
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

// Auto-updating service worker — new bundle activates immediately (no stale-bundle white screen).
registerSW({
  immediate: true,
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
