import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const BASE_PATH = '/TournaCore/';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: `http://localhost:${String(PORT)}${BASE_PATH}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  // Test against the production build rather than the dev server: only the
  // build carries the CSP, and that is one of the things under test.
  webServer: {
    command: `npm run build && npm run preview -- --port ${String(PORT)} --strictPort`,
    url: `http://localhost:${String(PORT)}${BASE_PATH}`,
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
  },
});
