import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
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

// Auto-updating service worker — new bundle activates immediately (no stale-bundle white screen).
registerSW({
  immediate: true,
  onRegisterError(error) {
    logger.debug('[PWA] service worker registration failed:', error);
  },
});

// When a new SW takes control of this client (after deploy + skipWaiting + clientsClaim),
// reload so the open tab picks up the new JS bundle instead of running the old one until
// the user manually refreshes. Without this, users see stale routing / stale code after a
// deploy until they close the tab. The `refreshing` guard prevents reload loops on browsers
// that fire `controllerchange` more than once during activation.
if ('serviceWorker' in navigator) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found');
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
