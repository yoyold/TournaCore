import { expect, test, type Page } from '@playwright/test';

async function createTournament(page: Page, name: string, teams: string[]): Promise<void> {
  await page.goto('./#/tournaments/new');
  await page.getByLabel(/Turniername/).fill(name);
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByLabel(/Teilnehmer \(einer pro Zeile\)/).fill(teams.join('\n'));
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Turnier erstellen' }).click();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
}

async function archive(page: Page): Promise<void> {
  await createTournament(page, 'Winter Masters', [
    'Fnatic, SE',
    'Vici Gaming, CN',
    'Gamma, DE',
    'Delta, US',
  ]);
  await createTournament(page, 'Summer Open', [
    'Fnatic, SE',
    'Alliance, SE',
    'Gamma, DE',
    'Delta, US',
  ]);
}

/** The tournament names the list currently shows. */
async function shown(page: Page): Promise<string[]> {
  const links = await page.getByRole('link', { name: /Masters|Open/ }).allInnerTexts();
  return links.map((entry) => entry.split('\n')[0]?.trim() ?? '').sort();
}

async function search(page: Page, query: string): Promise<string[]> {
  await page.goto('./#/tournaments');

  // Navigating to the hash the page is already on does not remount it, so a
  // previous query would still be filtering the list.
  const box = page.getByLabel('Suchen');
  await box.fill('');
  await expect(page.getByRole('link', { name: /Masters|Open/ })).toHaveCount(2);

  await box.fill(query);
  return shown(page);
}

test('finds a tournament by its name', async ({ page }) => {
  await archive(page);
  expect(await search(page, 'winter')).toEqual(['Winter Masters']);
});

/**
 * The search an archive is actually used for: not "what was this called" but
 * "where did this club play".
 */
test('finds tournaments by a team that took part', async ({ page }) => {
  await archive(page);

  expect(await search(page, 'Vici')).toEqual(['Winter Masters']);
  expect(await search(page, 'Fnatic')).toEqual(['Summer Open', 'Winter Masters']);
});

test('each further word narrows the result', async ({ page }) => {
  await archive(page);

  expect(await search(page, 'Fnatic')).toHaveLength(2);
  expect(await search(page, 'Fnatic Alliance')).toEqual(['Summer Open']);
});

test('says nothing was found rather than looking empty', async ({ page }) => {
  await archive(page);

  expect(await search(page, 'Astralis')).toEqual([]);
  await expect(page.getByText('Nichts gefunden')).toBeVisible();
  // The count tells you the archive is still there, just filtered.
  await expect(page.getByText('0 von 2')).toBeVisible();
});

test('clearing the search brings everything back', async ({ page }) => {
  await archive(page);

  await search(page, 'winter');
  await page.getByLabel('Suchen').fill('');
  expect(await shown(page)).toEqual(['Summer Open', 'Winter Masters']);
});

test('offers no search box before there is anything to search', async ({ page }) => {
  await page.goto('./#/tournaments');
  await expect(page.getByText('Noch keine Turniere')).toBeVisible();
  await expect(page.getByLabel('Suchen')).toHaveCount(0);
});
