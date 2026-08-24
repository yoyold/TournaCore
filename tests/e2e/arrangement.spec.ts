import { expect, test, type Page } from '@playwright/test';

const TEAMS = [
  'Alpha, DE',
  'Beta, US',
  'Gamma, SE',
  'Delta, KR',
  'Epsilon, FR',
  'Zeta, CA',
  'Eta, BR',
  'Theta, PL',
].join('\n');

async function createBracket(page: Page, name: string): Promise<void> {
  await page.goto('./#/tournaments/new');
  await page.getByLabel(/Turniername/).fill(name);
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByLabel(/Teilnehmer \(einer pro Zeile\)/).fill(TEAMS);
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Turnier erstellen' }).click();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
}

/** The pairings of the first round, read off the match nodes. */
async function firstRound(page: Page): Promise<string[]> {
  const nodes = await page.getByRole('button', { name: /gegen/ }).all();
  const labels: string[] = [];
  for (const node of nodes.slice(0, 4)) {
    labels.push((await node.getAttribute('aria-label')) ?? '');
  }
  return labels;
}

test('a new bracket uses the standard arrangement', async ({ page }) => {
  await createBracket(page, 'Arrangement Cup');

  await expect(page.getByLabel('Bracket-Anordnung')).toHaveValue('standard');
  // 1v8, 4v5, 2v7, 3v6 — the order tournament software agrees on.
  expect((await firstRound(page)).join(' | ')).toContain('Delta gegen Epsilon');
});

/**
 * The repair this control exists for.
 *
 * A stored result names a position, not a pairing, so a bracket drawn under one
 * arrangement and read under another shows the right scores against the wrong
 * teams. Switching must rewire it, and switching back must put it exactly as it
 * was — otherwise trying the other setting would itself be a risk.
 */
test('switching the arrangement rewires the bracket and is reversible', async ({ page }) => {
  await createBracket(page, 'Reversible Cup');

  const standard = await firstRound(page);

  await page.getByLabel('Bracket-Anordnung').selectOption('mirrored');
  await expect(page.getByLabel('Bracket-Anordnung')).toHaveValue('mirrored');
  const mirrored = await firstRound(page);

  expect(mirrored).not.toEqual(standard);

  // The same eight teams take part either way — only their positions move.
  const teamsIn = (labels: string[]): string[] =>
    labels
      .flatMap((label) => (label.split(' · ')[0] ?? '').split(' gegen '))
      .map((name) => name.trim())
      .sort();
  expect(teamsIn(mirrored)).toEqual(teamsIn(standard));

  await page.getByLabel('Bracket-Anordnung').selectOption('standard');
  expect(await firstRound(page)).toEqual(standard);
});

test('the choice survives a reload', async ({ page }) => {
  await createBracket(page, 'Persistent Cup');

  await page.getByLabel('Bracket-Anordnung').selectOption('mirrored');
  const mirrored = await firstRound(page);

  await page.reload();
  await expect(page.getByLabel('Bracket-Anordnung')).toHaveValue('mirrored');
  expect(await firstRound(page)).toEqual(mirrored);
});

test('a league has nothing to arrange', async ({ page }) => {
  await page.goto('./#/tournaments/new');
  await page.getByLabel(/Turniername/).fill('League Cup');
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByLabel(/Teilnehmer \(einer pro Zeile\)/).fill(TEAMS);
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('radio', { name: /Liga \/ Round Robin/ }).check();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Turnier erstellen' }).click();
  await expect(page.getByRole('heading', { name: 'League Cup', level: 1 })).toBeVisible();

  // Nothing advances, so there is no arrangement to get wrong.
  await expect(page.getByLabel('Bracket-Anordnung')).toHaveCount(0);
});

test('double elimination can also change its loser bracket draw', async ({ page }) => {
  await page.goto('./#/tournaments/new');
  await page.getByLabel(/Turniername/).fill('Double Cup');
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByLabel(/Teilnehmer \(einer pro Zeile\)/).fill(TEAMS);
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('radio', { name: /Doppel-K\.-o\./ }).check();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Turnier erstellen' }).click();
  await expect(page.getByRole('heading', { name: 'Double Cup', level: 1 })).toBeVisible();

  const dropOrder = page.getByLabel('Verliererbaum');
  await expect(dropOrder).toHaveValue('balanced');

  // The setting an import from Challonge needs is offered here too.
  await dropOrder.selectOption('alternating');
  await page.reload();
  await expect(page.getByLabel('Verliererbaum')).toHaveValue('alternating');
});
