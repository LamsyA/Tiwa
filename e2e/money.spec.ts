import { test, type Page } from '@playwright/test';
import { expect, freshPhone, isolateIp, signInWithPhone } from './support/auth.js';

// P9-T08: UF-20 budget and contributions (D-X28). A fresh host creates a
// birthday with a ₦500,000 budget, then: stat cards and the template
// categories show; an expense moves Committed/Paid; a pledge and a received
// part show under Contributions and Income; the CSV export downloads; a
// second tab sees a new expense within 5 s without reload (UF-20-2, via the
// 5 s LiveRefresh). UF-20-1 identities are property-tested in core; UF-20-3
// (no money permission → 403) is covered by core integration tests and the
// existing UF-04-1 e2e.
test.describe.configure({ mode: 'serial', timeout: 240_000 });
test.use({ actionTimeout: 20_000, navigationTimeout: 30_000 });

const RUN = Date.now().toString(36);

async function newHostWithEvent(page: Page, name: string): Promise<string> {
  await isolateIp(page);
  await signInWithPhone(page, '/signup', freshPhone());
  await expect(page).toHaveURL(/\/onboarding\/role/);
  await page.getByRole('link', { name: /I'm hosting an event/ }).click();
  await page.getByLabel('Your name').fill('Money Host');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/events\/new$/);
  await page
    .getByRole('button', { name: /Birthday/ })
    .first()
    .click();
  await page.getByLabel('Event name').fill(name);
  await page.getByLabel('Date', { exact: true }).fill('2031-06-01');
  await page.getByLabel('Starts').fill('16:00');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Expected guests').fill('50');
  await page.getByLabel('Total budget').fill('500000');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Create event' }).click();
  await expect(page).toHaveURL(/\/events\/[0-9a-f-]+\?welcome=1$/);
  return new URL(page.url()).pathname.split('/')[2] as string;
}

test('UF-20: budget figures, expense, pledge, income, export and live update', async ({ browser }) => {
  const context = await browser.newContext();
  const host = await context.newPage();
  const eventId = await newHostWithEvent(host, `Money Party ${RUN}`);

  // Step 1: five stat cards and the template's categories.
  await host.goto(`/events/${eventId}/money`);
  for (const label of ['Planned', 'Committed', 'Paid', 'Outstanding', 'Uncommitted']) {
    await expect(host.getByText(label, { exact: true }).first()).toBeVisible();
  }
  await expect(host.getByText(/500,000/).first()).toBeVisible();
  await expect(host.getByText('Venue').first()).toBeVisible();

  // Expenses tab: a paid ₦20,000 expense → Committed and Paid both ₦20,000.
  await host.getByRole('tab', { name: 'Expenses' }).click();
  await expect(host).toHaveURL(/tab=expenses/);
  await host.getByRole('button', { name: 'Add expense' }).click();
  const expense = host.getByRole('dialog');
  await expense.getByLabel('What was it for?').fill(`Printing ${RUN}`);
  await expense.getByLabel('Amount').fill('20000');
  await expense.getByRole('button', { name: 'Save' }).click();
  await expect(host.getByText(`Printing ${RUN}`)).toBeVisible();
  await expect(host.getByText(/20,000/).first()).toBeVisible();

  // Step 3: pledge with a part received.
  await host.getByRole('tab', { name: 'Contributions' }).click();
  await host.getByRole('button', { name: 'Add pledge' }).click();
  const pledge = host.getByRole('dialog');
  await pledge.getByLabel('Name').fill(`Uncle Tunde ${RUN}`);
  await pledge.getByLabel('Pledged amount').fill('100000');
  await pledge.getByRole('button', { name: 'Save' }).click();
  await expect(host.getByText(`Uncle Tunde ${RUN}`)).toBeVisible();
  await host.getByRole('button', { name: 'Record received' }).first().click();
  await host.getByRole('dialog').getByLabel('Amount received').fill('40000');
  await host.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(host.getByText(/40,000/).first()).toBeVisible();

  // Income tab sums by kind.
  await host.getByRole('tab', { name: 'Income' }).click();
  await expect(host.getByText('Family').first()).toBeVisible();

  // Step 4: CSV export downloads with the expense in it.
  const [download] = await Promise.all([
    host.waitForEvent('download'),
    host.getByRole('link', { name: 'Export CSV' }).click(),
  ]);
  const csv = await (await download.createReadStream()).toArray();
  expect(Buffer.concat(csv).toString('utf8')).toContain(`Printing ${RUN}`);

  // UF-20-2: a second tab adds an expense; the first tab's cards update within ~5 s without reload.
  await host.goto(`/events/${eventId}/money`);
  await expect(host.getByText(/20,000/).first()).toBeVisible();
  const other = await context.newPage();
  await other.goto(`/events/${eventId}/money?tab=expenses`);
  await other.getByRole('button', { name: 'Add expense' }).click();
  await other.getByRole('dialog').getByLabel('What was it for?').fill(`Ice ${RUN}`);
  await other.getByRole('dialog').getByLabel('Amount').fill('15000');
  await other.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(other.getByText(`Ice ${RUN}`)).toBeVisible();
  await expect(host.getByText(/35,000/).first()).toBeVisible({ timeout: 8_000 });

  await context.close();
});
