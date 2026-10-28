import { expect, test } from '@playwright/test';

test('home loads with brand, headline and no horizontal scroll', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');
  await expect(page).toHaveTitle(/Tiwa/);
  await expect(page.getByRole('heading', { name: 'Tiwa' })).toBeVisible();
  await expect(page.getByText('Plan any event, together.')).toBeVisible();
  expect(errors, `page errors: ${errors.join('; ')}`).toEqual([]);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('theme cookie is honoured with no flash', async ({ browser }) => {
  const context = await browser.newContext({
    colorScheme: 'light',
    storageState: { cookies: [], origins: [] },
  });
  await context.addCookies([{ name: 'tiwa-theme', value: 'dark', url: 'http://localhost:3000' }]);
  const page = await context.newPage();
  const html = await (await page.goto('/'))?.text();
  // Server renders the cookie theme directly — no client flash needed.
  expect(html).toContain('data-theme="dark"');
  await context.close();
});

test('system theme resolves client-side without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  expect(['light', 'dark']).toContain(theme);
  expect(errors, `page errors: ${errors.join('; ')}`).toEqual([]);
});
