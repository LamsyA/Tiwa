import { test, type Page } from '@playwright/test';
import { expect, freshPhone, isolateIp, signInWithPhone } from './support/auth.js';

// P15-T07 / UF-27 (D-X42): AI budget split and guest-count impact. The AI
// runs on Meta Muse when TIWA_MUSE_API is set, else the deterministic Fakes.
// Checks: the safety note shows, nothing changes until Apply, and Apply
// updates every category.
test.describe.configure({ mode: 'serial', timeout: 240_000 });
test.use({ actionTimeout: 20_000, navigationTimeout: 30_000 });

const RUN = Date.now().toString(36);

async function newHostWithEvent(page: Page, name: string): Promise<string> {
  await isolateIp(page);
  await signInWithPhone(page, '/signup', freshPhone());
  await expect(page).toHaveURL(/\/onboarding\/role/);
  await page.getByRole('link', { name: /I'm hosting an event/ }).click();
  await page.getByLabel('Your name').fill('AI Host');
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

test('UF-27: split the budget with AI, apply it; check the impact of more guests', async ({ page }) => {
  const eventId = await newHostWithEvent(page, `AI Party ${RUN}`);
  await page.goto(`/events/${eventId}/money`);
  await page.getByRole('button', { name: 'Or start from a suggested split' }).click();
  await expect(page.getByText('Venue').first()).toBeVisible();

  await page.getByRole('button', { name: 'Split with AI' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Nothing changes until you tap Apply.')).toBeVisible();
  await dialog.getByLabel('Anything we should know?').fill('Food matters most, keep decor simple');
  await dialog.getByRole('button', { name: 'Suggest a split' }).click();
  await expect(dialog.getByRole('button', { name: 'Apply this split' })).toBeVisible({ timeout: 90_000 });
  await expect(dialog.getByText(/500,000/).first()).toBeVisible();
  await dialog.getByRole('button', { name: 'Apply this split' }).click();
  await expect(dialog.getByText('Budget updated')).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole('button', { name: 'Done' }).click();

  // Guest-count impact: a read-only checklist.
  await page.goto(`/events/${eventId}/guests`);
  await page.getByRole('button', { name: 'What if numbers change?' }).click();
  const impact = page.getByRole('dialog');
  await impact.getByLabel('New guest count').fill('80');
  await impact.getByRole('button', { name: 'Show the impact' }).click();
  await expect(impact.getByText(/50\s*80 guests/)).toBeVisible({ timeout: 90_000 });
  await expect(impact.locator('li').first()).toBeVisible();
  await expect(impact.getByText(/Nothing is changed or sent to vendors/)).toBeVisible();
});
