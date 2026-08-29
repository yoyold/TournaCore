import { expect, test, type Page } from '@playwright/test';

/**
 * A team's rating on its own profile, with the line that shows how it got there.
 */

async function openTeam(page: Page, name: string): Promise<void> {
  await page.goto('./#/teams');
  await page.getByRole('link', { name: new RegExp(name) }).click();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
}

test('shows nothing to rate before a match has been played', async ({ page }) => {
  // Saving a new team lands on its profile, so there is nothing to navigate to.
  await page.goto('./#/teams/new');
  await page.getByLabel(/Teamname/).fill('Neonwerk Berlin');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByRole('heading', { name: 'Neonwerk Berlin', level: 1 })).toBeVisible();

  await expect(page.getByText(/Noch keine gewertete Partie/)).toBeVisible();
  await expect(page.getByRole('img', { name: /Elo-Verlauf/ })).toHaveCount(0);
});

test('shows the rating and the line it took to get there', async ({ page }) => {
  await page.goto('./#/tournaments');
  await page.getByRole('button', { name: 'Demo-Turnier anlegen' }).click();
  await expect(page.getByRole('link', { name: /Meridian Invitational/ })).toBeVisible();

  await openTeam(page, 'Ashen Vanguard');

  // The number the leaderboard shows, on the team's own page.
  await page.goto('./#/statistics');
  await page.getByRole('tab', { name: 'Elo-Rangliste' }).click();
  const onBoard = await page
    .getByRole('row')
    .filter({ hasText: 'Ashen Vanguard' })
    .locator('td')
    .nth(2)
    .innerText();

  await openTeam(page, 'Ashen Vanguard');
  await expect(page.getByText(onBoard.trim(), { exact: true }).first()).toBeVisible();

  // Two wins, so two points on the line and a chart that describes itself.
  const chart = page.getByRole('img', { name: /Elo-Verlauf/ });
  await expect(chart).toBeVisible();
  const points = await chart.locator('polyline').getAttribute('points');
  expect(points?.trim().split(' ')).toHaveLength(2);

  // Peak and record are on the card too, so the number has context.
  await expect(page.getByText(/Bestwert:/)).toBeVisible();
});

/** The picture is a summary; the numbers behind it stay readable regardless. */
test('carries the figures behind the line for a screen reader', async ({ page }) => {
  await page.goto('./#/tournaments');
  await page.getByRole('button', { name: 'Demo-Turnier anlegen' }).click();
  await expect(page.getByRole('link', { name: /Meridian Invitational/ })).toBeVisible();

  await openTeam(page, 'Ashen Vanguard');

  const table = page.getByRole('table', { name: 'Elo-Verlauf' });
  await expect(table.locator('tbody tr')).toHaveCount(2);
});
