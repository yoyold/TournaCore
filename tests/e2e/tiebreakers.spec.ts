import { expect, test, type Page } from '@playwright/test';

const TEAMS = ['Alpha, DE', 'Beta, US', 'Gamma, SE', 'Delta, KR'].join('\n');

async function createLeague(page: Page, name: string): Promise<void> {
  await page.goto('./#/tournaments/new');
  await page.getByLabel(/Turniername/).fill(name);
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByLabel(/Teilnehmer \(einer pro Zeile\)/).fill(TEAMS);
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('radio', { name: /Liga \/ Round Robin/ }).check();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Turnier erstellen' }).click();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
}

/**
 * Records a series, stated as "winner beat loser by this score".
 *
 * Which side of the fixture a team stands on comes out of the draw, so the
 * entry reads the pairing off the node rather than assuming an order.
 */
async function record(page: Page, winner: string, loser: string, maps: string): Promise<void> {
  const node = page.getByRole('button', {
    name: new RegExp(`(${winner} gegen ${loser})|(${loser} gegen ${winner})`),
  });
  const label = (await node.getAttribute('aria-label')) ?? '';
  const winnerIsA = label.startsWith(winner);

  await node.click();
  const scores = page.getByRole('spinbutton');
  await scores.nth(winnerIsA ? 0 : 1).fill('2');
  await scores.nth(winnerIsA ? 1 : 0).fill(maps);
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByRole('dialog', { name: 'Ergebnis eintragen' })).toHaveCount(0);
}

/**
 * A league where the two criteria disagree about the top two.
 *
 * Alpha and Beta both finish 2–1 on six points. Beta won the match between
 * them; Alpha has much the better map difference. Nothing in the results
 * settles which of those counts — that is the organiser's rule.
 */
async function playOut(page: Page): Promise<void> {
  await record(page, 'Alpha', 'Gamma', '0');
  await record(page, 'Alpha', 'Delta', '0');
  await record(page, 'Beta', 'Alpha', '1');
  await record(page, 'Gamma', 'Beta', '0');
  await record(page, 'Beta', 'Delta', '1');
  await record(page, 'Delta', 'Gamma', '0');
}

const leader = (page: Page) => page.getByRole('table').locator('tbody tr').first();

const chainOf = (page: Page) =>
  page.getByRole('list', { name: 'Tiebreaker-Reihenfolge' }).getByRole('listitem');

test('the direct match decides a tie by default', async ({ page }) => {
  await createLeague(page, 'Tiebreak Cup');
  await playOut(page);

  const chain = chainOf(page);
  await expect(chain.nth(1)).toContainText('Direkter Vergleich');

  // Beta lost two maps more than Alpha but won the match between them.
  await expect(leader(page)).toContainText('Beta');
});

/** The setting itself: the same results, ranked by map difference instead. */
test('map difference can be made the first tiebreaker', async ({ page }) => {
  await createLeague(page, 'Map Difference Cup');
  await playOut(page);

  await page.getByRole('button', { name: 'Mapdifferenz nach vorn' }).click();

  const chain = chainOf(page);
  await expect(chain.nth(1)).toContainText('Mapdifferenz');

  await expect(leader(page)).toContainText('Alpha');
  // The table says which criterion separated them, so the order is explicable.
  await expect(page.getByRole('table').locator('tbody tr').nth(1)).toContainText('MD');
});

test('the order survives a reload and can be put back', async ({ page }) => {
  await createLeague(page, 'Persistent Tiebreak Cup');
  await playOut(page);

  await page.getByRole('button', { name: 'Mapdifferenz nach vorn' }).click();
  await expect(leader(page)).toContainText('Alpha');

  await page.reload();
  await expect(chainOf(page).nth(1)).toContainText('Mapdifferenz');
  await expect(leader(page)).toContainText('Alpha');

  await page.getByRole('button', { name: 'Standard wiederherstellen' }).click();
  await expect(chainOf(page).nth(1)).toContainText('Direkter Vergleich');
  await expect(leader(page)).toContainText('Beta');
});

test('points stay first and the seeding stays last', async ({ page }) => {
  await createLeague(page, 'Pinned Cup');

  // Nothing offers to move either of them: points is what the table ranks by,
  // and the seeding is the only criterion that always separates two entries.
  await expect(page.getByRole('button', { name: 'Punkte nach vorn' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Setzung nach hinten' })).toHaveCount(0);

  const chain = chainOf(page);
  await expect(chain.first()).toContainText('Punkte');
  await expect(chain.last()).toContainText('Setzung');
});

test('a knockout has no table to order', async ({ page }) => {
  await page.goto('./#/tournaments/new');
  await page.getByLabel(/Turniername/).fill('Knockout Cup');
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByLabel(/Teilnehmer \(einer pro Zeile\)/).fill(TEAMS);
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Turnier erstellen' }).click();
  await expect(page.getByRole('heading', { name: 'Knockout Cup', level: 1 })).toBeVisible();

  await expect(page.getByText('Tiebreaker-Reihenfolge')).toHaveCount(0);
});
