import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import tailwindcss from '@tailwindcss/vite';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    sentryVitePlugin({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      disable: !process.env.SENTRY_AUTH_TOKEN,
    }),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt', 'icons/*.svg'],
      manifest: {
        name: 'Trip King — Cab & Trip Marketplace',
        short_name: 'Trip King',
        description:
          'Find vacant cabs, post inter-city trips, and connect drivers with trip managers across India.',
        theme_color: '#10b981',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: 'icons/icon-192x192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
          {
            src: 'icons/icon-512x512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        navigateFallbackDenylist: [/.*/],
        globPatterns: ['**/*.{ico,png,jpg,webp,woff,woff2,svg}'],
        runtimeCaching: [
          {
            // LIVE-DATA endpoints — vacancies, applicants, in-progress trips.
            // Always fetch network; fall back to cache only after 5 s.
            urlPattern:
              /^https:\/\/api\.drivermahal\.in\/(vacancies|applicants|trips-active|notifications)/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-live-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 5 },
            },
          },
          {
            // STABLE endpoints — cities, car types, translations, completed trips.
            urlPattern: /^https:\/\/api\.drivermahal\.in\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'api-stable-cache',
              expiration: { maxEntries: 150, maxAgeSeconds: 60 * 10 },
            },
          },
          {
            // JS/CSS bundles
            urlPattern: /\.(?:js|css)$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'static-assets',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          {
            // Images
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
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
  },
});
