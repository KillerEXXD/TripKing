import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import tailwindcss from '@tailwindcss/vite';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import path from 'path';

// Mirrors hudr-pwa/vite.config.ts. See CLAUDE.md §"Caching" for the Workbox strategy
// and §"API" for the dev proxy. Dev: requests to /api/* are proxied to the Supabase
// Edge Functions host (CORS-free); resources are function-name-prefixed (/auth/*, /admin/*,
// later /trips/* …). Prod: the app calls VITE_API_BASE_URL directly (point it at the same
// /functions/v1 base, or at an api.tripking.in gateway in front of it).
const DEV_API_TARGET = 'https://saxcbebqxgatiktsebxw.supabase.co/functions/v1';

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
      // Custom service worker (src/sw.ts) via `injectManifest`. The previous `generateSW`
      // strategy auto-bound a `createHandlerBoundToURL('index.html')` handler that threw on
      // every cold load because index.html is NOT precached (chunk hashes must match the
      // latest deploy). Switching to injectManifest gives us full control of the SW source.
      //
      // `/api/*` runtime caching is intentionally NOT here — Phase 3 of the caching strategy
      // (Cloudflare Worker on api.tripkingapp.com) covers that tier alongside the browser
      // HTTP cache + React Query. See docs/CACHE_BASELINE.md.
      //
      // The SW also wires an error bridge that postMessages SW-context errors to clients;
      // src/lib/swErrorBridge.ts on the page side funnels them into Sentry.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
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
      injectManifest: {
        // Match the previous generateSW globs — images + fonts only (HTML stays uncached).
        globPatterns: ['**/*.{ico,png,jpg,jpeg,webp,woff,woff2,svg}'],
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
