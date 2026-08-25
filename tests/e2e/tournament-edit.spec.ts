import { expect, test, type Page } from '@playwright/test';

async function createTournament(page: Page, name: string): Promise<void> {
  await page.goto('./#/tournaments/new');
  await page.getByLabel(/Turniername/).fill(name);
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page
    .getByLabel(/Teilnehmer \(einer pro Zeile\)/)
    .fill('Alpha, DE\nBeta, US\nGamma, SE\nDelta, KR');
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Turnier erstellen' }).click();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
}

async function edit(page: Page, name: string): Promise<void> {
  await page.goto('./#/tournaments');
  await page
    .getByRole('link', { name: new RegExp(name) })
    .first()
    .click();
  await page.getByRole('button', { name: 'Bearbeiten' }).click();
  await expect(page.getByRole('heading', { name: 'Turnier bearbeiten', level: 1 })).toBeVisible();
}

/**
 * Saves and waits for the page it returns to.
 *
 * Navigating straight after the click races the write: the form only leaves the
 * page once the tournament is stored, so arriving back on the detail page is
 * what says the save actually happened.
 */
async function save(page: Page, expectedName: string): Promise<void> {
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByRole('heading', { name: expectedName, level: 1 })).toBeVisible();
}

async function listed(page: Page, expected: number): Promise<string[]> {
  await page.goto('./#/tournaments');
  await expect(page.getByRole('link', { name: /Cup/ })).toHaveCount(expected);
  const links = await page.getByRole('link', { name: /Cup/ }).allInnerTexts();
  return links.map((entry) => entry.split('\n')[0]?.trim() ?? '');
}

test('opens with the tournament as it stands', async ({ page }) => {
  await createTournament(page, 'Alpha Cup');
  await edit(page, 'Alpha Cup');

  await expect(page.getByLabel(/Turniername/)).toHaveValue('Alpha Cup');
  // Dated today, because that is when it was created.
  await expect(page.getByLabel('Datum')).toHaveValue(new Date().toISOString().slice(0, 10));
});

/**
 * The reason this exists. A Challonge bracket carries no date, so an imported
 * archive lands on the day it was imported and reads in the wrong order until
 * the real dates are entered.
 */
test('re-dating a tournament moves it in the list', async ({ page }) => {
  await createTournament(page, 'Alpha Cup');
  await createTournament(page, 'Bravo Cup');

  expect(await listed(page, 2)).toEqual(['Bravo Cup', 'Alpha Cup']);

  await edit(page, 'Bravo Cup');
  await page.getByLabel('Datum').fill('2016-03-05');
  await save(page, 'Bravo Cup');

  expect(await listed(page, 2)).toEqual(['Alpha Cup', 'Bravo Cup']);
});

test('keeps what was entered', async ({ page }) => {
  await createTournament(page, 'Alpha Cup');

  await edit(page, 'Alpha Cup');
  await page.getByLabel(/Turniername/).fill('Renamed Cup');
  await page.getByLabel('Datum').fill('2019-07-20');
  await page.getByLabel('Status').selectOption('completed');
  await page.getByLabel(/Veranstalter/).fill('Old Masters');
  await save(page, 'Renamed Cup');

  await edit(page, 'Renamed Cup');
  await expect(page.getByLabel(/Turniername/)).toHaveValue('Renamed Cup');
  await expect(page.getByLabel('Datum')).toHaveValue('2019-07-20');
  await expect(page.getByLabel('Status')).toHaveValue('completed');
  await expect(page.getByLabel(/Veranstalter/)).toHaveValue('Old Masters');
});

test('a cancelled edit changes nothing', async ({ page }) => {
  await createTournament(page, 'Alpha Cup');

  await edit(page, 'Alpha Cup');
  await page.getByLabel(/Turniername/).fill('Should Not Stick');
  await page.getByRole('button', { name: 'Abbrechen' }).click();

  await expect(page.getByRole('heading', { name: 'Alpha Cup', level: 1 })).toBeVisible();
});

/** Editing the description must not disturb the bracket it describes. */
test('leaves the results alone', async ({ page }) => {
  await createTournament(page, 'Alpha Cup');

  // Record one result, then rename the tournament around it.
  await page.getByRole('button', { name: /gegen/ }).first().click();
  const scores = page.getByRole('spinbutton');
  await scores.nth(0).fill('13');
  await scores.nth(1).fill('7');
  await page.getByRole('button', { name: 'Map hinzufügen' }).click();
  await page.getByRole('spinbutton').nth(2).fill('13');
  await page.getByRole('spinbutton').nth(3).fill('9');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByRole('dialog', { name: 'Ergebnis eintragen' })).toHaveCount(0);

  await edit(page, 'Alpha Cup');
  await page.getByLabel('Datum').fill('2016-03-05');
  await save(page, 'Alpha Cup');

  // The bracket still shows a decided match.
  await expect(page.getByRole('group', { name: /Turnierbaum/i })).toBeVisible();
  await expect(page.getByText('Beendet').first()).toBeVisible();
});
