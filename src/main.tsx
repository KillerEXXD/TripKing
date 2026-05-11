import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { Toaster } from 'sonner';
import App from './App';
import './index.css';

// =====================
// PWA: auto-update service worker
// =====================
//
// Without this, an old SW from a prior deploy can intercept navigation
// requests and serve stale index.html that references chunk hashes that
// no longer exist on the server — producing the "Failed to load module
// script: MIME type text/html" white-screen failure mode.
//
// Mirrors the hudr-pwa pattern: when a new SW activates, clear all caches
// and force-reload so the user picks up the new build immediately.

const UPDATE_INTERVAL_MS = 60_000; // check every 60s

function reloadAfterUpdate() {
  // Avoid duplicate reload chains.
  if ((window as unknown as { __pwaReloading?: boolean }).__pwaReloading) return;
  (window as unknown as { __pwaReloading?: boolean }).__pwaReloading = true;
  caches
    .keys()
    .then((names) => Promise.all(names.map((n) => caches.delete(n))))
    .catch(() => undefined)
    .finally(() => location.reload());
}

registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    setInterval(() => registration.update(), UPDATE_INTERVAL_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registration.update();
    });
    window.addEventListener('focus', () => registration.update());

    if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        reloadAfterUpdate();
      });
    }
  },
  onNeedRefresh() {
    reloadAfterUpdate();
  },
  onRegisterError() {
    // SW registration can fail on insecure contexts or first install
    // through certain CDNs. Not actionable; suppress.
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <Toaster position="top-center" richColors closeButton />
  </React.StrictMode>,
);
