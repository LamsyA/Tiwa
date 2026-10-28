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
