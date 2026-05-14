/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

// Mirrors hudr-pwa/vitest.config.ts. Tests live in __tests__/ folders beside the source.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      'cloudflare/**/__tests__/**/*.{test,spec}.{js,ts}',
    ],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // Apply `exclude` AFTER source-map remap so v8 doesn't double-count the same source file.
      // Without this the Windows runner reports ~38–85% (depending on how often the same file
      // appears in the bundled chunks) vs the real ~87% in coverage-final.json.
      excludeAfterRemap: true,
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'node_modules/',
        'src/test/',
        'src/types/**',
        '**/*.d.ts',
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/version.ts',
        'src/components/ui/**',
        '**/__tests__/**',
      ],
      thresholds: {
        // Floors set just below the actual coverage so a 1-file edit doesn't flake the gate.
        // PR #29 (trip-types) temporarily dropped these to 84/70/68 when the new components
        // shipped without focused unit tests; this commit lifts them back as TripTypeTabs /
        // RouteChain / WaypointEditor land with point tests (Items 3 of the followups list).
        statements: 85,
        branches: 71,
        functions: 69,
        lines: 85,
      },
    },
    mockReset: true,
    restoreMocks: true,
    pool: 'forks',
    isolate: true,
  },
});
