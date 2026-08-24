import { expect, test, type Page } from '@playwright/test';

/** A four-team bracket, played through with side A always winning. */
async function cup(page: Page, name: string, teams: string[]): Promise<void> {
  await page.goto('./#/tournaments/new');
  await page.getByLabel(/Turniername/).fill(name);
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByLabel(/Teilnehmer \(einer pro Zeile\)/).fill(teams.join('\n'));
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Turnier erstellen' }).click();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();

  for (let i = 0; i < 3; i += 1) {
    const next = page.getByRole('button', { name: /gegen/ }).first();
    if ((await next.count()) === 0) break;
    await next.click();
    const scores = page.getByRole('spinbutton');
    await scores.nth(0).fill('13');
    await scores.nth(1).fill('7');
    await page.getByRole('button', { name: 'Map hinzufügen' }).click();
    await page.getByRole('spinbutton').nth(2).fill('13');
    await page.getByRole('spinbutton').nth(3).fill('9');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByRole('dialog', { name: 'Ergebnis eintragen' })).toHaveCount(0);
  }
}

/** The same club under two names, one year apart. */
async function twoYears(page: Page): Promise<void> {
  await cup(page, 'Cup 2023', ['Quantic Gaming, DE', 'Beta, US', 'Gamma, SE', 'Delta, KR']);
  await cup(page, 'Cup 2024', ['Vici Gaming, DE', 'Beta, US', 'Gamma, SE', 'Delta, KR']);
}

async function merge(page: Page, into: string, source: string): Promise<void> {
  await page.goto('./#/teams');
  await page
    .getByRole('link', { name: new RegExp(into) })
    .first()
    .click();
  await page.getByRole('button', { name: 'Bearbeiten' }).click();

  await page.getByLabel('Welches Team soll aufgehen in diesem?').selectOption({ label: source });
  await page.getByRole('button', { name: 'Zusammenführen', exact: true }).click();

  const dialog = page.getByRole('alertdialog');
  await dialog.getByRole('textbox').fill(source);
  await dialog.getByRole('button', { name: 'Endgültig zusammenführen' }).click();
  await expect(dialog).toHaveCount(0);
}

/**
 * What merging is for. A club that renamed itself has its record split across
 * two names; folding them together has to add the history up without touching a
 * single result.
 */
test('merging two teams combines their history', async ({ page }) => {
  await twoYears(page);
  await merge(page, 'Vici Gaming', 'Quantic Gaming');

  await page.goto('./#/teams');
  await page
    .getByRole('link', { name: /Vici Gaming/ })
    .first()
    .click();

  // Two matches now, one from each year, and both tournaments listed.
  await expect(page.getByText('Cup 2023')).toBeVisible();
  await expect(page.getByText('Cup 2024')).toBeVisible();
});

test('the team it was folded into keeps its name and gains the old one', async ({ page }) => {
  await twoYears(page);
  await merge(page, 'Vici Gaming', 'Quantic Gaming');

  await page.goto('./#/teams');
  await page
    .getByRole('link', { name: /Vici Gaming/ })
    .first()
    .click();

  await expect(page.getByRole('heading', { name: 'Vici Gaming', level: 1 })).toBeVisible();
  // The old name stays visible, or the older results look misfiled.
  await expect(page.getByText(/Quantic Gaming/)).toBeVisible();
});

test('the merged team disappears from the list', async ({ page }) => {
  await twoYears(page);
  await merge(page, 'Vici Gaming', 'Quantic Gaming');

  await page.goto('./#/teams');
  await expect(page.getByRole('link', { name: /Quantic Gaming/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Vici Gaming/ })).toHaveCount(1);
});

/** Nothing is written until the name is typed out — a merge is not undoable. */
test('a cancelled merge changes nothing', async ({ page }) => {
  await twoYears(page);

  await page.goto('./#/teams');
  await page
    .getByRole('link', { name: /Vici Gaming/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Bearbeiten' }).click();

  await page
    .getByLabel('Welches Team soll aufgehen in diesem?')
    .selectOption({ label: 'Quantic Gaming' });
  await page.getByRole('button', { name: 'Zusammenführen', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Abbrechen' }).click();

  await page.goto('./#/teams');
  await expect(page.getByRole('link', { name: /Quantic Gaming/ })).toHaveCount(1);
});

test('says what a merge will move before it happens', async ({ page }) => {
  await twoYears(page);

  await page.goto('./#/teams');
  await page
    .getByRole('link', { name: /Vici Gaming/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Bearbeiten' }).click();
  await page
    .getByLabel('Welches Team soll aufgehen in diesem?')
    .selectOption({ label: 'Quantic Gaming' });

  await expect(page.getByText(/wandern zu/)).toBeVisible();
});
