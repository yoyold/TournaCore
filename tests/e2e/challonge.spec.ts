import { expect, test, type Page } from '@playwright/test';

/** A Challonge API response for four players, every match decided. */
const PAYLOAD = {
  tournament: {
    id: 900,
    name: 'Autumn Clash',
    url: 'autumn-clash',
    tournament_type: 'single elimination',
    game_name: 'Counter-Strike 2',
    state: 'complete',
    participants: [
      { participant: { id: 1, name: 'Nova Collective', seed: 1 } },
      { participant: { id: 2, name: 'Iron Meridian', seed: 2 } },
      { participant: { id: 3, name: 'Solstice Nine', seed: 3 } },
      { participant: { id: 4, name: 'Pale Horizon', seed: 4 } },
    ],
    matches: [match(1, 1, 4, 1, '2-0'), match(2, 2, 3, 2, '2-1'), match(3, 1, 2, 2, '1-2')],
  },
};

function match(id: number, p1: number, p2: number, winner: number, scores: string) {
  return {
    match: {
      id,
      state: 'complete',
      player1_id: p1,
      player2_id: p2,
      winner_id: winner,
      loser_id: winner === p1 ? p2 : p1,
      scores_csv: scores,
      suggested_play_order: id,
    },
  };
}

async function paste(page: Page, payload: unknown, name = ''): Promise<void> {
  await page.goto('./#/transfer');
  await page.getByLabel('Challonge-Daten').fill(JSON.stringify(payload));
  if (name !== '') await page.getByLabel('Turniername').fill(name);
  await page.getByRole('button', { name: 'Prüfen' }).click();
}

test('brings a pasted Challonge tournament in', async ({ page }) => {
  await paste(page, PAYLOAD);

  // The report says what it found before anything is written.
  await expect(page.getByText('Autumn Clash').first()).toBeVisible();
  await expect(page.getByText(/3 von 3 Partien/)).toBeVisible();

  await page.getByRole('button', { name: 'Übernehmen' }).click();
  await expect(page.getByText(/1 Turnier/)).toBeVisible();

  await page.goto('./#/tournaments');
  await page.getByRole('link', { name: /Autumn Clash/ }).click();

  // The whole bracket came across, results and all.
  await expect(page.getByRole('heading', { name: 'Autumn Clash', level: 1 })).toBeVisible();
  await expect(page.getByRole('group', { name: /Turnierbaum/i })).toBeVisible();
  await expect(page.getByText('Nova Collective').first()).toBeVisible();
});

test('checking changes nothing until it is confirmed', async ({ page }) => {
  await paste(page, PAYLOAD);
  await expect(page.getByText(/3 von 3 Partien/)).toBeVisible();

  // The preview is a preview: nothing is stored yet.
  await page.goto('./#/tournaments');
  await expect(page.getByRole('link', { name: /Autumn Clash/ })).toHaveCount(0);
});

test('reuses teams that are already here', async ({ page }) => {
  await paste(page, PAYLOAD);
  await page.getByRole('button', { name: 'Übernehmen' }).click();
  await expect(page.getByText(/1 Turnier/)).toBeVisible();

  // The same field again under a different name: four teams, not eight.
  const second = structuredClone(PAYLOAD);
  second.tournament.name = 'Winter Clash';
  second.tournament.url = 'winter-clash';

  await paste(page, second);
  await page.getByRole('button', { name: 'Übernehmen' }).click();
  await expect(page.getByText(/1 Turnier/)).toBeVisible();

  await page.goto('./#/teams');
  await expect(page.getByRole('link', { name: /Nova Collective/ })).toHaveCount(1);
});

test('says so when the text is not Challonge data', async ({ page }) => {
  await page.goto('./#/transfer');
  await page.getByLabel('Challonge-Daten').fill('not json at all');
  await page.getByRole('button', { name: 'Prüfen' }).click();

  await expect(page.getByRole('alert')).toContainText('JSON');
});

/**
 * Half a tournament is worse than none, so an unsupported one is reported and
 * left out rather than imported in part.
 */
test('refuses a tournament it cannot represent', async ({ page }) => {
  const groups = structuredClone(PAYLOAD);
  Object.assign(groups.tournament, { group_stages_enabled: true });

  await paste(page, groups);

  await expect(page.getByText(/übersprungen/i).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Übernehmen' })).toHaveCount(0);
});
