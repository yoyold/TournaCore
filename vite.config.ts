import { createHash } from 'node:crypto';
import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
// From `vitest/config` rather than `vite`: only that variant types the `test` block.
import { defineConfig, type Plugin } from 'vitest/config';

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
function buildCsp(scriptHashes: readonly string[]): string {
  return [
    "default-src 'self'",
    // index.html carries one inline script — the pre-paint theme setter. Under
    // `script-src 'self'` an inline script is blocked unless its hash is listed,
    // so the hash is computed at build time and added here. Without it the theme
    // setter is blocked in production and the wrong theme flashes on load.
    ["script-src 'self'", ...scriptHashes].join(' '),
    "style-src 'self' 'unsafe-inline'", // inline styles from animation libraries
    "img-src 'self' data: blob:", // blob: for locally stored logos read from IndexedDB
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // frame-ancestors is deliberately omitted: it is ignored inside a <meta> CSP
    // and can only take effect as an HTTP header, which static hosting like
    // GitHub Pages does not let us set.
  ].join('; ');
}

/** CSP hash of an inline script body, in the form the directive expects. */
function scriptHash(body: string): string {
  return `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`;
}

const INLINE_SCRIPT = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;

const cspPlugin: Plugin = {
  name: 'tournacore-csp',
  apply: 'build',
  transformIndexHtml: {
    // `post` so the hash is taken from the final HTML, after any other transform
    // has touched the inline script; a hash of the pre-transform text would not
    // match what the browser sees.
    order: 'post',
    handler(html) {
      const hashes: string[] = [];
      for (const [, body] of html.matchAll(INLINE_SCRIPT)) {
        if (body && body.trim().length > 0) hashes.push(scriptHash(body));
      }
      return html.replace(
        '</title>',
        `</title>\n    <meta http-equiv="Content-Security-Policy" content="${buildCsp(hashes)}" />`,
      );
    },
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
