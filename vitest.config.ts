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
      // Thresholds are enforced by scripts/check-coverage-thresholds.cjs after a
      // post-process dedupe step. On Windows, v8 records the same source file under
      // both `c:\…` and `C:\…` cases (about half the entries register 0% hits), so
      // vitest's own threshold check sees ~half the real coverage and fails the gate
      // even when the codebase is well above the bar. The gate script reads
      // coverage-final.json, merges case-insensitive duplicates by max-hits, then
      // checks the same lines/statements/functions/branches floors.
    },
    mockReset: true,
    restoreMocks: true,
    pool: 'forks',
    isolate: true,
  },
});
