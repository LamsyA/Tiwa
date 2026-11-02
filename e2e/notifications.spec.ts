import { test, type Page } from '@playwright/test';
import { expect, freshPhone, isolateIp, signInWithPhone } from './support/auth.js';

// P13-T06: notification preferences persist, the bell renders, push
// onboarding gives feedback. Delivery itself is covered by the core table
// test plus the worker fan-out tests (no real providers in e2e).
test.describe.configure({ mode: 'serial', timeout: 240_000 });
test.use({ actionTimeout: 20_000, navigationTimeout: 30_000 });

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

async function signedUp(page: Page): Promise<void> {
  await isolateIp(page);
  await signInWithPhone(page, '/signup', freshPhone());
  await expect(page.getByRole('link', { name: /I'm hosting an event/ })).toBeVisible({ timeout: 60_000 });
}

test('notification prefs persist and the bell renders', async ({ page }) => {
  await signedUp(page);
  await gotoSettled(page, '/settings/notifications');
  await expect(page.getByRole('link', { name: 'Notifications', exact: true })).toBeVisible();
  await expect(page.getByText('Web push')).toBeVisible();

  // The bell is quiet for a fresh account.
  await expect(page.getByRole('link', { name: '0 unread notifications' })).toBeVisible();

  // Turn email off for chat messages, save, and see it stick after reload.
  const card = page
    .locator('div')
    .filter({ hasText: 'Chat · Message' })
    .filter({ has: page.getByRole('checkbox', { name: 'Email' }) })
    .last();
  const email = card.getByRole('checkbox', { name: 'Email' });
  await expect(email).toBeVisible();
  if (await email.isChecked()) await email.uncheck();
  await page.getByRole('button', { name: 'Save preferences' }).click();
  await expect(page.getByText('Preferences saved.')).toBeVisible({ timeout: 30_000 });
  await page.reload();
  const cardAfter = page
    .locator('div')
    .filter({ hasText: 'Chat · Message' })
    .filter({ has: page.getByRole('checkbox', { name: 'Email' }) })
    .last();
  await expect(cardAfter.getByRole('checkbox', { name: 'Email' })).not.toBeChecked();

  // Quiet hours persist too.
  await page.getByLabel('Start').fill('22:00');
  await page.getByLabel('End').fill('06:00');
  await page.getByRole('button', { name: 'Save preferences' }).click();
  await expect(page.getByText('Preferences saved.')).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await expect(page.getByLabel('Start')).toHaveValue('22:00');

  // The inbox starts empty.
  await gotoSettled(page, '/notifications');
  await expect(page.getByText("You're all caught up.")).toBeVisible();

  // Push onboarding always answers (enabled or a clear reason why not).
  await gotoSettled(page, '/settings/notifications');
  await page.getByRole('button', { name: 'Enable push on this device' }).click();
  await expect(
    page
      .getByText('Push is on for this device.')
      .or(page.getByText('Notifications are blocked'))
      .or(page.getByText("Push isn't available"))
      .or(page.getByText("Push isn't supported"))
      .first(),
  ).toBeVisible({ timeout: 30_000 });
});
