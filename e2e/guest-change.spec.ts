import { test, type Page } from '@playwright/test';
import { expect, isolateIp } from './support/auth.js';

// D-X84 showcase: the guest count changes (80 → 100); Tiwa drafts the change
// for the per-guest catering line, the planner sends it, and the caterer
// approves from the WhatsApp link on a phone, signed out. The booking total
// and balance update for both sides.
test.describe.configure({ mode: 'serial', timeout: 300_000 });
test.use({ actionTimeout: 20_000, navigationTimeout: 30_000 });

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const PW = process.env.DEMO_BUSINESS_PASSWORD ?? 'TiwaDemo2026!';
const DAY = `2033-${String(1 + Math.floor(Math.random() * 12)).padStart(2, '0')}-${String(1 + Math.floor(Math.random() * 27)).padStart(2, '0')}`;

async function go(page: Page, url: string) {
  for (let i = 0; i < 3; i += 1) {
    try {
      await page.goto(url);
      return;
    } catch {
      await page.waitForTimeout(1000);
    }
  }
}

test('D-X84: guest count 80 → 100, caterer approves from the WhatsApp link', async ({ browser }) => {
  const host = await (await browser.newContext()).newPage();
  const vendor = await (await browser.newContext()).newPage();
  const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const eventName = `Guest Change Wedding ${RUN}`;

  // Host with an 80-guest event.
  await isolateIp(host);
  await go(host, '/signup');
  await host.getByLabel('Your name').fill('Count Host');
  await host.getByLabel('Username', { exact: true }).fill(`gc_${RUN}`);
  await host.getByLabel('Password', { exact: true }).fill('host-password-1');
  await host.getByRole('button', { name: 'Create account' }).click();
  await expect(host).toHaveURL(/\/onboarding\/role/);
  await host.getByRole('link', { name: /I'm hosting an event/ }).click();
  await host.waitForURL(/onboarding\/profile|events\/new/);
  if (host.url().includes('profile')) await host.getByRole('button', { name: /Continue/ }).click();
  await expect(host).toHaveURL(/\/events\/new$/);
  await host
    .getByRole('button', { name: /Wedding/i })
    .first()
    .click();
  await host.getByLabel('Event name').fill(eventName);
  await host.getByLabel('Date', { exact: true }).fill(DAY);
  await host.getByLabel('Starts').fill('12:00');
  for (let step = 0; step < 6; step += 1) {
    await host
      .getByLabel('Expected guests')
      .fill('80', { timeout: 1500 })
      .catch(() => undefined);
    await host
      .getByLabel('Total budget')
      .fill('5000000', { timeout: 500 })
      .catch(() => undefined);
    if (await host.getByRole('button', { name: 'Create event' }).isVisible()) break;
    await host.getByRole('button', { name: 'Next', exact: true }).click();
    await host.waitForTimeout(400);
  }
  await host.getByRole('button', { name: 'Create event' }).click();
  await expect(host).toHaveURL(/\/events\/[0-9a-f-]+\?welcome=1$/);
  const eventId = new URL(host.url()).pathname.split('/')[2] as string;

  // Ask the demo caterer for a quote.
  await go(host, `/vendors?category=catering&q=${encodeURIComponent('Iya Ronke')}&eventId=${eventId}`);
  await host
    .getByRole('button', { name: /Shortlist/ })
    .first()
    .click();
  await expect(host.getByRole('button', { name: /Shortlisted/ }).first()).toBeVisible();
  await go(host, `/events/${eventId}/vendors/catering`);
  await host.getByRole('checkbox', { name: /Iya Ronke/ }).check();
  await host.getByLabel(/Notes for vendors/).fill(`Jollof for everyone ${RUN}`);
  await host.getByRole('button', { name: /Send requests/ }).click();

  // The caterer quotes 80 portions.
  await isolateIp(vendor);
  await go(vendor, '/login?next=%2Fquotes');
  await vendor.waitForLoadState('networkidle');
  await vendor.getByLabel('Username or email').fill('iyaronke.kitchen');
  await vendor.getByLabel('Password', { exact: true }).fill(PW);
  await vendor.getByRole('button', { name: 'Sign in' }).click();
  await expect(vendor).toHaveURL(/\/quotes/);
  await vendor.getByRole('listitem').filter({ hasText: eventName }).getByRole('link').first().click();
  await vendor.getByPlaceholder('Item').fill('Jollof portions');
  await vendor.getByLabel('Qty').fill('80');
  await vendor.getByLabel('Unit price').fill('3000');
  await vendor.getByLabel(/Cancellation terms/).fill('50% refund before 7 days');
  await vendor.getByLabel(/Valid until/).fill('2033-01-01');
  await vendor.getByRole('button', { name: 'Send quote' }).click();
  await expect(vendor.getByText(/Quote sent/).first()).toBeVisible({ timeout: 30_000 });

  // Host accepts: ₦240,000 booked.
  await go(host, `/events/${eventId}/vendors/catering`);
  await host.getByRole('button', { name: 'Accept' }).first().click();
  await host.getByLabel(/I agree to the scope/).check();
  await host.getByRole('button', { name: 'Accept and continue' }).click();
  await expect(host.getByRole('link', { name: 'View booking' })).toBeVisible({ timeout: 30_000 });

  // The showcase: guest count 80 → 100.
  await go(host, `/events/${eventId}/guests`);
  await host.getByRole('button', { name: 'Guest count changed' }).click();
  const sheet = host.getByRole('dialog');
  await sheet.getByLabel(/New guest count/).fill('100');
  await sheet.getByRole('button', { name: 'See what changes' }).click();
  await expect(sheet.getByText("Iya Ronke's Kitchen")).toBeVisible({ timeout: 20_000 });
  await expect(sheet.getByText(/60,000/).first()).toBeVisible();
  await sheet.getByRole('button', { name: /Update and send to 1 vendor/ }).click();
  await expect(sheet.getByText('Sent to 1 vendor')).toBeVisible({ timeout: 30_000 });
  // D-X85: "Send all on WhatsApp" opens the vendor's chat; coming back marks it sent.
  const [popup] = await Promise.all([
    host.waitForEvent('popup'),
    sheet.getByRole('button', { name: /Send all on WhatsApp \(1\)/ }).click(),
  ]);
  const wa = popup.url();
  await popup.close();
  await host.bringToFront();
  await host.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(sheet.getByText('1 of 1 sent')).toBeVisible();
  await expect(sheet.getByText(/Your vendor has the link/)).toBeVisible();
  const text = decodeURIComponent(new URL(wa).searchParams.get('text') ?? '');
  expect(text).toContain('from 80 to 100');
  const link = text.match(/https?:\/\/\S+\/c\/\S+/)?.[0];
  expect(link).toBeTruthy();

  // The caterer opens the link on a phone, signed out, and approves.
  await go(phone, new URL(link as string).pathname);
  await expect(phone.getByRole('heading', { name: eventName })).toBeVisible();
  await expect(phone.getByText('Jollof portions')).toBeVisible();
  await expect(phone.getByText(/300,000/).first()).toBeVisible();
  await phone.getByRole('button', { name: 'Approve change' }).click();
  await expect(phone.getByText(/Approved\. Your booking and balance are updated/)).toBeVisible({ timeout: 30_000 });

  // A second tap on the same link can't decide it again.
  await phone.reload();
  await expect(phone.getByRole('button', { name: 'Approve change' })).toHaveCount(0);

  // Both sides now see the new total.
  // Committed money is the booking's new total (the quote itself stays as sent).
  await go(host, `/events/${eventId}/money`);
  await expect(host.getByText(/300,000/).first()).toBeVisible({ timeout: 20_000 });
  await go(host, `/events/${eventId}/guests`);
  await host.getByRole('button', { name: 'Guest count changed' }).click();
  await expect(host.getByRole('dialog').getByLabel(/New guest count \(now 100\)/)).toBeVisible();
});
