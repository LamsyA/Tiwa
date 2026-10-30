import { test } from '@playwright/test';
import { expect, freshPhone, isolateIp, signInWithPhone } from './support/auth.js';

// P3-T13 regression: with the service worker controlling the page, repeated
// section-tab navigations must all complete. Serwist's defaultCache used to
// run header-less NetworkFirst over RSC payloads, which intermittently
// wedged navigations (URL changed, content never arrived).
test.describe.configure({ timeout: 180_000 });
test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });

test('tab navigation completes under the service worker', async ({ page }) => {
  await isolateIp(page);
  await signInWithPhone(page, '/signup', freshPhone());
  await expect(page).toHaveURL(/\/onboarding\/role/);
  await page.getByRole('link', { name: /I'm hosting an event/ }).click();
  await page.getByLabel('Your name').fill('SW Host');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/events\/new$/);

  await page
    .getByRole('button', { name: /Birthday/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'The basics' })).toBeVisible();
  await page.getByLabel('Event name').fill('SW Nav Party');
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

  // The worker must actually control the page for this test to mean anything.
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker?.controller)), { timeout: 15_000 })
    .toBe(true);

  const nav = page.getByRole('navigation', { name: 'Event sections' });
  const rounds: Array<[string, string]> = [
    ['Plan', 'Order the cake'],
    ['Money', 'Budget by category'],
    ['Documents', 'Upload'],
    ['Settings', 'Event settings'],
    ['Overview', 'Progress'],
  ];
  for (let round = 0; round < 3; round += 1) {
    for (const [tab, marker] of rounds) {
      await nav.getByRole('link', { name: tab, exact: true }).click();
      await expect(page.getByText(marker).first()).toBeVisible({ timeout: 10_000 });
    }
  }
});
