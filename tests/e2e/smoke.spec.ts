import { expect, test } from '@playwright/test';

test.describe('application shell', () => {
  test('loads the dashboard and shows the navigation', async ({ page }) => {
    await page.goto('./');

    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

    const nav = page.getByRole('navigation', { name: 'Hauptnavigation' });
    for (const label of ['Turniere', 'Teams', 'Spiele', 'Statistiken', 'Einstellungen']) {
      await expect(nav.getByRole('link', { name: label })).toBeVisible();
    }
  });

  test('navigates via the hash router, including on direct entry', async ({ page }) => {
    // Open a deep link directly: exactly the case where history routing would
    // break on GitHub Pages.
    await page.goto('./#/teams');
    await expect(page.getByRole('heading', { name: 'Teams', level: 1 })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Teams', level: 1 })).toBeVisible();
  });

  test.describe('theme', () => {
    // Set the system preference explicitly instead of relying on the browser
    // default, which would silently change what this test verifies.
    test.use({ colorScheme: 'dark' });

    test('follows the system preference while nothing is chosen', async ({ page }) => {
      await page.goto('./');
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    });

    test('overrides the system preference and keeps it across a reload', async ({ page }) => {
      await page.goto('./');
      const html = page.locator('html');

      await expect(html).toHaveAttribute('data-theme', 'dark');

      await page.getByRole('button', { name: /hellem Theme/i }).click();
      await expect(html).toHaveAttribute('data-theme', 'light');

      await page.reload();
      // An explicit choice must beat the system preference. Without the inline
      // script in index.html the wrong theme would also flash briefly here.
      await expect(html).toHaveAttribute('data-theme', 'light');
    });
  });

  test('reaches the legal pages from the footer', async ({ page }) => {
    await page.goto('./');

    await page.getByRole('contentinfo').getByRole('link', { name: 'Impressum' }).click();
    await expect(page.getByRole('heading', { name: 'Impressum', level: 1 })).toBeVisible();

    await page.getByRole('contentinfo').getByRole('link', { name: 'Datenschutz' }).click();
    await expect(page.getByRole('heading', { name: /Datenschutz/i, level: 1 })).toBeVisible();
  });

  test('shows a 404 page for unknown routes', async ({ page }) => {
    await page.goto('./#/does-not-exist');
    await expect(page.getByRole('heading', { name: /nicht gefunden/i })).toBeVisible();
  });
});
