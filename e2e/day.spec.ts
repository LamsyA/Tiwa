import { test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { expect, freshPhone, isolateIp, signInWithPhone } from './support/auth.js';

// P12-T08: UF-24 event-day run-of-show on a FRESH event per run
// (parallel-safe: fresh host, fresh event). Covers DAY-01–DAY-05 (editor,
// late dependants, incidents, contacts) plus UF-24-1 (offline reload),
// UF-24-2 (transitive dependant highlight) and UF-24-3 (cross-page live
// refresh within 10 s). Core tests prove cycles, vendor isolation and the
// progress job; vendor arrival rides the same live channel.
test.describe.configure({ mode: 'serial', timeout: 420_000 });
test.use({ actionTimeout: 20_000, navigationTimeout: 30_000 });

const RUN = Date.now().toString(36);

async function gotoSettled(page: Page, url: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await page.goto(url);
      return;
    } catch {
      if (attempt >= 2) throw new Error(`goto failed: ${url}`);
      await page.waitForTimeout(1000);
    }
  }
}

async function signedUpHost(page: Page, name: string): Promise<void> {
  await isolateIp(page);
  await signInWithPhone(page, '/signup', freshPhone());
  await expect(page.getByRole('link', { name: /I'm hosting an event/ })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('link', { name: /I'm hosting an event/ }).click();
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('button', { name: /Concert/ }).first()).toBeVisible({ timeout: 60_000 });
}

/** Fresh concert event (template programme: Doors open, Opening, …). */
async function newConcertEvent(page: Page, name: string): Promise<string> {
  await page
    .getByRole('button', { name: /Concert/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'The basics' })).toBeVisible();
  await page.getByLabel('Event name').fill(name);
  await page.getByLabel('Date', { exact: true }).fill('2031-06-01');
  await page.getByLabel('Starts').fill('19:00');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'Where and when' })).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'Guests and budget' })).toBeVisible();
  await page.getByLabel('Expected guests').fill('200');
  await page.getByLabel('Total budget').fill('2000000');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'Choose features' })).toBeVisible();
  await page.getByRole('button', { name: 'Create event' }).click();
  await expect(page).toHaveURL(/\/events\/[0-9a-f-]+\?welcome=1$/);
  const id = page.url().match(/\/events\/([^?]+)/)?.[1];
  if (!id) throw new Error('no event id');
  return id;
}

/** Timeline row by its title chip (options in other rows' selects share
 * the same words, so scope to the title span, not the whole row text). */
function itemRow(page: Page, title: string): Locator {
  return page.locator('li').filter({ has: page.locator('span.font-medium', { hasText: title }) });
}

async function openSecondPage(context: BrowserContext, url: string, readyText: string): Promise<Page> {
  const other = await context.newPage();
  await gotoSettled(other, url);
  await expect(other.getByRole('heading', { name: 'Timeline' })).toBeVisible({ timeout: 60_000 });
  // The SW shell may predate the items; the ready ping refreshes to live data.
  await expect(other.getByText(readyText, { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  return other;
}

test('UF-24 run-of-show: edit, late dependants, incidents, contacts, live, offline', async ({
  page,
  context,
}, testInfo) => {
  const tag = `${testInfo.project.name}-${RUN}`;
  await signedUpHost(page, `Day Host ${tag}`);
  const eventId = await newConcertEvent(page, `Day Event ${tag}`);
  await gotoSettled(page, `/events/${eventId}/day`);
  await expect(page.getByRole('heading', { name: 'Timeline' })).toBeVisible();

  // From the template programme.
  await page.getByRole('button', { name: 'Create from programme' }).click();
  await expect(itemRow(page, 'Doors open')).toBeVisible({ timeout: 30_000 });

  // A backstage item with an explicit start and duration.
  await page.getByLabel('Title', { exact: true }).fill('Sound check');
  await page.getByLabel('Starts', { exact: true }).fill('2031-06-01T15:00');
  await page.getByLabel('Minutes', { exact: true }).fill('60');
  await page.getByRole('button', { name: 'Add item', exact: true }).click();
  await expect(itemRow(page, 'Sound check')).toBeVisible({ timeout: 30_000 });

  // Link: doors wait on sound check (link controls live behind the edit toggle).
  const doors = itemRow(page, 'Doors open');
  await doors.getByRole('button', { name: 'Owner', exact: true }).click();
  await doors.getByLabel('Waits on', { exact: true }).selectOption({ label: 'Sound check' });
  await doors.getByRole('button', { name: 'Link', exact: true }).click();
  await expect(doors.getByText('Waits on:')).toContainText('Sound check');

  // Mark the root late: banner + LATE chip (UF-24-2 highlight path).
  const sound = itemRow(page, 'Sound check');
  await sound.getByLabel('Minutes late', { exact: true }).fill('20');
  await sound.getByRole('button', { name: 'Mark late', exact: true }).click();
  await expect(page.getByText('Dependants are highlighted')).toBeVisible({ timeout: 30_000 });
  await expect(sound.getByText('LATE +20m')).toBeVisible();

  // Incidents + contacts tabs (DAY-04/DAY-05).
  await page.getByRole('tab', { name: 'Incidents' }).click();
  await page.getByLabel('What happened', { exact: true }).fill('Power cut');
  await page.getByLabel('Severity', { exact: true }).selectOption('high');
  await page.getByRole('button', { name: 'Log incident', exact: true }).click();
  await expect(page.getByText('Power cut', { exact: true }).first()).toBeVisible({ timeout: 30_000 });

  await page.getByRole('tab', { name: 'Contacts' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Dele Backup');
  await page.getByLabel('Role', { exact: true }).fill('Generator');
  await page.getByLabel('Phone', { exact: true }).fill('+2348012345678');
  await page.getByRole('button', { name: 'Add contact', exact: true }).click();
  await expect(page.getByText('Dele Backup', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('link', { name: 'Call' })).toBeVisible();

  // Live: a second page marks an item done; this page refreshes (UF-24-3).
  await page.getByRole('tab', { name: 'Timeline' }).click();
  const other = await openSecondPage(context, `/events/${eventId}/day`, 'Doors open');
  const otherDoors = itemRow(other, 'Doors open');
  await otherDoors.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(doors.getByText('DONE', { exact: true })).toBeVisible({ timeout: 10_000 });
  await other.close();

  // Offline: pin the data, then wait until the SW shell actually holds the
  // timeline (StaleWhileRevalidate revalidates in the background) before
  // dropping the network — this is the UF-24-1 guarantee, not timing luck.
  await page.getByRole('button', { name: 'Make available offline' }).click();
  await expect(page.getByText('Day data saved')).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          const cache = await caches.open('day-pages');
          for (const key of await cache.keys()) {
            if (!key.url.includes('/day')) continue;
            const response = await cache.match(key);
            if (response && (await response.text()).includes('Sound check')) return true;
          }
          return false;
        }),
      { timeout: 30_000 },
    )
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(itemRow(page, 'Sound check')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Offline', { exact: true }).first()).toBeVisible();
  await context.setOffline(false);
});
