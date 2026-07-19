import { expect, test } from '@playwright/test';

/**
 * Enforces the core privacy guarantee: the app makes NO requests to foreign
 * origins at runtime.
 *
 * This is deliberately a test rather than a convention. A font loaded from a
 * CDN, an analytics snippet or an externally hosted image would transmit every
 * visitor's IP address to a third party and change the legal assessment of the
 * whole project. Lines like that slip into a codebase casually. This test stops
 * them before they are deployed.
 */
test('makes no requests to foreign origins', async ({ page, baseURL }) => {
  const ownOrigin = new URL(baseURL ?? 'http://localhost:4173').origin;
  const foreignRequests: string[] = [];

  page.on('request', (request) => {
    const url = request.url();
    if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('about:')) return;
    if (new URL(url).origin !== ownOrigin) foreignRequests.push(url);
  });

  await page.goto('./');
  await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();

  // Walk through every main section: lazily loaded chunks could bring their own
  // external dependencies.
  for (const name of [/turniere/i, /teams/i, /spiele/i, /statistiken/i, /einstellungen/i]) {
    await page.getByRole('navigation').getByRole('link', { name }).click();
    await page.waitForLoadState('networkidle');
  }

  expect(foreignRequests, `Foreign requests found:\n${foreignRequests.join('\n')}`).toEqual([]);
});

test('ships a Content Security Policy that blocks outbound connections', async ({ page }) => {
  await page.goto('./');

  const csp = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');

  expect(csp).toBeTruthy();
  // connect-src 'self' is the directive that blocks outbound fetch, XHR and WebSocket.
  expect(csp).toContain("connect-src 'self'");
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("object-src 'none'");
});
