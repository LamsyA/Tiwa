import { test, type Browser, type Page } from '@playwright/test';
import { expect, freshPhone, isolateIp, signInWithPhone } from './support/auth.js';

// P7-T13: UF-14 (request) → UF-15 (vendor quote) → UF-16 (compare + accept
// → booking) → UF-19 (change request → v2). Fresh vendor (catering, published
// via the UF-13 UI) and fresh host with a birthday event; parallel-safe via
// unique names. Requires `pnpm db:seed` and S3Mock on :9090.
// Money: the vendor prices in major units; the booking total asserts the
// server-computed minor total (UF-15-1 parity is pinned by
// quote-totals.test.ts).
test.describe.configure({ mode: 'serial', timeout: 420_000 });
test.use({ actionTimeout: 20_000, navigationTimeout: 30_000 });

const RUN = Date.now().toString(36);

/** goto that survives a racing router.refresh() from the previous page. */
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

function pngBuffer(seed: number, sizeKB = 50): Buffer {
  const onePx = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABRU5ErkJggg==',
    'base64',
  );
  const pad = Buffer.alloc(Math.max(0, sizeKB * 1024 - onePx.length), seed % 251);
  return Buffer.concat([onePx, pad]);
}

/** Fresh vendor with a published catering profile; returns the business name. */
async function newCateringVendor(page: Page): Promise<string> {
  const name = `E2E Cater ${RUN}`;
  await isolateIp(page);
  await signInWithPhone(page, '/signup', freshPhone());
  await expect(page).toHaveURL(/\/onboarding\/role/);
  await page.getByRole('link', { name: /provide event services/i }).click();
  await expect(page).toHaveURL(/\/onboarding\/business\?role=vendor/);
  await page
    .getByLabel('Your name')
    .fill('E2E Owner')
    .catch(() => undefined);
  await page.getByLabel('Business name').fill(name);
  await page.getByLabel('City').first().fill('Lagos');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/home/);

  await gotoSettled(page, '/business/profile');
  await expect(page.getByRole('heading', { name: 'Get listed' })).toBeVisible();
  await page.getByRole('button', { name: 'Catering', exact: true }).click();
  await page.getByLabel('About').fill(`${name} — party food.`);
  await page.getByLabel('City', { exact: true }).fill('Lagos');
  await page.getByRole('button', { name: 'Save' }).first().click();
  await expect(page.getByText('Saved')).toBeVisible();

  const files = Array.from({ length: 6 }, (_, i) => ({
    name: `dish-${i}.png`,
    mimeType: 'image/png',
    buffer: pngBuffer(i),
  }));
  await gotoSettled(page, '/business/profile');
  await page.locator('input[type="file"][accept*="image"]').first().setInputFiles(files);
  await expect(page.locator('li img')).toHaveCount(6, { timeout: 90_000 });

  await page.getByRole('button', { name: 'Add package' }).click();
  await page.getByLabel('Package name').fill('Party platters');
  const partyForm = page.locator('form', { has: page.getByLabel('Package name') });
  await partyForm.getByLabel('Starting price').fill('250000');
  await partyForm.getByLabel("What's included (one per line)").fill('100 portions\nSetup');
  await page.getByRole('button', { name: 'Save' }).last().click();
  await expect(page.getByText('Party platters')).toBeVisible();

  await page.getByRole('button', { name: 'Publish profile' }).click();
  await expect(page.getByText('Your profile is live')).toBeVisible();
  return name;
}

/** Fresh host with a birthday event; returns the event id. */
async function newHostWithEvent(page: Page, name: string): Promise<string> {
  await isolateIp(page);
  await signInWithPhone(page, '/signup', freshPhone());
  await expect(page).toHaveURL(/\/onboarding\/role/);
  await page.getByRole('link', { name: /I'm hosting an event/ }).click();
  await page.getByLabel('Your name').fill('UF Host');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/events\/new$/);

  await page.getByRole('button', { name: /Birthday/ }).first().click();
  await expect(page.getByRole('heading', { name: 'The basics' })).toBeVisible();
  await page.getByLabel('Event name').fill(name);
  await page.getByLabel('Date', { exact: true }).fill('2031-06-01');
  await page.getByLabel('Starts').fill('16:00');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'Where and when' })).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'Guests and budget' })).toBeVisible();
  await page.getByLabel('Expected guests').fill('50');
  await page.getByLabel('Total budget').fill('500000');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'Choose features' })).toBeVisible();
  await page.getByRole('button', { name: 'Create event' }).click();
  await expect(page).toHaveURL(/\/events\/[0-9a-f-]+\?welcome=1$/);
  return new URL(page.url()).pathname.split('/')[2] as string;
}

test('UF-14/15/16/19: request → quote → accept → booking → change to v2', async ({ browser }) => {
  const vendorCtx = await browser.newContext();
  const hostCtx = await browser.newContext();
  const vendor = await vendorCtx.newPage();
  const host = await hostCtx.newPage();

  const vendorName = await newCateringVendor(vendor);
  const eventId = await newHostWithEvent(host, `Quote Party ${RUN}`);

  // UF-14-1: shortlist from search with the event attached.
  await gotoSettled(host, `/vendors?category=catering&q=${encodeURIComponent(vendorName)}&eventId=${eventId}`);
  await expect(async () => {
    await host.reload().catch(() => undefined);
    await expect(host.getByRole('link', { name: vendorName }).first()).toBeVisible({ timeout: 10_000 });
  }).toPass({ timeout: 90_000 });
  await host.getByRole('button', { name: /Shortlist/ }).first().click();
  await expect(host.getByRole('button', { name: /Shortlisted/ }).first()).toBeVisible();

  // UF-14: request up to 5 vendors with a prefilled brief.
  await gotoSettled(host, `/events/${eventId}/vendors/catering`);
  await host.getByText(vendorName).first().waitFor();
  await host.getByRole('checkbox', { name: new RegExp(vendorName) }).check();
  await host.getByLabel(/Notes for vendors/).fill('Jollof for 50');
  await host.getByRole('button', { name: /Send requests/ }).click();
  await expect(host.getByText(new RegExp(`${vendorName} · OPEN`))).toBeVisible();

  // UF-15: vendor builds the quote (server totals) and sends it.
  await gotoSettled(vendor, '/quotes');
  const enquiryLink = vendor.getByRole('link', { name: 'New quote' }).first();
  await enquiryLink.click();
  await vendor.getByPlaceholder('Item').fill('Jollof rice');
  await vendor.getByLabel('Qty').fill('50');
  await vendor.getByLabel('Unit price').fill('3000');
  await vendor.getByLabel(/Cancellation terms/).fill('50% refund before 7 days');
  await vendor.getByLabel(/Valid until/).fill('2031-01-01');
  await vendor.getByRole('button', { name: 'Send quote' }).click();
  await expect(vendor.getByText('SENT')).toBeVisible();

  // UF-16: host compares and accepts; milestones mirror the schedule.
  await gotoSettled(host, `/events/${eventId}/vendors/catering`);
  await expect(host.getByRole('button', { name: 'Accept' }).first()).toBeVisible({ timeout: 30_000 });
  await host.getByRole('button', { name: 'Accept' }).first().click();
  await host.getByLabel(/I agree to the scope/).check();
  await host.getByRole('button', { name: 'Accept and continue' }).click();
  const viewBooking = host.getByRole('link', { name: 'View booking' });
  await expect(viewBooking).toBeVisible({ timeout: 30_000 });
  await viewBooking.click();
  await expect(host).toHaveURL(/\/events\/.+\/bookings\/.+/);
  // 50 × ₦3,000 = ₦150,000 — the server-computed total.
  await expect(host.getByText(/150,000/)).toBeVisible();

  // UF-19: host requests doubling portions; vendor accepts; booking moves to v2.
  await host.getByRole('button', { name: 'Request change' }).click();
  await host.getByLabel('Qty').first().fill('100');
  await host.getByLabel(/Why is this change needed/).fill('Double portions');
  await host.getByRole('button', { name: 'Send change request' }).click();
  await expect(host.getByText('A change request is waiting')).toBeVisible();

  await gotoSettled(vendor, '/quotes');
  await vendor.getByRole('button', { name: 'Accept', exact: true }).first().click();
  await expect(vendor.getByText('Double portions')).toHaveCount(0, { timeout: 30_000 });

  await gotoSettled(host, (host.url().split('?')[0] as string).split('#')[0] as string);
  await expect(host.getByText(/300,000/)).toBeVisible();

  await vendorCtx.close();
  await hostCtx.close();
});
