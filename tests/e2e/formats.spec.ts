import { expect, test, type Page } from '@playwright/test';

const TEAMS = [
  'Nova Collective, DE',
  'Iron Meridian, US',
  'Solstice Nine, SE',
  'Pale Horizon, KR',
  'Verdant Order, FR',
  'Cobalt Drift, CA',
  'Ashen Vanguard, BR',
  'Quiet Static, PL',
].join('\n');

async function startWizard(page: Page, name: string, teams = TEAMS) {
  await page.goto('./#/tournaments/new');
  await page.getByLabel(/Turniername/).fill(name);
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByLabel(/Teilnehmer \(einer pro Zeile\)/).fill(teams);
  await page.getByRole('button', { name: 'Weiter' }).click();
}

async function finish(page: Page, name: string) {
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Turnier erstellen' }).click();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
}

test('creates a league and shows a table instead of a bracket', async ({ page }) => {
  await startWizard(page, 'Winter League');

  await page.getByRole('radio', { name: /Liga \/ Round Robin/ }).check();
  await finish(page, 'Winter League');

  // A league has no bracket to draw: nothing advances.
  await expect(page.getByRole('group', { name: /Turnierbaum/i })).toHaveCount(0);

  const table = page.getByRole('table');
  await expect(table).toBeVisible();
  // Eight participants, all on zero points to start with.
  await expect(table.locator('tbody tr')).toHaveCount(8);

  // Eight teams play 28 fixtures over seven rounds.
  await expect(page.getByText('Runde 1')).toBeVisible();
  await expect(page.getByText('Runde 7')).toBeVisible();
});

test('doubles the schedule for home and away', async ({ page }) => {
  await startWizard(page, 'Double League');

  await page.getByRole('radio', { name: /Liga \/ Round Robin/ }).check();
  await page.getByRole('radio', { name: /Hin- und Rückrunde/ }).check();
  await finish(page, 'Double League');

  // Fourteen rounds rather than seven.
  await expect(page.getByText('Runde 14')).toBeVisible();
});

test('creates a group stage with one table per group', async ({ page }) => {
  await startWizard(page, 'Group Cup');

  await page.getByRole('radio', { name: /Gruppenphase/ }).check();
  await page.getByLabel(/Anzahl Gruppen/).fill('2');
  await page.getByLabel(/Qualifiziert je Gruppe/).fill('0');
  await finish(page, 'Group Cup');

  await expect(page.getByText('Gruppe A')).toBeVisible();
  await expect(page.getByText('Gruppe B')).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(2);
});

/**
 * The composition the engine was designed for. Two stages linked by a seeding
 * rule, with neither format knowing the other exists.
 */
test('creates a group stage feeding a knockout', async ({ page }) => {
  await startWizard(page, 'Combined Cup');

  await page.getByRole('radio', { name: /Gruppenphase/ }).check();
  await page.getByLabel(/Anzahl Gruppen/).fill('2');
  await page.getByLabel(/Qualifiziert je Gruppe/).fill('2');
  await finish(page, 'Combined Cup');

  // Two stages, so the tournament shows tabs.
  await expect(page.getByRole('tab', { name: 'Group Stage' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Playoffs' })).toBeVisible();

  // Qualifying places are marked in the group tables.
  await expect(page.getByText('Quali').first()).toBeVisible();

  // The playoff bracket exists but is still waiting on the groups.
  await page.getByRole('tab', { name: 'Playoffs' }).click();
  await expect(page.getByRole('group', { name: /Turnierbaum/i })).toBeVisible();
});

test('records a league result and updates the table', async ({ page }) => {
  await startWizard(page, 'Table Cup', 'Alpha, DE\nBeta, US\nGamma, SE\nDelta, KR');

  await page.getByRole('radio', { name: /Liga \/ Round Robin/ }).check();
  await finish(page, 'Table Cup');

  // Every fixture starts level on zero.
  const table = page.getByRole('table');
  await expect(table.locator('tbody tr')).toHaveCount(4);

  // Enter the first fixture. The wizard defaults to best-of-three, so one map
  // leaves the series open and awards nothing — both have to be recorded.
  await page.getByRole('button', { name: /gegen/ }).first().click();
  const scores = page.getByRole('spinbutton');
  await scores.nth(0).fill('13');
  await scores.nth(1).fill('7');
  await page.getByRole('button', { name: 'Map hinzufügen' }).click();
  await page.getByRole('spinbutton').nth(2).fill('13');
  await page.getByRole('spinbutton').nth(3).fill('9');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByRole('dialog', { name: 'Ergebnis eintragen' })).toHaveCount(0);

  // The table now shows a winner on three points, derived from that one result.
  await expect(table.locator('tbody tr').first()).toContainText('3');
});
