import { test, type Page } from '@playwright/test';
import { expect, freshPhone, isolateIp, signInWithPhone } from './support/auth.js';

// P11-T10: UF-22 public registration end to end on a FRESH event per run
// (parallel-safe: fresh host, fresh event, unique buyers). Covers TKT-01–04
// (organiser adds types, publishes) and UF-22-2/22-3 (guest buys free +
// paid-pending). Requires `pnpm db:seed` + S3Mock only for other suites.
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

/** Fresh PUBLIC conference with tickets on; returns the event id. */
async function newTicketedEvent(page: Page, name: string): Promise<string> {
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
  await page.getByRole('radio', { name: /Public/ }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'Choose features' })).toBeVisible();
  await expect(page.getByText('Tickets', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Create event' }).click();
  await expect(page).toHaveURL(/\/events\/[0-9a-f-]+\?welcome=1$/);
  const id = page.url().match(/\/events\/([^?]+)/)?.[1];
  if (!id) throw new Error('no event id');
  return id;
}

async function addTypesAndPublish(page: Page, eventId: string): Promise<string> {
  await gotoSettled(page, `/events/${eventId}/tickets`);
  await expect(page.getByRole('heading', { name: 'Tickets' })).toBeVisible();
  await page.getByLabel('Name', { exact: true }).fill('General');
  await page.getByLabel('Price', { exact: true }).fill('0');
  await page.getByLabel('Quantity', { exact: true }).fill('100');
  await page.getByRole('button', { name: 'Add ticket type' }).click();
  await expect(page.getByText('General', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('Name', { exact: true }).fill('VIP');
  await page.getByLabel('Price', { exact: true }).fill('500000');
  await page.getByLabel('Quantity', { exact: true }).fill('20');
  await page.getByRole('button', { name: 'Add ticket type' }).click();
  await expect(page.getByText('VIP', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  // Publish the public page (second switch in the Settings card).
  const switches = page.getByRole('switch');
  await expect(switches).toHaveCount(2);
  if ((await switches.nth(1).getAttribute('aria-checked')) !== 'true') await switches.nth(1).click();
  await expect(switches.nth(1)).toHaveAttribute('aria-checked', 'true');
  const link = page.getByRole('link', { name: 'View public page' });
  await expect(link).toBeVisible();
  const href = await link.getAttribute('href');
  if (!href) throw new Error('no public link');
  return href;
}

test('seeded concert page renders (Lighthouse seed URL)', async ({ page }) => {
  await isolateIp(page);
  await gotoSettled(page, '/e/seed-concert');
  await expect(page.getByRole('heading', { name: 'Lagos Live Concert' }).first()).toBeVisible();
  await expect(page.getByText('General', { exact: true }).first()).toBeVisible();
});

test('UF-22 organiser adds types and publishes; guest buys free + paid-pending', async ({ page }, testInfo) => {
  const tag = `${testInfo.project.name}-${RUN}`;
  const hostName = `Ticket Host ${tag}`;
  await signedUpHost(page, hostName);
  const eventId = await newTicketedEvent(page, `Ticketed Night ${tag}`);
  const publicPath = await addTypesAndPublish(page, eventId);

  // Guest flow runs in the same browser (public pages need no account).
  const freeBuyer = `Free Buyer ${tag}`;
  await gotoSettled(page, publicPath);
  await expect(page.getByText('General', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: '+ General' }).click();
  await page.getByRole('button', { name: /Get tickets/ }).click();
  await expect(page).toHaveURL(/\/register/);
  await page.getByLabel('Full name').fill(freeBuyer);
  await page.getByLabel('Email').fill(`free-${tag}@example.com`.replace(/[^a-z0-9@.-]/gi, ''));
  await expect(page.getByLabel('Full name')).toHaveValue(freeBuyer);
  await expect(page.getByRole('button', { name: 'Confirm' })).toBeEnabled();
  await page.getByRole('button', { name: 'Confirm' }).click();
  // UF-22-3: free tickets issue instantly.
  await expect(page).toHaveURL(/\/t\//, { timeout: 30_000 });
  await expect(page.getByText('Show this QR at the door.')).toBeVisible();
  await expect(page.getByText(freeBuyer)).toBeVisible();

  // Paid VIP reservation waits for the organiser (lean offline, no provider).
  const paidBuyer = `Paid Buyer ${tag}`;
  await gotoSettled(page, publicPath);
  await page.getByRole('button', { name: '+ VIP' }).click();
  await page.getByRole('button', { name: /Get tickets/ }).click();
  await expect(page).toHaveURL(/\/register/);
  await page.getByLabel('Full name').fill(paidBuyer);
  await page.getByLabel('Email').fill(`paid-${tag}@example.com`.replace(/[^a-z0-9@.-]/gi, ''));
  await expect(page.getByRole('button', { name: 'Confirm' })).toBeEnabled();
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page).toHaveURL(/\/register\/pending/, { timeout: 30_000 });
  await expect(page.getByText('Pay the organiser directly')).toBeVisible();

  // Organiser confirms the paid order → PAID.
  await gotoSettled(page, `/events/${eventId}/tickets`);
  const row = page.locator(`li[data-buyer="${paidBuyer}"]`);
  await expect(row).toBeVisible({ timeout: 60_000 });
  await row.getByRole('button', { name: /Mark as paid/ }).click();
  await expect(row.getByRole('button', { name: /Mark as paid/ })).toHaveCount(0, { timeout: 30_000 });
  await expect(row.getByText(/PAID ·/)).toBeVisible();
});
