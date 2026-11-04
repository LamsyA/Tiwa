import { test, type Page } from '@playwright/test';
import { expect, isolateIp } from './support/auth.js';

// D-X61: the demo businesses (`pnpm db:seed:demo`) book end to end. A new host
// (username + password) asks Lens & Light Studios for a quote from its
// profile; the owner signs in as @lensandlight with the demo password, sends
// the quote, and the host accepts it into a booking.
test.describe.configure({ mode: 'serial', timeout: 300_000 });
test.use({ actionTimeout: 20_000, navigationTimeout: 30_000 });

const RUN = Date.now().toString(36);
const DEMO_PASSWORD = process.env.DEMO_BUSINESS_PASSWORD ?? 'TiwaDemo2026!';

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

async function newHostWithEvent(page: Page, eventName: string): Promise<string> {
  await isolateIp(page);
  await page.goto('/signup');
  await page.getByLabel('Your name').fill('Demo Booker');
  await page.getByLabel('Username', { exact: true }).fill(`host_${RUN}`);
  await page.getByLabel('Password', { exact: true }).fill('host-password-1');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/onboarding\/role/);
  await page.getByRole('link', { name: /I'm hosting an event/ }).click();
  await page
    .getByLabel('Your name')
    .fill('Demo Booker', { timeout: 3000 })
    .catch(() => undefined);
  await page
    .getByRole('button', { name: 'Continue' })
    .click({ timeout: 3000 })
    .catch(() => undefined);
  await expect(page).toHaveURL(/\/events\/new$/);
  await page
    .getByRole('button', { name: /Birthday/ })
    .first()
    .click();
  await page.getByLabel('Event name').fill(eventName);
  await page.getByLabel('Date', { exact: true }).fill('2031-06-01');
  await page.getByLabel('Starts').fill('16:00');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'Where and when' })).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Expected guests').fill('80');
  await page.getByLabel('Total budget').fill('2000000');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Create event' }).click();
  await expect(page).toHaveURL(/\/events\/[0-9a-f-]+\?welcome=1$/);
  return new URL(page.url()).pathname.split('/')[2] as string;
}

test('D-X61: a host books a demo vendor whose owner signs in with the demo password', async ({ browser }) => {
  const hostCtx = await browser.newContext();
  const vendorCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  const vendor = await vendorCtx.newPage();
  const brief = `Photos for 80 guests ${RUN}`;

  const eventId = await newHostWithEvent(host, `Demo Party ${RUN}`);
  await gotoSettled(host, `/vendors/demo-lens-and-light?eventId=${eventId}`);
  await expect(host.getByRole('heading', { name: 'Lens & Light Studios' })).toBeVisible();
  await host.getByRole('button', { name: 'Request a quote' }).first().click();
  const dialog = host.getByRole('dialog');
  await dialog.getByLabel('What do you need?').fill(brief);
  await dialog.getByRole('button', { name: 'Send request' }).click();
  await expect(dialog.getByText('Request sent')).toBeVisible({ timeout: 30_000 });

  await isolateIp(vendor);
  await vendor.goto('/login?next=%2Fquotes');
  await vendor.getByLabel('Username or email').fill('lensandlight');
  await vendor.getByLabel('Password', { exact: true }).fill(DEMO_PASSWORD);
  await vendor.getByRole('button', { name: 'Sign in' }).click();
  await expect(vendor).toHaveURL(/\/quotes/);
  await expect(vendor.getByText(brief)).toBeVisible({ timeout: 30_000 });
  await vendor.getByRole('link', { name: 'New quote' }).first().click();
  await vendor.getByPlaceholder('Item').fill('Half day coverage');
  await vendor.getByLabel('Qty').fill('1');
  await vendor.getByLabel('Unit price').fill('350000');
  await vendor.getByLabel(/Cancellation terms/).fill('50% refund up to 14 days before');
  await vendor.getByLabel(/Valid until/).fill('2031-01-01');
  await vendor.getByRole('button', { name: 'Send quote' }).click();
  await expect(vendor.getByText('SENT')).toBeVisible();

  await gotoSettled(host, `/events/${eventId}/vendors/photography`);
  await expect(host.getByRole('button', { name: 'Accept' }).first()).toBeVisible({ timeout: 30_000 });
  await host.getByRole('button', { name: 'Accept' }).first().click();
  await host.getByLabel(/I agree to the scope/).check();
  await host.getByRole('button', { name: 'Accept and continue' }).click();
  const viewBooking = host.getByRole('link', { name: 'View booking' });
  await expect(viewBooking).toBeVisible({ timeout: 30_000 });
  await viewBooking.click();
  await expect(host).toHaveURL(/\/events\/.+\/bookings\/.+/);
  await expect(host.getByText(/350,000/).first()).toBeVisible();

  await hostCtx.close();
  await vendorCtx.close();
});
