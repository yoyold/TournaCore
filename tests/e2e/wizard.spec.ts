import { expect, test } from '@playwright/test';

/**
 * The full create-a-tournament path, end to end.
 *
 * Also guards the route ranking: `/tournaments/new` must resolve to the wizard
 * rather than being swallowed by `/tournaments/:id` with id "new".
 */
test('creates a tournament through the wizard and lands on its bracket', async ({ page }) => {
  await page.goto('./#/tournaments/new');
  await expect(page.getByRole('heading', { name: 'Neues Turnier', level: 1 })).toBeVisible();

  // Step 1 — basics.
  await page.getByLabel(/Turniername/).fill('Playwright Cup');
  await page.getByRole('button', { name: 'Weiter' }).click();

  // Step 2 — participants. Five teams, so the bracket pads to eight with byes.
  await page
    .getByLabel(/Teilnehmer \(einer pro Zeile\)/)
    .fill(
      'Nova Collective, DE\nIron Meridian, US\nSolstice Nine, SE\nPale Horizon, KR\nVerdant Order, FR',
    );
  await expect(page.getByText('5 Teilnehmer')).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();

  // Step 3 — format defaults are fine.
  await page.getByRole('button', { name: 'Weiter' }).click();

  // Step 4 — preview shows the bracket, then create.
  await expect(page.getByRole('group', { name: /Turnierbaum/i })).toBeVisible();
  await page.getByRole('button', { name: 'Turnier erstellen' }).click();

  // Landed on the new tournament, built from what the wizard assembled.
  await expect(page.getByRole('heading', { name: 'Playwright Cup', level: 1 })).toBeVisible();
  await expect(page.getByText('5 Teilnehmer')).toBeVisible();

  // The teams entered are placed in the bracket, and byes exist for the odd count.
  const bracket = page.getByRole('group', { name: /Turnierbaum/i });
  await expect(bracket.getByText('Nova Collective').first()).toBeVisible();
  await expect(bracket.getByText('Freilos').first()).toBeVisible();
});

test('will not advance past the basics without a name', async ({ page }) => {
  await page.goto('./#/tournaments/new');
  // The step gate keeps a nameless tournament from proceeding.
  await expect(page.getByRole('button', { name: 'Weiter' })).toBeDisabled();
});

test('will not advance past participants with fewer than two teams', async ({ page }) => {
  await page.goto('./#/tournaments/new');
  await page.getByLabel(/Turniername/).fill('Solo Cup');
  await page.getByRole('button', { name: 'Weiter' }).click();

  await page.getByLabel(/Teilnehmer \(einer pro Zeile\)/).fill('Only One Team');
  await expect(page.getByRole('button', { name: 'Weiter' })).toBeDisabled();
});
