import { test, type Page } from '@playwright/test';
import { expect, freshPhone, isolateIp, signInWithPhone } from './support/auth.js';

// P11-T10: UF-23 door check-in on a FRESH event per run (parallel-safe).
// Covers OK → DUPLICATE with the first scan's time (UF-23-1) via the manual
// name fallback, plus the offline download for the door (UF-23-2 reads).
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

test('UF-23-1 ticket checks in once, then reports the duplicate', async ({ page }, testInfo) => {
  const tag = `${testInfo.project.name}-${RUN}`;
  await isolateIp(page);
  await signInWithPhone(page, '/signup', freshPhone());
  await expect(page.getByRole('link', { name: /I'm hosting an event/ })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('link', { name: /I'm hosting an event/ }).click();
  await page.getByLabel('Your name').fill(`Door Host ${tag}`);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('button', { name: /Concert/ }).first()).toBeVisible({ timeout: 60_000 });

  // Fresh PUBLIC conference with tickets on.
  await page
    .getByRole('button', { name: /Concert/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'The basics' })).toBeVisible();
  await page.getByLabel('Event name').fill(`Door Night ${tag}`);
  await page.getByLabel('Date', { exact: true }).fill('2031-07-01');
  await page.getByLabel('Starts').fill('19:00');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'Where and when' })).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'Guests and budget' })).toBeVisible();
  await page.getByLabel('Expected guests').fill('100');
  await page.getByLabel('Total budget').fill('1000000');
  await page.getByRole('radio', { name: /Public/ }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'Choose features' })).toBeVisible();
  await page.getByRole('button', { name: 'Create event' }).click();
  await expect(page).toHaveURL(/\/events\/[0-9a-f-]+\?welcome=1$/);
  const eventId = page.url().match(/\/events\/([^?]+)/)?.[1];
  if (!eventId) throw new Error('no event id');

  // One free ticket type, published.
  await gotoSettled(page, `/events/${eventId}/tickets`);
  await expect(page.getByRole('heading', { name: 'Tickets' })).toBeVisible();
  await page.getByLabel('Name', { exact: true }).fill('General');
  await page.getByLabel('Price').fill('0');
  await page.getByLabel('Quantity').fill('50');
  await page.getByRole('button', { name: 'Add ticket type' }).click();
  await expect(page.getByText('General', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  const switches = page.getByRole('switch');
  await expect(switches).toHaveCount(2);
  if ((await switches.nth(1).getAttribute('aria-checked')) !== 'true') await switches.nth(1).click();
  await expect(switches.nth(1)).toHaveAttribute('aria-checked', 'true');
  const href = await page.getByRole('link', { name: 'View public page' }).getAttribute('href');
  if (!href) throw new Error('no public link');

  // Guest buys a free ticket (public, no account).
  const buyer = `Door Buyer ${tag}`;
  await gotoSettled(page, href);
  await page.getByRole('button', { name: '+ General' }).click();
  await page.getByRole('button', { name: /Get tickets/ }).click();
  await expect(page).toHaveURL(/\/register/);
  await page.getByLabel('Full name').fill(buyer);
  await page.getByLabel('Email').fill(`door-${tag}@example.com`.replace(/[^a-z0-9@.-]/gi, ''));
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page).toHaveURL(/\/t\//, { timeout: 30_000 });

  // Door: search the name, check in → welcome; again → duplicate.
  await gotoSettled(page, `/events/${eventId}/check-in`);
  await expect(page.getByTestId('checkin-counter')).toBeVisible();
  await page.getByLabel('search').fill(buyer);
  await page.getByRole('button', { name: 'Search' }).click();
  const row = page.locator('li').filter({ hasText: buyer }).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.getByRole('button', { name: 'Check in' }).click();
  await expect(page.getByText(`Welcome, ${buyer}`)).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('search').fill(buyer);
  await page.getByRole('button', { name: 'Search' }).click();
  const again = page.locator('li').filter({ hasText: buyer }).first();
  await expect(again).toBeVisible({ timeout: 30_000 });
  await again.getByRole('button', { name: 'Check in' }).click();
  await expect(page.getByText('Already checked in at')).toBeVisible({ timeout: 30_000 });

  // Offline list downloads for the door (UF-23-2 reads).
  await page.getByRole('button', { name: 'Make available offline' }).click();
  await expect(page.getByText(/Offline list ready/).first()).toBeVisible({ timeout: 30_000 });
});
