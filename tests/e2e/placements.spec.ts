import { expect, test, type Page } from '@playwright/test';

/**
 * The trophy cabinet on a team's profile.
 *
 * Four teams seed as [1, 4, 2, 3], so the first round is Alpha against Delta and
 * Beta against Gamma. Letting the first-named side win each time makes Alpha the
 * champion, Beta the beaten finalist, and the other two joint third.
 */

async function playOut(page: Page, name: string): Promise<void> {
  await page.goto('./#/tournaments/new');
  await page.getByLabel(/Turniername/).fill(name);
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByLabel(/Teilnehmer \(einer pro Zeile\)/).fill('Alpha\nBeta\nGamma\nDelta');
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Turnier erstellen' }).click();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();

  await recordWin(page, /Alpha.*Delta/);
  await recordWin(page, /Beta.*Gamma/);
  // The wizard gives the final a longer format, and two maps do not decide a
  // best of five — the tournament would stay open and hand out nothing.
  await recordWin(page, /Alpha.*Beta/, 3);
}

/** Records a clean sweep for the first-named side over `maps` maps. */
async function recordWin(page: Page, match: RegExp, maps = 2): Promise<void> {
  await page.getByRole('button', { name: match }).click();

  for (let map = 0; map < maps; map += 1) {
    if (map > 0) await page.getByRole('button', { name: 'Map hinzufügen' }).click();
    const scores = page.getByRole('spinbutton');
    await scores.nth(map * 2).fill('13');
    await scores.nth(map * 2 + 1).fill('7');
  }

  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByRole('dialog', { name: 'Ergebnis eintragen' })).toHaveCount(0);
}

async function openTeam(page: Page, name: string): Promise<void> {
  await page.goto('./#/teams');
  await page.getByRole('link', { name: new RegExp(name) }).click();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
}

const cabinet = (page: Page) => page.getByRole('list', { name: 'Platzierungen' });

test('puts a trophy on the profile for each of the top three', async ({ page }) => {
  await playOut(page, 'Ruhm Cup');

  await openTeam(page, 'Alpha');
  await expect(cabinet(page).getByText('1. Platz — Ruhm Cup')).toBeVisible();

  await openTeam(page, 'Beta');
  await expect(cabinet(page).getByText('2. Platz — Ruhm Cup')).toBeVisible();

  // No third place match, so both losing semi-finalists come third.
  await openTeam(page, 'Delta');
  await expect(cabinet(page).getByText('3. Platz — Ruhm Cup')).toBeVisible();
  await openTeam(page, 'Gamma');
  await expect(cabinet(page).getByText('3. Platz — Ruhm Cup')).toBeVisible();
});

test('leaves the profile of a team that placed fourth or worse bare', async ({ page }) => {
  await page.goto('./#/tournaments/new');
  await page.getByLabel(/Turniername/).fill('Weiter Cup');
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page
    .getByLabel(/Teilnehmer \(einer pro Zeile\)/)
    .fill('Alpha\nBeta\nGamma\nDelta\nEpsilon\nZeta\nEta\nTheta');
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Turnier erstellen' }).click();
  await expect(page.getByRole('heading', { name: 'Weiter Cup', level: 1 })).toBeVisible();

  // Eight teams seed as [1, 8, 4, 5, 2, 7, 3, 6]; Theta is knocked out first.
  await recordWin(page, /Alpha.*Theta/);

  await openTeam(page, 'Theta');
  await expect(cabinet(page)).toHaveCount(0);
});

test('hands out nothing while the tournament is unfinished', async ({ page }) => {
  await page.goto('./#/tournaments/new');
  await page.getByLabel(/Turniername/).fill('Offen Cup');
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByLabel(/Teilnehmer \(einer pro Zeile\)/).fill('Alpha\nBeta\nGamma\nDelta');
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Turnier erstellen' }).click();

  await recordWin(page, /Alpha.*Delta/);

  await openTeam(page, 'Alpha');
  await expect(cabinet(page)).toHaveCount(0);
});

/** The one result worth spotting from across the page. */
test('draws a world championship trophy larger than the rest', async ({ page }) => {
  await playOut(page, 'Ruhm Cup');

  await openTeam(page, 'Alpha');
  const ordinary = await cabinet(page).getByRole('link').first().boundingBox();

  await page.goto('./#/tournaments');
  await page.getByRole('link', { name: /Ruhm Cup/ }).click();
  await page.getByRole('button', { name: 'Bearbeiten' }).click();
  await page.getByLabel(/Turniername/).fill('2026 World Championship');
  await page.getByRole('button', { name: 'Speichern' }).click();
  // Saving navigates back to the tournament; leaving before it lands would take
  // the rename with it.
  await expect(
    page.getByRole('heading', { name: '2026 World Championship', level: 1 }),
  ).toBeVisible();

  await openTeam(page, 'Alpha');
  await expect(cabinet(page).getByText(/World Championship/)).toBeVisible();
  const major = await cabinet(page).getByRole('link').first().boundingBox();

  expect(major?.height ?? 0).toBeGreaterThan(ordinary?.height ?? 0);
});

test('links a trophy to the tournament it was won at', async ({ page }) => {
  await playOut(page, 'Ruhm Cup');
  await openTeam(page, 'Alpha');

  await cabinet(page).getByRole('link').first().click();
  await expect(page.getByRole('heading', { name: 'Ruhm Cup', level: 1 })).toBeVisible();
});
