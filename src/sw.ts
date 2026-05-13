/// <reference lib="webworker" />
/**
 * TripKing custom service worker (vite-plugin-pwa, `injectManifest` strategy).
 *
 * The previous setup used `generateSW`, which auto-bound a navigation-fallback
 * handler to `index.html` at install time. Because we deliberately don't precache
 * HTML (chunk hashes must match the latest deploy), that handler threw
 * `non-precached-url: index.html` on every cold load — a recurring console error
 * that never reached Sentry because SW errors live in `ServiceWorkerGlobalScope`,
 * not `window`. This file replaces that with a minimal hand-rolled SW:
 *
 *   1. Precache the assets injected at build time (images, fonts, icons).
 *   2. Stale-while-revalidate for JS / CSS bundles so navigation feels instant.
 *   3. Cache-first for images so they don't bloat the network.
 *   4. NO `/api/*` runtime caching — Phase 3 of the caching plan moved that to
 *      the Cloudflare Worker (api.tripkingapp.com). The browser HTTP cache +
 *      Cloudflare + React Query are the canonical layers for API responses now;
 *      keeping a SW copy was belt-and-braces with no benefit and made staleness
 *      debugging harder.
 *   5. NO `navigateFallback` / `createHandlerBoundToURL` — navigations always
 *      fetch index.html fresh from origin (Vercel) so chunk hashes match.
 *   6. An error bridge: any `error` / `unhandledrejection` in this isolate is
 *      `postMessage`d to every connected client; `src/lib/swErrorBridge.ts` on
 *      the page side receives those and reports to Sentry tagged
 *      `source: 'service-worker'`. This is the Workbox-recommended pattern for
 *      a thin SW (lighter than bundling the full Sentry SDK inside the worker).
 */

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

// Bootstrap — vite-plugin-pwa replaces `self.__WB_MANIFEST` with the build's
// precache list (matched against `workbox.globPatterns` in vite.config.ts).
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// JS / CSS bundles — SWR so the next load picks up the fresh build in background.
registerRoute(
  ({ request }) => request.destination === 'script' || request.destination === 'style',
  new StaleWhileRevalidate({
    cacheName: 'static-assets',
    plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 })],
  }),
);

// Images — cache-first; rarely change and we don't pay the round-trip.
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'image-cache',
    plugins: [new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 })],
  }),
);

// Auto-activate new SW versions (no stale-bundle white screen).
self.addEventListener('install', () => {
  void self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// ── error bridge ───────────────────────────────────────────────────────────
// Broadcast SW-context errors to every connected page so the main-thread
// Sentry init (which can't observe this scope) gets a chance to report them.

interface SwErrorMessage {
  type: 'sw-error';
  kind: 'error' | 'unhandledrejection';
  message: string;
  stack?: string;
  url?: string;
}

function broadcast(payload: Omit<SwErrorMessage, 'type'>): void {
  self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then((clients) => {
    const msg: SwErrorMessage = { type: 'sw-error', ...payload };
    for (const client of clients) client.postMessage(msg);
  }, () => { /* swallow — clients gone, nothing to do */ });
}

self.addEventListener('error', (event) => {
  broadcast({
    kind: 'error',
    message: event.message || 'unknown SW error',
    stack: event.error instanceof Error ? event.error.stack : undefined,
    url: event.filename,
  });
});

self.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  broadcast({
    kind: 'unhandledrejection',
    message: reason instanceof Error ? reason.message : String(reason ?? 'unknown rejection'),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});
