import { expect, test, type Page } from '@playwright/test';

/**
 * A tournament announced before its field is known, filled over time and drawn
 * when the organiser says so — the way an event is actually run.
 */

/** The entrants currently in the field, which several counters on the page also report. */
const field = (page: Page) =>
  page.getByRole('list', { name: 'Teilnehmerfeld' }).getByRole('listitem');

/** Creates teams by running one tournament, so the archive has something to pick from. */
async function seedArchive(page: Page): Promise<void> {
  await page.goto('./#/tournaments/new');
  await page.getByLabel(/Turniername/).fill('Seed Cup');
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page
    .getByLabel(/Teilnehmer \(einer pro Zeile\)/)
    .fill('Nova Collective, DE\nIron Meridian, US\nSolstice Nine, SE\nPale Horizon, KR');
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Turnier erstellen' }).click();
  await expect(page.getByRole('heading', { name: 'Seed Cup', level: 1 })).toBeVisible();
}

/** Creates an empty tournament and returns on its page. */
async function openRegistration(page: Page, name: string): Promise<void> {
  await page.goto('./#/tournaments/new');
  await page.getByLabel(/Turniername/).fill(name);
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Turnier erstellen' }).click();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
}

test('fills a field over time and draws it on start', async ({ page }) => {
  await seedArchive(page);
  await openRegistration(page, 'Open Series');

  // Nothing is drawn while the field is being assembled.
  await expect(page.getByRole('group', { name: /Turnierbaum/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Turnier starten' })).toBeDisabled();

  await page.getByRole('checkbox', { name: 'Nova Collective' }).click();
  await expect(field(page)).toHaveCount(1);

  await page.getByRole('checkbox', { name: 'Solstice Nine' }).click();
  await expect(field(page)).toHaveCount(2);

  const start = page.getByRole('button', { name: 'Turnier starten' });
  await expect(start).toBeEnabled();
  await start.click();

  // Drawn from the field, and only now.
  await expect(page.getByRole('group', { name: /Turnierbaum/i })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Turnier starten' })).toHaveCount(0);
});

/** Picking a known team must not mint a second record for the same club. */
test('picking a known team reuses it rather than creating another', async ({ page }) => {
  await seedArchive(page);
  await openRegistration(page, 'Reuse Cup');

  await page.getByRole('checkbox', { name: 'Nova Collective' }).click();
  await expect(field(page)).toHaveCount(1);

  await page.goto('./#/teams');
  await expect(page.getByRole('link', { name: /Nova Collective/ })).toHaveCount(1);
});

test('only the free-text field creates a team', async ({ page }) => {
  await seedArchive(page);
  await openRegistration(page, 'Newcomer Cup');

  await page.getByLabel('Neues Team').fill('Neonwerk Berlin, DE');
  await page.getByRole('button', { name: 'Erstellen' }).click();
  await expect(field(page)).toHaveCount(1);

  await page.goto('./#/teams');
  await expect(page.getByRole('link', { name: /Neonwerk Berlin/ })).toHaveCount(1);
});

test('removes an entrant again', async ({ page }) => {
  await seedArchive(page);
  await openRegistration(page, 'Reversible Cup');

  await page.getByRole('checkbox', { name: 'Iron Meridian' }).click();
  await expect(field(page)).toHaveCount(1);

  await page.getByRole('button', { name: 'Iron Meridian entfernen' }).click();
  await expect(field(page)).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: 'Iron Meridian' })).not.toBeChecked();
});

/** The order of the field is the seeding, so it has to be changeable. */
test('reorders the field before the draw', async ({ page }) => {
  await seedArchive(page);
  await openRegistration(page, 'Seeded Cup');

  await page.getByRole('checkbox', { name: 'Nova Collective' }).click();
  await expect(field(page)).toHaveCount(1);
  await page.getByRole('checkbox', { name: 'Iron Meridian' }).click();
  await expect(field(page)).toHaveCount(2);

  await expect(field(page).first()).toContainText('Nova Collective');

  await page.getByRole('button', { name: 'Iron Meridian nach oben' }).click();
  await expect(field(page).first()).toContainText('Iron Meridian');
});

test('groups the known teams by region', async ({ page }) => {
  await seedArchive(page);

  // Give one of the teams a region, which is what the grouping reads.
  await page.goto('./#/teams');
  await page.getByRole('link', { name: /Nova Collective/ }).click();
  await page.getByRole('button', { name: 'Bearbeiten' }).click();
  await page.getByLabel('Region').fill('EU');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByRole('heading', { name: 'Nova Collective', level: 1 })).toBeVisible();

  await openRegistration(page, 'Regional Cup');

  await expect(page.getByRole('heading', { name: 'EU' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ohne Region' })).toBeVisible();
});

/**
 * Status is editable, and a result names a position in the draw rather than a
 * pairing. Reopening a played tournament and changing its field would quietly
 * reassign every result to whoever now stands in that position.
 */
test('will not reopen the field of a tournament that has results', async ({ page }) => {
  await page.goto('./#/tournaments');
  await page.getByRole('button', { name: 'Demo-Turnier anlegen' }).click();
  await page.getByRole('link', { name: /Meridian Invitational/ }).click();
  await expect(page.getByRole('group', { name: /Turnierbaum/i })).toBeVisible();

  await page.getByRole('button', { name: 'Bearbeiten' }).click();
  await page.getByLabel('Status').selectOption({ label: 'Anmeldung' });
  await page.getByRole('button', { name: 'Speichern' }).click();

  await expect(page.getByRole('group', { name: /Turnierbaum/i })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Turnier starten' })).toHaveCount(0);
});
