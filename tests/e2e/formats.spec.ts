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

/**
 * A group stage has already given every team several games, so ending the event
 * on a single defeat is a choice rather than the only option. The playoff
 * bracket is therefore configurable, and the engine needed nothing new for it:
 * the two stages are linked by a seeding rule either way.
 */
test('sends the qualifiers into a double elimination playoff', async ({ page }) => {
  await startWizard(page, 'Split Championship');

  await page.getByRole('radio', { name: /Gruppenphase/ }).check();
  await page.getByLabel(/Anzahl Gruppen/).fill('2');
  await page.getByLabel(/Qualifiziert je Gruppe/).fill('2');

  // The playoff radio is labelled by the format alone; the tournament format
  // above carries a description in the same label.
  await page.getByRole('radio', { name: 'Doppel-K.-o.', exact: true }).check();
  // Choosing it reveals the setting only a double elimination bracket has.
  await expect(page.getByText('Bracket Reset im Grand Final')).toBeVisible();

  await page.getByRole('button', { name: 'Weiter' }).click();
  // The summary names the playoff bracket, so the choice is visible before it
  // is acted on.
  await expect(page.getByText('(Doppel-K.-o.)')).toBeVisible();
  await page.getByRole('button', { name: 'Turnier erstellen' }).click();
  await expect(page.getByRole('heading', { name: 'Split Championship', level: 1 })).toBeVisible();

  await page.getByRole('tab', { name: 'Playoffs' }).click();
  const bracket = page.getByRole('group', { name: /Turnierbaum/i });
  await expect(bracket).toBeVisible();

  // The loser bracket is the whole difference, and only this format has one.
  await expect(bracket.getByText(/loser bracket/i)).toBeVisible();
  await expect(bracket.getByText(/winner bracket/i)).toBeVisible();
});

test('keeps the single elimination playoff without a loser bracket', async ({ page }) => {
  await startWizard(page, 'Knockout Cup');

  await page.getByRole('radio', { name: /Gruppenphase/ }).check();
  await page.getByLabel(/Anzahl Gruppen/).fill('2');
  await page.getByLabel(/Qualifiziert je Gruppe/).fill('2');
  await finish(page, 'Knockout Cup');

  await page.getByRole('tab', { name: 'Playoffs' }).click();
  const bracket = page.getByRole('group', { name: /Turnierbaum/i });
  await expect(bracket).toBeVisible();
  await expect(bracket.getByText(/loser bracket/i)).toHaveCount(0);
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

test('creates a double elimination bracket with both brackets drawn', async ({ page }) => {
  await startWizard(page, 'Double Cup');

  await page.getByRole('radio', { name: /Doppel-K\.-o\./ }).check();
  await finish(page, 'Double Cup');

  const bracket = page.getByRole('group', { name: /Turnierbaum/i });
  await expect(bracket).toBeVisible();

  // Two stacked brackets are only readable if they say which is which.
  await expect(page.getByText('Winner Bracket')).toBeVisible();
  await expect(page.getByText('Loser Bracket')).toBeVisible();
});

test('a defeat in double elimination is not the end', async ({ page }) => {
  await startWizard(page, 'Second Chance');

  await page.getByRole('radio', { name: /Doppel-K\.-o\./ }).check();
  await finish(page, 'Second Chance');

  // Beat Nova Collective in its opening match.
  await page
    .getByRole('button', { name: /Nova Collective/ })
    .first()
    .click();
  const scores = page.getByRole('spinbutton');
  await scores.nth(0).fill('7');
  await scores.nth(1).fill('13');
  await page.getByRole('button', { name: 'Map hinzufügen' }).click();
  await page.getByRole('spinbutton').nth(2).fill('9');
  await page.getByRole('spinbutton').nth(3).fill('13');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByRole('dialog', { name: 'Ergebnis eintragen' })).toHaveCount(0);

  // It reappears in the loser bracket rather than disappearing from the draw.
  await expect(page.getByRole('button', { name: /Nova Collective/ })).toHaveCount(2);
});

test('a swiss stage draws only the round that can be drawn', async ({ page }) => {
  await startWizard(page, 'Swiss Cup');

  await page.getByRole('radio', { name: /Schweizer System/ }).check();
  await finish(page, 'Swiss Cup');

  // A table, not a bracket: nobody is knocked out.
  await expect(page.getByRole('group', { name: /Turnierbaum/i })).toHaveCount(0);
  await expect(page.getByRole('table')).toBeVisible();

  await expect(page.getByText('Runde 1')).toBeVisible();
  await expect(page.getByText('Runde 5')).toBeVisible();

  /*
   * Round one is drawn from the seeding. Everything after it depends on results
   * that do not exist yet and must stay visibly undrawn — five rounds of eight
   * participants leaves sixteen fixtures waiting.
   */
  await expect(page.getByRole('button', { name: 'Offen gegen Offen' })).toHaveCount(16);
});

test('finishing a swiss round draws the next one', async ({ page }) => {
  await startWizard(page, 'Swiss Progress', 'Alpha, DE\nBeta, US\nGamma, SE\nDelta, KR');

  await page.getByRole('radio', { name: /Schweizer System/ }).check();
  await page.getByRole('spinbutton', { name: 'Runden' }).fill('2');
  await finish(page, 'Swiss Progress');

  await expect(page.getByRole('button', { name: 'Offen gegen Offen' })).toHaveCount(2);

  // Play both fixtures of round one.
  for (let i = 0; i < 2; i += 1) {
    await page.getByRole('button', { name: /gegen/ }).nth(i).click();
    const scores = page.getByRole('spinbutton');
    await scores.nth(0).fill('13');
    await scores.nth(1).fill('7');
    await page.getByRole('button', { name: 'Map hinzufügen' }).click();
    await page.getByRole('spinbutton').nth(2).fill('13');
    await page.getByRole('spinbutton').nth(3).fill('9');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByRole('dialog', { name: 'Ergebnis eintragen' })).toHaveCount(0);
  }

  // Round two now has opponents.
  await expect(page.getByRole('button', { name: 'Offen gegen Offen' })).toHaveCount(0);
});
