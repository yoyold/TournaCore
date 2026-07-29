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

/**
 * Regression guard for the policy blocking our own code.
 *
 * The theme setter in index.html is an inline script, which `script-src 'self'`
 * blocks unless its hash is allow-listed. When it was blocked, every test still
 * passed — the React hook sets the theme after mount — and the only symptom was
 * a console error in production. This asserts on exactly that.
 */
test('runs without any content security policy violation', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && /content security policy/i.test(message.text())) {
      violations.push(message.text());
    }
  });

  await page.goto('./');
  await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();

  expect(violations, violations.join('\n')).toEqual([]);
});
