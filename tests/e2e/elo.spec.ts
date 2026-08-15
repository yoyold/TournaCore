import { expect, test, type Page } from '@playwright/test';

async function createTournament(page: Page, name: string) {
  await page.goto('./#/tournaments/new');
  await page.getByLabel(/Turniername/).fill(name);
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page
    .getByLabel(/Teilnehmer \(einer pro Zeile\)/)
    .fill('Nova Collective, DE\nIron Meridian, US\nSolstice Nine, SE\nPale Horizon, KR');
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Turnier erstellen' }).click();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
}

/** Records a two-nil result on the match whose accessible name matches. */
async function recordWin(page: Page, matchName: RegExp) {
  await page.getByRole('button', { name: matchName }).click();
  const scores = page.getByRole('spinbutton');
  await scores.nth(0).fill('13');
  await scores.nth(1).fill('7');
  await page.getByRole('button', { name: 'Map hinzufügen' }).click();
  await page.getByRole('spinbutton').nth(2).fill('13');
  await page.getByRole('spinbutton').nth(3).fill('9');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByRole('dialog', { name: 'Ergebnis eintragen' })).toHaveCount(0);
}

test('the elo tab is empty until matches have been played', async ({ page }) => {
  await page.goto('./#/statistics');
  await page.getByRole('tab', { name: 'Elo-Rangliste' }).click();

  await expect(page.getByText('Noch keine Elo-Wertung')).toBeVisible();
});

/**
 * The rating has to come out of real results, so this plays a match rather than
 * asserting against seeded numbers.
 */
test('a played match produces an elo ranking', async ({ page }) => {
  await createTournament(page, 'Elo Cup');

  // Seeding for four is [1, 4, 3, 2], so this pairs Nova against Pale Horizon.
  await recordWin(page, /Nova Collective gegen Pale Horizon/);

  await page.getByRole('navigation').getByRole('link', { name: 'Statistiken' }).click();
  await page.getByRole('tab', { name: 'Elo-Rangliste' }).click();

  const table = page.getByRole('table');
  await expect(table).toBeVisible();

  // Both sides are rated, and the exchange is symmetric around the 1000 start:
  // the winner gains exactly what the loser drops.
  const winnerRow = table.getByRole('row').filter({ hasText: 'Nova Collective' });
  const loserRow = table.getByRole('row').filter({ hasText: 'Pale Horizon' });

  await expect(winnerRow).toContainText('1016');
  await expect(winnerRow).toContainText('+16');
  await expect(loserRow).toContainText('984');
  await expect(loserRow).toContainText('-16');

  // The stronger team is listed first.
  const firstRow = table.locator('tbody tr').first();
  await expect(firstRow).toContainText('Nova Collective');
});

test('marks a thin rating as provisional', async ({ page }) => {
  await createTournament(page, 'Provisional Cup');
  await recordWin(page, /Nova Collective gegen Pale Horizon/);

  await page.goto('./#/statistics');
  await page.getByRole('tab', { name: 'Elo-Rangliste' }).click();

  // One match is far short of the threshold, so every entry carries the caveat.
  await expect(page.getByText('vorläufig').first()).toBeVisible();
});

/**
 * Ratings are derived, so correcting a result must reorder the table without any
 * separate recalculation step.
 */
test('correcting a result flips the ranking', async ({ page }) => {
  await createTournament(page, 'Correction Cup');
  await recordWin(page, /Nova Collective gegen Pale Horizon/);

  // Reopen the same match and hand the win to the other side.
  await page.getByRole('button', { name: /Nova Collective gegen Pale Horizon/ }).click();
  const scores = page.getByRole('spinbutton');
  await scores.nth(0).fill('7');
  await scores.nth(1).fill('13');
  await scores.nth(2).fill('9');
  await scores.nth(3).fill('13');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByRole('dialog', { name: 'Ergebnis eintragen' })).toHaveCount(0);

  await page.getByRole('navigation').getByRole('link', { name: 'Statistiken' }).click();
  await page.getByRole('tab', { name: 'Elo-Rangliste' }).click();

  const firstRow = page.getByRole('table').locator('tbody tr').first();
  await expect(firstRow).toContainText('Pale Horizon');
  await expect(firstRow).toContainText('1016');
});
