import { expect, test, type Page } from '@playwright/test';

/**
 * Regions across the three lists that read them: the archive, the picker and
 * the Elo board.
 */

async function seedArchive(page: Page): Promise<void> {
  await page.goto('./#/tournaments/new');
  await page.getByLabel(/Turniername/).fill('Region Cup');
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page
    .getByLabel(/Teilnehmer \(einer pro Zeile\)/)
    .fill('Nova Collective, DE\nIron Meridian, US\nSolstice Nine, SE\nPale Horizon, KR');
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Turnier erstellen' }).click();
  await expect(page.getByRole('heading', { name: 'Region Cup', level: 1 })).toBeVisible();
}

async function setRegion(page: Page, team: string, region: string): Promise<void> {
  await page.goto('./#/teams');
  await page.getByRole('link', { name: new RegExp(team) }).click();
  await page.getByRole('button', { name: 'Bearbeiten' }).click();
  await page.getByLabel('Region').fill(region);
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByRole('heading', { name: team, level: 1 })).toBeVisible();
}

/** Two regions and a team without one, which is the arrangement worth testing. */
async function withRegions(page: Page): Promise<void> {
  await seedArchive(page);
  await setRegion(page, 'Nova Collective', 'EU');
  await setRegion(page, 'Solstice Nine', 'EU');
  await setRegion(page, 'Iron Meridian', 'NA');
}

test('groups the archive by region, unassigned last', async ({ page }) => {
  await withRegions(page);
  await page.goto('./#/teams');

  // The headings are styled uppercase, which is what innerText reports.
  const headings = await page.getByRole('heading', { level: 2 }).allInnerTexts();
  expect(headings.map((entry) => entry.toUpperCase())).toEqual(['EU', 'NA', 'OHNE REGION']);
});

test('narrows the archive to one region', async ({ page }) => {
  await withRegions(page);
  await page.goto('./#/teams');

  await page.getByLabel('Region').selectOption({ label: 'NA' });
  await expect(page.getByRole('link', { name: /Iron Meridian/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Nova Collective/ })).toHaveCount(0);

  // With one region left there is nothing to separate, so the heading goes.
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(0);
});

test('selects the teams that have no region', async ({ page }) => {
  await withRegions(page);
  await page.goto('./#/teams');

  await page.getByLabel('Region').selectOption({ label: 'Ohne Region' });
  await expect(page.getByRole('link', { name: /Pale Horizon/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Nova Collective/ })).toHaveCount(0);
});

/**
 * The rank shown is the one on the whole board: a team is eleventh overall
 * whether or not the ten above it are on screen.
 */
test('filters the Elo board without renumbering it', async ({ page }) => {
  // The demo tournament is the shortest way to a board with results on it, and
  // its teams already carry the regions this is about.
  await page.goto('./#/tournaments');
  await page.getByRole('button', { name: 'Demo-Turnier anlegen' }).click();
  await expect(page.getByRole('link', { name: /Meridian Invitational/ })).toBeVisible();

  await page.goto('./#/statistics');
  await page.getByRole('tab', { name: 'Elo-Rangliste' }).click();

  const rankOf = async (team: string): Promise<string> =>
    (
      await page.getByRole('row').filter({ hasText: team }).locator('td').first().innerText()
    ).trim();

  const before = await rankOf('Iron Meridian');
  expect(before).not.toBe('1');

  await page.getByLabel('Region').selectOption({ label: 'NA' });
  await expect(page.getByRole('row').filter({ hasText: 'Nova Collective' })).toHaveCount(0);
  expect(await rankOf('Iron Meridian')).toBe(before);
});

/** A filter that could only ever return everything is noise. */
test('offers no region filter while no team has one', async ({ page }) => {
  await seedArchive(page);
  await page.goto('./#/teams');

  await expect(page.getByRole('link', { name: /Nova Collective/ })).toBeVisible();
  await expect(page.getByLabel('Region')).toHaveCount(0);
});
