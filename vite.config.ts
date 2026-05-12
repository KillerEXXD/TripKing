import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import tailwindcss from '@tailwindcss/vite';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import path from 'path';

// Mirrors hudr-pwa/vite.config.ts. See CLAUDE.md §"Caching" for the Workbox strategy
// and §"API" for the dev proxy. Dev: requests to /api/* are proxied to the real host
// (CORS-free). Prod: the app calls VITE_API_BASE_URL directly.
const DEV_API_TARGET = 'https://api.tripking.in';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Upload source maps to Sentry (prod builds only — needs SENTRY_AUTH_TOKEN).
    sentryVitePlugin({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      disable: !process.env.SENTRY_AUTH_TOKEN,
    }),
    VitePWA({
      // New service worker activates immediately — no stale-bundle white screen.
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'robots.txt', 'icons/*.svg'],
      manifest: {
        name: 'TripKing — Cab & Trip Marketplace',
        short_name: 'TripKing',
        description:
          'Outstation cab marketplace — agents post trips, verified drivers apply, OTP handshake, live tracking.',
        theme_color: '#10b981',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icons/icon-192x192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any maskable' },
          { src: 'icons/icon-512x512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // index.html is NOT precached — navigations always hit the network for fresh chunk refs.
        navigateFallbackDenylist: [/.*/],
        globPatterns: ['**/*.{ico,png,jpg,jpeg,webp,woff,woff2,svg}'],
        runtimeCaching: [
          {
            // Live-data endpoints — Network First (never serve stale): trip feeds,
            // vacancy feed, applicant lists, /trips/{id}/applicants.
            urlPattern: /^https:\/\/api\.tripking\.in\/(trips|vacancies|trip-acceptances)/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-live-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 5 },
            },
          },
          {
            // Everything else under the API (incl. /admin/*, /drivers, /reviews) — Stale While Revalidate.
            urlPattern: /^https:\/\/api\.tripking\.in\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'api-stable-cache',
              expiration: { maxEntries: 150, maxAgeSeconds: 60 * 10 },
            },
          },
          {
            // JS/CSS bundles — SWR (instant, update in background).
            urlPattern: /\.(?:js|css)$/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'static-assets', expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 } },
          },
          {
            // Images — Cache First.
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
            handler: 'CacheFirst',
            options: { cacheName: 'image-cache', expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    // Hidden source maps — uploaded to Sentry, not served to the browser.
    sourcemap: 'hidden',
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-ui': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-tabs',
            '@radix-ui/react-select',
            '@radix-ui/react-tooltip',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-avatar',
            '@radix-ui/react-slider',
            '@radix-ui/react-label',
            '@radix-ui/react-slot',
          ],
          'vendor-charts': ['recharts'],
          'vendor-sentry': ['@sentry/react'],
          'vendor-posthog': ['posthog-js'],
        },
      },
    },
  },
  server: {
    port: 3002,
    open: true,
    allowedHosts: ['.ngrok.app', '.ngrok-free.app'],
    proxy: {
      '/api': {
        target: DEV_API_TARGET,
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
});
