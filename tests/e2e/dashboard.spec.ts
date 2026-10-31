import { expect, test, type Page } from '@playwright/test';

/**
 * The figures the application opens with.
 *
 * They were placeholders reading zero for a long time, which on a busy archive
 * is worse than showing nothing: it says the data is gone.
 */

/** The number shown on the card with this label; it sits just above it. */
async function figure(page: Page, label: string): Promise<string> {
  const value = page.getByText(label, { exact: true }).locator('xpath=preceding-sibling::span[1]');
  return (await value.innerText()).trim();
}

test('counts nothing while there is nothing', async ({ page }) => {
  await page.goto('./#/');

  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
  expect(await figure(page, 'Aktive Turniere')).toBe('0');
  expect(await figure(page, 'Erfasste Teams')).toBe('0');
  expect(await figure(page, 'Anstehende Matches')).toBe('0');
});

test('counts the archive once there is one', async ({ page }) => {
  await page.goto('./#/tournaments');
  await page.getByRole('button', { name: 'Demo-Turnier anlegen' }).click();
  await expect(page.getByRole('link', { name: /Meridian Invitational/ })).toBeVisible();

  await page.getByRole('link', { name: 'Dashboard' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

  // Whatever the demo contains, the figures describe it rather than reading zero.
  expect(Number(await figure(page, 'Erfasste Teams'))).toBeGreaterThan(0);
});
