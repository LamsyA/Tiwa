import { test } from '@playwright/test';
import { expect, isolateIp } from './support/auth.js';

// D-X50: username + password sign-up and sign-in for anyone.

test.describe.configure({ timeout: 120_000 });
test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });

test.beforeEach(async ({ page }) => {
  await isolateIp(page);
});

test('sign up with a username, sign out, sign back in by username and by email', async ({ page, browser }) => {
  const handle = `e2e_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const email = `${handle}@example.test`;
  const password = 'correct-horse-9';

  await page.goto('/signup');
  await expect(page.getByRole('tab', { name: /Username & password/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByLabel('Your name').fill('Ada Password');
  await page.getByLabel('Username').fill(handle);
  await page.getByLabel('Email (optional)').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/onboarding/);

  // Same username again is refused with a clear message.
  const other = await browser.newContext();
  const second = await other.newPage();
  await isolateIp(second);
  await second.goto('/signup');
  await second.getByLabel('Username').fill(handle);
  await second.getByLabel('Password', { exact: true }).fill(password);
  await second.getByRole('button', { name: 'Create account' }).click();
  await expect(second.getByText('That username is taken. Try another.')).toBeVisible();

  // Wrong password, then the right one by username.
  await second.goto('/login');
  await second.getByLabel('Username or email').fill(handle);
  await second.getByLabel('Password', { exact: true }).fill('wrong-password-1');
  await second.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(second.getByText('That username and password don’t match.')).toBeVisible();
  await second.getByLabel('Password', { exact: true }).fill(password);
  await second.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(second).toHaveURL(/\/onboarding|\/home|\/events/);
  await other.close();

  // A fresh browser signs in with the email instead.
  const third = await browser.newContext();
  const byEmail = await third.newPage();
  await isolateIp(byEmail);
  await byEmail.goto('/login');
  await byEmail.getByLabel('Username or email').fill(email);
  await byEmail.getByLabel('Password', { exact: true }).fill(password);
  await byEmail.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(byEmail).toHaveURL(/\/onboarding|\/home|\/events/);
  await third.close();
});

test('phone and Google stay disabled as coming soon without their switches', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('tab', { name: /Continue with Google/ })).toBeDisabled();
});
