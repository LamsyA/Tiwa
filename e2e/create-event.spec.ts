import { test, type Page } from '@playwright/test';
import { expect, freshPhone, isolateIp, signInWithPhone } from './support/auth.js';

// P3-T12: UF-03 create an event (EVT-01..04, EVT-13).
test.describe.configure({ timeout: 180_000 });
test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });

test.beforeEach(async ({ page }) => {
  await isolateIp(page);
});

async function signedUpHost(page: Page): Promise<void> {
  await signInWithPhone(page, '/signup', freshPhone());
  await expect(page).toHaveURL(/\/onboarding\/role/);
  await page.getByRole('link', { name: /I'm hosting an event/ }).click();
  await page.getByLabel('Your name').fill('UF03 Host');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/events\/new$/);
}

/** Drive the birthday wizard to the features step; returns the ms taken. */
async function birthdayToFeatures(page: Page, name: string): Promise<void> {
  await page
    .getByRole('button', { name: /Birthday/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'The basics' })).toBeVisible();
  await page.getByLabel('Event name').fill(name);
  await page.getByLabel('Date', { exact: true }).fill('2031-03-01');
  await page.getByLabel('Starts').fill('16:00');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'Where and when' })).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'Guests and budget' })).toBeVisible();
  await page.getByLabel('Expected guests').fill('50');
  await page.getByLabel('Total budget').fill('500000');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'Choose features' })).toBeVisible();
}

test('UF-03-1/3/4: birthday in under 60s, template tasks + budget applied, no tickets switch', async ({ page }) => {
  await signedUpHost(page);
  const started = Date.now();
  await birthdayToFeatures(page, 'Sixty Second Party');

  // UF-03-4: private-celebration formats have no Public visibility, so no tickets switch.
  await expect(page.getByText('Tickets', { exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Create event' }).click();
  await expect(page).toHaveURL(/\/events\/[0-9a-f-]+\?welcome=1$/);
  expect(Date.now() - started).toBeLessThan(60_000);
  const eventUrl = new URL(page.url()).pathname;

  // UF-03-3: checklist tasks and budget categories match the birthday template.
  await page.goto(`${eventUrl}/plan`);
  await expect(page.getByText('Order the cake')).toBeVisible();
  await page.goto(`${eventUrl}/money`);
  await expect(page.getByText('Food and drinks')).toBeVisible();
});

test('UF-03-2: reloading resumes at the same step with saved input', async ({ page }) => {
  await signedUpHost(page);
  await page
    .getByRole('button', { name: /Birthday/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'The basics' })).toBeVisible();
  await page.getByLabel('Event name').fill('Resume Me Party');
  await page.getByLabel('Date', { exact: true }).fill('2031-04-02');
  await page.getByLabel('Starts').fill('15:00');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'Where and when' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Where and when' })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { name: 'The basics' })).toBeVisible();
  await expect(page.getByLabel('Event name')).toHaveValue('Resume Me Party');
  await expect(page.getByLabel('Date', { exact: true })).toHaveValue('2031-04-02');
});

test('UF-03-4: public concert offers the tickets switch', async ({ page }) => {
  await signedUpHost(page);
  await page
    .getByRole('button', { name: /Concert/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'The basics' })).toBeVisible();
  await page.getByLabel('Event name').fill('Ticketed Night');
  await page.getByLabel('Date', { exact: true }).fill('2031-05-01');
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
});
