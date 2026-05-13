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
