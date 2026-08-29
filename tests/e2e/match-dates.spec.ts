import { expect, test } from '@playwright/test';

/**
 * Results that were all written at one moment.
 *
 * A public Challonge bracket carries no dates, so an imported tournament used to
 * have every result stamped with the moment of the import. Elo folds results in
 * sequence, so a whole archive entered in one sitting was rated in the order it
 * happened to be pasted. The repair moves those results onto the date the
 * tournament was played.
 *
 * The demo tournament is written the same way, which makes it a faithful stand-in
 * for an imported archive.
 */

const repair = /Spieldaten reparieren/;

test('offers nothing to repair while there is nothing stamped in bulk', async ({ page }) => {
  await page.goto('./#/settings');
  await expect(page.getByRole('heading', { name: 'Einstellungen', level: 1 })).toBeVisible();
  await expect(page.getByText(repair)).toHaveCount(0);
});

test('re-dates results that share one timestamp, and then stops offering', async ({ page }) => {
  await page.goto('./#/tournaments');
  await page.getByRole('button', { name: 'Demo-Turnier anlegen' }).click();
  await expect(page.getByRole('link', { name: /Meridian Invitational/ })).toBeVisible();

  await page.goto('./#/settings');
  await expect(page.getByText(repair)).toBeVisible();
  // The tournament is named, so it is clear what would be touched.
  await expect(page.getByText('Meridian Invitational')).toBeVisible();

  await page.getByRole('button', { name: /umdatieren/ }).click();
  await expect(page.getByText(/umdatiert\./)).toBeVisible();

  // Nothing is left to repair, so the card is gone on the next visit.
  await page.goto('./#/tournaments');
  await page.goto('./#/settings');
  await expect(page.getByText(repair)).toHaveCount(0);
});

/** Only the timestamps move; the tournament itself must read exactly as before. */
test('leaves the results themselves untouched', async ({ page }) => {
  await page.goto('./#/tournaments');
  await page.getByRole('button', { name: 'Demo-Turnier anlegen' }).click();
  await page.getByRole('link', { name: /Meridian Invitational/ }).click();

  const bracket = page.getByRole('group', { name: /Turnierbaum/i });
  await expect(bracket).toBeVisible();
  const before = await bracket.innerText();

  await page.goto('./#/settings');
  await page.getByRole('button', { name: /umdatieren/ }).click();
  await expect(page.getByText(/umdatiert\./)).toBeVisible();

  await page.goto('./#/tournaments');
  await page.getByRole('link', { name: /Meridian Invitational/ }).click();
  await expect(bracket).toBeVisible();
  expect(await bracket.innerText()).toBe(before);
});
