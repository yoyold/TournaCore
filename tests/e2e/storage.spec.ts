import { expect, test, type Page } from '@playwright/test';

/**
 * The warning that the browser may throw the archive away.
 *
 * IndexedDB is best effort unless the browser promises otherwise, and this
 * application has no server to recover from. Chromium decides for itself
 * whether to grant the promise and refuses in a fresh automated profile — which
 * is exactly the state worth testing.
 */

const notice = (page: Page) => page.getByRole('status');

async function withTournament(page: Page): Promise<void> {
  await page.goto('./#/tournaments');
  await page.getByRole('button', { name: 'Demo-Turnier anlegen' }).click();
  await expect(page.getByRole('link', { name: /Meridian Invitational/ })).toBeVisible();
}

interface Spy {
  __persistAsked?: boolean;
}

test('asks the browser to keep the data on startup', async ({ page }) => {
  /*
   * Installed before the app loads rather than after: patching the live page
   * and then navigating would throw the patch away with the old document.
   */
  await page.addInitScript(() => {
    const original = navigator.storage.persist.bind(navigator.storage);
    (window as unknown as Spy).__persistAsked = false;
    navigator.storage.persist = async () => {
      (window as unknown as Spy).__persistAsked = true;
      return original();
    };
  });

  await page.goto('./#/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  // The request is made once the app mounts, without anyone pressing anything.
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Spy).__persistAsked))
    .toBe(true);
});

/** A warning on an empty application teaches people to ignore warnings. */
test('says nothing while there is nothing to lose', async ({ page }) => {
  await page.goto('./#/tournaments');
  await expect(page.getByText('Noch keine Turniere')).toBeVisible();
  await expect(notice(page)).toHaveCount(0);
});

test('warns once there is an archive the browser may discard', async ({ page }) => {
  await withTournament(page);
  await expect(notice(page)).toBeVisible();
  await expect(notice(page)).toContainText('jederzeit löschen');
});

test('points at the one thing that actually protects the data', async ({ page }) => {
  await withTournament(page);
  await notice(page).getByRole('link', { name: 'Jetzt sichern' }).click();
  await expect(page.getByRole('heading', { name: /Import/, level: 1 })).toBeVisible();
});

test('can be put away for the visit but comes back on the next one', async ({ page }) => {
  await withTournament(page);

  await notice(page).getByRole('button', { name: 'Hinweis ausblenden' }).click();
  await expect(notice(page)).toHaveCount(0);

  // Still gone while navigating around, because nothing has reloaded.
  await page.getByRole('link', { name: 'Teams' }).click();
  await expect(notice(page)).toHaveCount(0);

  // A reload is a new visit, and the risk has not gone away.
  await page.reload();
  await expect(notice(page)).toBeVisible();
});

test('states plainly in the settings what the browser promised', async ({ page }) => {
  await withTournament(page);
  await page.goto('./#/settings');

  await expect(page.getByText('Datenspeicher')).toBeVisible();
  await expect(page.getByText('Kann vom Browser gelöscht werden')).toBeVisible();
  // What is at stake, in a figure rather than an adjective.
  await expect(page.getByText(/Belegt:/)).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Dauerhafte Speicherung anfordern' }),
  ).toBeVisible();
});
