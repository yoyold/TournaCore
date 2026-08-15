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

/** Wipes the local database, standing in for a new device or a lost profile. */
async function wipeStorage(page: Page) {
  await page.evaluate(async () => {
    const databases = await indexedDB.databases();
    await Promise.all(
      databases.map(
        (entry) =>
          new Promise<void>((resolve) => {
            if (entry.name === undefined) {
              resolve();
              return;
            }
            const request = indexedDB.deleteDatabase(entry.name);
            request.onsuccess = () => {
              resolve();
            };
            request.onerror = () => {
              resolve();
            };
            request.onblocked = () => {
              resolve();
            };
          }),
      ),
    );
  });
  await page.reload();
}

/**
 * The whole point of the feature: without a server this is the only backup, so
 * an export has to be able to bring everything back.
 */
test('exports data and restores it into an empty database', async ({ page }) => {
  await createTournament(page, 'Backup Cup');

  await page.getByRole('navigation').getByRole('link', { name: 'Import / Export' }).click();
  await expect(page.getByRole('heading', { name: 'Import / Export', level: 1 })).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Als JSON exportieren' }).click();
  const file = await download;

  // The filename carries the date so backups sort naturally.
  expect(file.suggestedFilename()).toMatch(/^tournacore-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await file.path();

  await wipeStorage(page);

  // Everything is gone.
  await page.goto('./#/tournaments');
  await expect(page.getByText('Noch keine Turniere')).toBeVisible();

  await page.goto('./#/transfer');
  await page.getByLabel('Datei auswählen').setInputFiles(path);

  // The preview reports what the file holds before anything is applied.
  await expect(page.getByText('Vorschau')).toBeVisible();
  await expect(page.getByText('1 Turniere')).toBeVisible();
  await expect(page.getByText('4 Teams')).toBeVisible();

  await page.getByRole('button', { name: 'Import durchführen' }).click();
  await expect(page.getByText('Import erfolgreich abgeschlossen.')).toBeVisible();

  // The tournament is back, with its teams.
  await page.goto('./#/tournaments');
  await expect(page.getByRole('link', { name: /Backup Cup/ })).toBeVisible();

  await page.goto('./#/teams');
  await expect(page.getByRole('link', { name: /Nova Collective/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Pale Horizon/ })).toBeVisible();
});

test('rejects a file that is not valid JSON, without touching stored data', async ({ page }) => {
  await createTournament(page, 'Untouched Cup');
  await page.goto('./#/transfer');

  await page.getByLabel('Datei auswählen').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('this is not json'),
  });

  await expect(page.getByRole('alert')).toContainText('kein gültiges JSON');
  // No preview, so nothing can be confirmed.
  await expect(page.getByRole('button', { name: 'Import durchführen' })).toHaveCount(0);

  await page.goto('./#/tournaments');
  await expect(page.getByRole('link', { name: /Untouched Cup/ })).toBeVisible();
});

test('refuses a file from a newer schema version', async ({ page }) => {
  await page.goto('./#/transfer');

  await page.getByLabel('Datei auswählen').setInputFiles({
    name: 'future.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        schemaVersion: 99,
        exportedAt: '2026-01-01T00:00:00.000Z',
        appName: 'TournaCore',
        data: { games: [], teams: [], tournaments: [], stages: [], matches: [] },
      }),
    ),
  });

  await expect(page.getByRole('alert')).toContainText('neueren Version');
});

test('rejects a structurally invalid file whole', async ({ page }) => {
  await page.goto('./#/transfer');

  await page.getByLabel('Datei auswählen').setInputFiles({
    name: 'malformed.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        exportedAt: '2026-01-01T00:00:00.000Z',
        appName: 'TournaCore',
        // A team missing every required field.
        data: { games: [], teams: [{ id: 'x' }], tournaments: [], stages: [], matches: [] },
      }),
    ),
  });

  await expect(page.getByRole('alert')).toContainText('Aufbau der Datei passt nicht');
});

/** Merge keeps what is already there; replace does not. */
test('merges an import into existing data', async ({ page }) => {
  await createTournament(page, 'First Cup');

  await page.goto('./#/transfer');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Als JSON exportieren' }).click();
  const path = await (await download).path();

  // A second tournament that is not in the exported file.
  await createTournament(page, 'Second Cup');

  await page.goto('./#/transfer');
  await page.getByLabel('Datei auswählen').setInputFiles(path);
  await page.getByRole('radio', { name: /Zusammenführen/ }).check();
  await page.getByRole('button', { name: 'Import durchführen' }).click();
  await expect(page.getByText('Import erfolgreich abgeschlossen.')).toBeVisible();

  await page.goto('./#/tournaments');
  await expect(page.getByRole('link', { name: /First Cup/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Second Cup/ })).toBeVisible();
});
