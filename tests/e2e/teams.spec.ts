import { expect, test, type Page } from '@playwright/test';

/** Runs the wizard so a tournament with real teams exists. */
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

test('teams created by the wizard appear in the team database', async ({ page }) => {
  await createTournament(page, 'Team Flow Cup');

  await page.getByRole('navigation').getByRole('link', { name: 'Teams' }).click();
  await expect(page.getByRole('heading', { name: 'Teams', level: 1 })).toBeVisible();

  for (const name of ['Nova Collective', 'Iron Meridian', 'Solstice Nine', 'Pale Horizon']) {
    await expect(page.getByRole('link', { name: new RegExp(name) })).toBeVisible();
  }
});

test('filters the team list by name', async ({ page }) => {
  await createTournament(page, 'Filter Cup');
  await page.goto('./#/teams');

  await page.getByRole('searchbox', { name: 'Suchen' }).fill('nova');

  await expect(page.getByRole('link', { name: /Nova Collective/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Iron Meridian/ })).toHaveCount(0);
});

/**
 * The point of the whole feature: statistics are derived, not stored. Entering a
 * result must show up on the team profile with no separate update step.
 */
test('a recorded result shows up on the team profile', async ({ page }) => {
  await createTournament(page, 'Stats Cup');

  // Record the first semifinal: seeding for four is [1, 4, 3, 2], so this is
  // Nova Collective against Pale Horizon.
  await page.getByRole('button', { name: /Nova Collective gegen Pale Horizon/ }).click();
  const scores = page.getByRole('spinbutton');
  await scores.nth(0).fill('13');
  await scores.nth(1).fill('7');
  await page.getByRole('button', { name: 'Map hinzufügen' }).click();
  await page.getByRole('spinbutton').nth(2).fill('13');
  await page.getByRole('spinbutton').nth(3).fill('9');
  await page.getByRole('button', { name: 'Speichern' }).click();
  // Wait for the sheet to close, otherwise the next navigation races the save.
  await expect(page.getByRole('dialog', { name: 'Ergebnis eintragen' })).toHaveCount(0);

  // The winner's profile reflects it without any recomputation step.
  await page.getByRole('navigation').getByRole('link', { name: 'Teams' }).click();
  await page.getByRole('link', { name: /Nova Collective/ }).click();

  await expect(page.getByRole('heading', { name: 'Nova Collective', level: 1 })).toBeVisible();
  await expect(page.getByText('100%')).toBeVisible();
  // Both maps went to Nova, so the tally is 2-0. It proves the per-map scores
  // were attributed to the right side rather than mirrored.
  await expect(page.getByText('2–0', { exact: true })).toBeVisible();

  // Both derived lists — match history and head-to-head — name the opponent.
  await expect(page.getByRole('link', { name: 'Pale Horizon' })).toHaveCount(2);
});

test('creates a team by hand and edits it', async ({ page }) => {
  await page.goto('./#/teams/new');

  await page.getByLabel(/Teamname/).fill('Handmade Squad');
  // The tag is derived while it has not been taken over by the user.
  await expect(page.getByLabel(/Kürzel/)).toHaveValue('HS');
  await page.getByLabel(/Land/).fill('FR');
  await page.getByRole('button', { name: 'Speichern' }).click();

  await expect(page.getByRole('heading', { name: 'Handmade Squad', level: 1 })).toBeVisible();

  await page.getByRole('button', { name: 'Bearbeiten' }).click();
  await page.getByLabel(/Region/).fill('EU');
  await page.getByRole('button', { name: 'Speichern' }).click();

  await expect(page.getByRole('heading', { name: 'Handmade Squad', level: 1 })).toBeVisible();
  await expect(page.getByText('HS · EU')).toBeVisible();
});

test('archives a team, hiding it from the list until asked for', async ({ page }) => {
  await page.goto('./#/teams/new');
  await page.getByLabel(/Teamname/).fill('Retired Roster');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await page.getByRole('button', { name: 'Bearbeiten' }).click();
  await page.getByRole('button', { name: 'Archivieren' }).click();

  await expect(page.getByRole('heading', { name: 'Teams', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: /Retired Roster/ })).toHaveCount(0);

  // Archiving hides rather than deletes, so match history keeps resolving.
  await page.getByRole('checkbox', { name: /Archivierte anzeigen/ }).check();
  await expect(page.getByRole('link', { name: /Retired Roster/ })).toBeVisible();
});
