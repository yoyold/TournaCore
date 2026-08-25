import { expect, test, type Page } from '@playwright/test';

async function createTournament(page: Page, name: string): Promise<void> {
  await page.goto('./#/tournaments/new');
  await page.getByLabel(/Turniername/).fill(name);
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page
    .getByLabel(/Teilnehmer \(einer pro Zeile\)/)
    .fill('Alpha, DE\nBeta, US\nGamma, SE\nDelta, KR');
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Turnier erstellen' }).click();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
}

/**
 * The tournament names in the order the list shows them.
 *
 * Waits for the expected number of cards: reading straight after navigating
 * catches the page before the store has loaded, and two empty lists compare
 * equal — which would let an ordering test pass without testing anything.
 */
async function listed(page: Page, expected: number): Promise<string[]> {
  await page.goto('./#/tournaments');
  await expect(page.getByRole('link', { name: /Cup/ })).toHaveCount(expected);

  const links = await page.getByRole('link', { name: /Cup/ }).allInnerTexts();
  return links.map((entry) => entry.split('\n')[0]?.trim() ?? '');
}

/**
 * A stored map has no order worth relying on, so an unsorted list reshuffles
 * whenever storage feels like it. Newest first is what makes an archive read
 * like one.
 */
test('lists tournaments newest first', async ({ page }) => {
  await createTournament(page, 'First Cup');
  await createTournament(page, 'Second Cup');
  await createTournament(page, 'Third Cup');

  expect(await listed(page, 3)).toEqual(['Third Cup', 'Second Cup', 'First Cup']);
});

test('keeps the order across a reload', async ({ page }) => {
  await createTournament(page, 'First Cup');
  await createTournament(page, 'Second Cup');

  const before = await listed(page, 2);
  await page.reload();
  expect(await listed(page, 2)).toEqual(before);
});

/**
 * The date matters more than the moment of import: a Challonge bracket carries
 * none, so a whole archive would otherwise land on today in whatever order it
 * happened to be pasted.
 */
test('an imported tournament sorts by the date it was given', async ({ page }) => {
  const payload = {
    tournament: {
      id: 1,
      name: 'Ancient Cup',
      tournament_type: 'single elimination',
      state: 'complete',
      participants: [
        { participant: { id: 1, name: 'Alpha', seed: 1 } },
        { participant: { id: 2, name: 'Beta', seed: 2 } },
      ],
      matches: [
        {
          match: {
            id: 1,
            state: 'complete',
            player1_id: 1,
            player2_id: 2,
            winner_id: 1,
            scores_csv: '1-0',
            suggested_play_order: 1,
          },
        },
      ],
    },
  };

  // Created now, so it would come first if the date were ignored.
  await createTournament(page, 'Recent Cup');

  await page.goto('./#/transfer');
  await page.getByLabel('Challonge-Daten').fill(JSON.stringify(payload));
  // The name rides along in an API-shaped payload; the field is for public
  // brackets, which carry none.
  await page.getByLabel('Datum des Turniers').fill('2015-06-01');
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await page.getByRole('button', { name: 'Übernehmen' }).click();
  await expect(page.getByText(/1 Turnier/)).toBeVisible();

  expect(await listed(page, 2)).toEqual(['Recent Cup', 'Ancient Cup']);
});
