import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
// From `vitest/config` rather than `vite`: only that variant types the `test` block.
import { defineConfig } from 'vitest/config';

/**
 * Content Security Policy.
 *
 * This is the technical backing for the privacy guarantee: the app must make no
 * external requests at runtime, so no visitor IP addresses reach third parties.
 * `connect-src 'self'` is the decisive part.
 *
 * Injected into production builds only. The dev server needs inline scripts for
 * hot module replacement and would fail against a strict policy.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'", // inline styles from animation libraries
  "img-src 'self' data: blob:", // blob: for locally stored logos read from IndexedDB
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const cspPlugin = {
  name: 'tournacore-csp',
  apply: 'build' as const,
  transformIndexHtml(html: string) {
    return html.replace(
      '</title>',
      `</title>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
    );
  },
};

/**
 * `base` is configurable because GitHub Pages serves the app from a subpath
 * (`/TournaCore/`) while a custom domain serves it from the root. VITE_BASE_PATH
 * switches between the two without touching this file.
 */
export default defineConfig(({ mode }) => ({
  base: process.env['VITE_BASE_PATH'] ?? '/TournaCore/',

  plugins: [
    react(),
    tailwindcss(),
    cspPlugin,
    mode === 'analyze' &&
      visualizer({ filename: 'stats.html', gzipSize: true, brotliSize: true, open: false }),
  ].filter(Boolean),

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@app': fileURLToPath(new URL('./src/app', import.meta.url)),
      '@domain': fileURLToPath(new URL('./src/domain', import.meta.url)),
      '@models': fileURLToPath(new URL('./src/models', import.meta.url)),
      '@store': fileURLToPath(new URL('./src/store', import.meta.url)),
      '@services': fileURLToPath(new URL('./src/services', import.meta.url)),
      '@components': fileURLToPath(new URL('./src/components', import.meta.url)),
      '@layouts': fileURLToPath(new URL('./src/layouts', import.meta.url)),
      '@pages': fileURLToPath(new URL('./src/pages', import.meta.url)),
      '@hooks': fileURLToPath(new URL('./src/hooks', import.meta.url)),
      '@utils': fileURLToPath(new URL('./src/utils', import.meta.url)),
    },
  },

  build: {
    target: 'es2022',
    sourcemap: true,
    // Warning threshold kept low on purpose: it should surface before the
    // overall bundle budget enforced in CI is at risk.
    chunkSizeWarningLimit: 300,
  },

  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.{test,spec}.{ts,tsx}', 'src/test/**', 'src/**/*.d.ts'],
      /*
       * Hard gate on the domain layer only. A bug in tournament progression
       * corrupts a running tournament and cannot be repaired by the user, while
       * a UI bug is merely annoying.
       */
      thresholds: {
        'src/domain/**': { branches: 90, functions: 90, lines: 90, statements: 90 },
      },
    },
  },
}));
