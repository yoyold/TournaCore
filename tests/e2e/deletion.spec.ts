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

test('deletes a tournament after confirming its name', async ({ page }) => {
  await createTournament(page, 'Doomed Cup');

  await page.getByRole('button', { name: 'Löschen' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();

  // Confirming stays disabled until the name is typed out: a stray click must
  // not be enough to destroy a tournament.
  const confirm = dialog.getByRole('button', { name: 'Endgültig löschen' });
  await expect(confirm).toBeDisabled();

  await dialog.getByRole('textbox').fill('Doomed Cup');
  await expect(confirm).toBeEnabled();
  await confirm.click();

  await expect(page.getByRole('heading', { name: 'Turniere', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: /Doomed Cup/ })).toHaveCount(0);
});

test('a cancelled deletion changes nothing', async ({ page }) => {
  await createTournament(page, 'Safe Cup');

  await page.getByRole('button', { name: 'Löschen' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Abbrechen' }).click();

  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Safe Cup', level: 1 })).toBeVisible();
});

test('escape closes the confirmation without deleting', async ({ page }) => {
  await createTournament(page, 'Escape Cup');

  await page.getByRole('button', { name: 'Löschen' }).click();
  await page.keyboard.press('Escape');

  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Escape Cup', level: 1 })).toBeVisible();
});

test('deletes a team and warns about the tournaments that reference it', async ({ page }) => {
  await createTournament(page, 'Reference Cup');

  await page.goto('./#/teams');
  await page.getByRole('link', { name: /Nova Collective/ }).click();
  await page.getByRole('button', { name: 'Bearbeiten' }).click();
  await page.getByRole('button', { name: 'Löschen' }).click();

  const dialog = page.getByRole('alertdialog');
  // The consequence is spelled out rather than left as a surprise.
  await expect(dialog).toContainText('1 Turnieren');
  await expect(dialog).toContainText('Archivieren');

  await dialog.getByRole('textbox').fill('Nova Collective');
  await dialog.getByRole('button', { name: 'Endgültig löschen' }).click();

  await expect(page.getByRole('heading', { name: 'Teams', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: /Nova Collective/ })).toHaveCount(0);
});

/**
 * Deleting a team leaves its tournaments standing. Rewriting a played bracket to
 * remove a participant would silently change history; showing an unknown name is
 * honest about what happened.
 */
test('a tournament survives the deletion of one of its teams', async ({ page }) => {
  await createTournament(page, 'Survivor Cup');

  await page.goto('./#/teams');
  await page.getByRole('link', { name: /Pale Horizon/ }).click();
  await page.getByRole('button', { name: 'Bearbeiten' }).click();
  await page.getByRole('button', { name: 'Löschen' }).click();
  const dialog = page.getByRole('alertdialog');
  await dialog.getByRole('textbox').fill('Pale Horizon');
  await dialog.getByRole('button', { name: 'Endgültig löschen' }).click();
  // Wait for the app's own navigation to settle before moving on, otherwise it
  // overwrites the next one.
  await expect(page.getByRole('heading', { name: 'Teams', level: 1 })).toBeVisible();

  await page.getByRole('navigation').getByRole('link', { name: 'Turniere' }).click();
  await page.getByRole('link', { name: /Survivor Cup/ }).click();

  await expect(page.getByRole('heading', { name: 'Survivor Cup', level: 1 })).toBeVisible();
  await expect(page.getByRole('group', { name: /Turnierbaum/i })).toBeVisible();
  await expect(page.getByText('Unbekanntes Team').first()).toBeVisible();
});
