import { test } from '@playwright/test';
import { expect, isolateIp, latestMessage } from './support/auth.js';

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
  await page.getByLabel('Username', { exact: true }).fill(handle);
  await page.getByLabel('Email (optional)').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  // D-X51: a new account with a name still chooses a role (was landing as host).
  await expect(page).toHaveURL(/\/onboarding\/role/);
  await expect(page.getByRole('heading', { name: 'What brings you to Tiwa?' })).toBeVisible();

  // Same username again is refused with a clear message.
  const other = await browser.newContext();
  const second = await other.newPage();
  await isolateIp(second);
  await second.goto('/signup');
  await second.getByLabel('Username', { exact: true }).fill(handle);
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

test('D-X51: forgot password by username emails a link that sets a new password', async ({ page }) => {
  const handle = `e2e_rp_${Date.now().toString(36)}`;
  const email = `${handle}@example.test`;
  await page.goto('/signup');
  await page.getByLabel('Username', { exact: true }).fill(handle);
  await page.getByLabel('Email (optional)').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('first-password-1');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/onboarding\/role/);
  await page.context().clearCookies();

  await page.goto('/login');
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await expect(page.getByRole('heading', { name: 'Forgot your password?' })).toBeVisible();
  // D-X53: an unknown account gets a clear error, not a spinner.
  await page.getByLabel('Username or email').fill(`${handle}_nobody`);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText('No account matches that username or email')).toBeVisible();
  await page.getByLabel('Username or email').fill(handle);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText('Check your email')).toBeVisible();

  const body = await latestMessage(page.request, email);
  expect(body).toContain('Reset your password');
  expect(body).toContain('10 minutes');
  const link = body.match(/href="([^"]*reset-password[^"]*)"/)?.[1]?.replace(/&amp;/g, '&');
  if (!link) throw new Error('no reset link in outbox');
  await page.goto(link);
  await expect(page).toHaveURL(/\/reset-password\?token=/);
  await page.getByLabel('New password', { exact: true }).fill('second-password-2');
  await page.getByLabel('Confirm new password').fill('second-password-2');
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByText('Password updated')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel('Username or email').fill(handle);
  await page.getByLabel('Password', { exact: true }).fill('first-password-1');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('That username and password don’t match.')).toBeVisible();
  await page.getByLabel('Password', { exact: true }).fill('second-password-2');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding/);

  // The same link cannot be used twice.
  await page.goto(link);
  await expect(page.getByText('This link has expired')).toBeVisible();
});
