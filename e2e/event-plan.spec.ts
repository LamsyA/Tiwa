import { test, type Browser, type Page } from '@playwright/test';
import { expect, freshPhone, isolateIp, pasteCode, requestPhoneCode, signInWithPhone } from './support/auth.js';

// P3-T12: UF-05 manage checklist and tasks (EVT-03, EVT-05).
test.describe.configure({ timeout: 180_000 });
test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });

async function newHost(page: Page): Promise<void> {
  await isolateIp(page);
  await signInWithPhone(page, '/signup', freshPhone());
  await expect(page).toHaveURL(/\/onboarding\/role/);
  await page.getByRole('link', { name: /I'm hosting an event/ }).click();
  await page.getByLabel('Your name').fill('UF05 Host');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/events\/new$/);
}

async function quickEvent(page: Page, name: string): Promise<string> {
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
  await page.getByRole('button', { name: 'Create event' }).click();
  await expect(page).toHaveURL(/\/events\/[0-9a-f-]+\?welcome=1$/);
  return new URL(page.url()).pathname;
}

function yesterdayISO(): string {
  const day = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return day.toISOString().slice(0, 10);
}

test('UF-05-1: completing a task moves overview progress', async ({ page }) => {
  await newHost(page);
  const eventUrl = await quickEvent(page, 'Plan Party');

  await page.goto(eventUrl);
  const before = await page
    .getByText(/of \d+ done/)
    .first()
    .innerText();
  const doneBefore = Number(before.split(' ')[0]);

  await page.goto(`${eventUrl}/plan`);
  const toggle = page.getByRole('checkbox', { name: /Order the cake/ });
  const saved = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().includes('/plan'),
  );
  await toggle.check();
  await saved;

  // Let the toggle's router.refresh() settle before leaving, or it interrupts the goto.
  await page.waitForLoadState('networkidle');
  await page.goto(eventUrl);
  await expect(page.getByText(new RegExp(`${doneBefore + 1} of \\d+ done`)).first()).toBeVisible();
});

test('UF-05-2: overdue tasks show in red with days overdue', async ({ page }) => {
  await newHost(page);
  const eventUrl = await quickEvent(page, 'Overdue Party');

  await page.goto(`${eventUrl}/plan`);
  await page.getByRole('button', { name: /Order the cake/ }).click();
  await page.getByLabel('Due date').fill(yesterdayISO());
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('1 day overdue')).toBeVisible();
  await expect(page.getByText('1 day overdue')).toHaveClass(/text-danger/);
});

test('UF-05-3: a co-host sees task changes within 10 seconds', async ({ page, browser }) => {
  await newHost(page);
  const eventUrl = await quickEvent(page, 'Live Party');
  const matePhone = freshPhone();

  await page.goto(`${eventUrl}/settings/members`);
  await page.getByLabel('Phone number').fill(matePhone);
  await page.getByRole('button', { name: 'Send invite' }).click();
  await expect(page.getByText('Invite sent')).toBeVisible();

  const context = await (browser as Browser).newContext();
  const mate = await context.newPage();
  await mate.setExtraHTTPHeaders({
    'x-forwarded-for': `10.${1 + Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`,
  });
  const code = await requestPhoneCode(mate, `/login?next=${encodeURIComponent(eventUrl)}`, matePhone);
  await pasteCode(mate, code);
  await expect(mate).toHaveURL(new RegExp(`${eventUrl}$`));
  await mate.goto(`${eventUrl}/plan`);
  await expect(mate.getByText('Order the cake')).toBeVisible();

  // Host completes the task; the SSE stream refreshes the co-host inside 10 s.
  await page.goto(`${eventUrl}/plan`);
  await page.getByRole('checkbox', { name: /Order the cake/ }).check();

  await expect(mate.getByText('Order the cake')).toBeVisible({ timeout: 10_000 });
  await expect
    .poll(async () => mate.getByRole('checkbox', { name: /Order the cake/ }).getAttribute('aria-checked'), {
      timeout: 10_000,
    })
    .toBe('true');
  await mate.context().close();
});
