import { test, type Page } from '@playwright/test';
import { expect, isolateIp, latestMessage } from './support/auth.js';

// P10-T11: UF-21 planner daily dashboard. Requires `pnpm db:seed`
// (seed-planner-e2e org: 10 events, 2 overdue tasks, 1 due milestone,
// 2 open enquiries, pipeline 2/1/1). Reads only — parallel-safe.

test.describe.configure({ mode: 'serial', timeout: 300_000 });
test.use({ actionTimeout: 20_000, navigationTimeout: 30_000 });

/** One login per project — magic links are single-use (chat.spec.ts pattern). */
function plannerEmail(testInfo: { project: { name: string } }): string {
  return testInfo.project.name === 'mobile' ? 'planner-e2e@tiwa.test' : 'planner-e2e-2@tiwa.test';
}

/** Sign in via magic link (deterministic, no OTP rate-limit pressure). */
async function signInEmail(page: Page, email: string): Promise<void> {
  await isolateIp(page);
  await page.goto('/login?next=%2Fhome');
  await page.getByRole('tab', { name: 'Continue with email' }).click();
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Send link' }).click();
  await expect(page.getByText('Check your email')).toBeVisible();
  const body = await latestMessage(page.request, email);
  const link = body.match(/href="([^"]+)"/)?.[1]?.replace(/&amp;/g, '&');
  if (!link) throw new Error('no magic link in outbox');
  await page.goto(link);
  await expect(page).not.toHaveURL(/\/login/);
}

/** goto that survives a racing router.refresh() from the previous page, then
 * lets link prefetches settle so a later navigation can't orphan them into
 * WebKit prefetch errors. */
async function gotoSettled(page: Page, url: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await page.goto(url);
      break;
    } catch (error) {
      if (attempt >= 2) throw error;
      await page.waitForTimeout(1000);
    }
  }
  await page.waitForLoadState('networkidle').catch(() => undefined);
}

test.describe('UF-21 planner dashboard', () => {
  test('UF-21-1: seeded planner sees correct counts per section', async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await signInEmail(page, plannerEmail(testInfo));
    await expect(page).toHaveURL(/\/home$/);

    // Needs you today: 2 overdue tasks, 1 payment due, 2 open enquiries.
    await expect(page.getByText('2 overdue tasks')).toBeVisible();
    await expect(page.getByText('1 payments due')).toBeVisible();
    await expect(page.getByText('2 open enquiries')).toBeVisible();

    // This week's events: days 1, 3, 6.
    await expect(page.getByRole('link', { name: 'Seed Plan Event 1' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Seed Plan Event 2' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Seed Plan Event 3' })).toBeVisible();

    // Pipeline badges: ENQUIRY 2, PROPOSAL_SENT 1, WON 1.
    await expect(page.getByText('New · 2')).toBeVisible();
    await expect(page.getByText('Proposal sent · 1')).toBeVisible();
    await expect(page.getByText('Won · 1')).toBeVisible();

    expect(errors, `page errors: ${errors.join('; ')}`).toEqual([]);
  });

  test('UF-21-3: planner workspace pages load without errors', async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await signInEmail(page, plannerEmail(testInfo));

    await gotoSettled(page, '/clients');
    await expect(page.getByText('Seed Lead One')).toBeVisible();
    await gotoSettled(page, '/clients?view=pipeline');
    await expect(page.getByText('Seed Proposal')).toBeVisible();

    await gotoSettled(page, '/invoices');
    await expect(page.getByText('No invoices yet.')).toBeVisible();

    await gotoSettled(page, '/vendor-book');
    await expect(page.getByText('No vendors saved yet.')).toBeVisible();

    await gotoSettled(page, '/team');
    await expect(page.getByText('Assignments')).toBeVisible();

    await gotoSettled(page, '/calendar');
    await expect(page.getByText('Seed Plan Event 1').first()).toBeVisible();

    expect(errors, `page errors: ${errors.join('; ')}`).toEqual([]);
  });
});
