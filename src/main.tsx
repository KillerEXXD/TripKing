import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { initSentry } from '@/lib/sentry';
import { initPostHog } from '@/lib/posthog';
import { logger } from '@/lib/logger';
import App from '@/App';
import './index.css';

// Observability + error reporting init before React renders (see CLAUDE.md §"providers + bootstrap").
initSentry();
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
