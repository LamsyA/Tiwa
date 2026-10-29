import { test } from '@playwright/test';
import { expect, freshPhone, isolateIp, signInWithPhone } from './support/auth.js';

// P3-T10 smoke: settings page renders at both widths and a rename persists (formal UF e2e lands in P3-T12).
test.describe.configure({ timeout: 180_000 });
test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });

test('P3-T10: event settings page loads, renames the event and persists', async ({ page }) => {
  await isolateIp(page);
  await signInWithPhone(page, '/signup', freshPhone());
  await expect(page).toHaveURL(/\/onboarding\/role/);
  await page.getByRole('link', { name: /I'm hosting an event/ }).click();
  await page.getByLabel('Your name').fill('Smoke Host');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/events\/new$/);

  await page
    .getByRole('button', { name: /Birthday/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'The basics' })).toBeVisible();
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
  await page.getByRole('button', { name: 'Create event' }).click();
  await expect(page).toHaveURL(/\/events\/[0-9a-f-]+\?welcome=1$/);

  const eventUrl = new URL(page.url()).pathname;
  await page.goto(`${eventUrl}/settings`);
  await expect(page.getByRole('heading', { name: 'Event settings' })).toBeVisible();
  await expect(page.getByText('Features and visibility')).toBeVisible();
  await expect(page.getByText('Cover image and theme')).toBeVisible();
  await expect(page.getByText('Danger zone')).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await page.getByLabel('Event name').fill('Smoke Event Renamed');
  const saved = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().includes('/settings'),
  );
  await page.getByRole('button', { name: 'Save' }).first().click();
  await saved;
  await expect(page.getByText('Saved').first()).toBeVisible();

  await page.reload();
  await expect(page.getByLabel('Event name')).toHaveValue('Smoke Event Renamed');
});
