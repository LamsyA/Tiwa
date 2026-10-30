import { test, type Browser, type Page } from '@playwright/test';
import { expect, freshPhone, isolateIp, pasteCode, requestPhoneCode, signInWithPhone } from './support/auth.js';

// P3-T12: UF-04 add co-hosts and set permissions (EVT-06, EVT-07).
// UF-04-2's server enforcement is unit-tested (authorize.test.ts:93); quotes
// arrive in P7, so here we pin the UI (stored cap renders) — the full
// approve-a-quote flow lands with bookings.
test.describe.configure({ timeout: 180_000 });
test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });

async function newHost(page: Page): Promise<void> {
  await isolateIp(page);
  await signInWithPhone(page, '/signup', freshPhone());
  await expect(page).toHaveURL(/\/onboarding\/role/);
  await page.getByRole('link', { name: /I'm hosting an event/ }).click();
  await page.getByLabel('Your name').fill('UF04 Host');
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

async function memberPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  const member = await context.newPage();
  await member.setExtraHTTPHeaders({
    'x-forwarded-for': `10.${1 + Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`,
  });
  return member;
}

test('UF-04-1/3: view-only co-host is blocked from money, removal blocks next request', async ({ page, browser }) => {
  await newHost(page);
  const eventUrl = await quickEvent(page, 'Members Party');
  const viewerPhone = freshPhone();

  await page.goto(`${eventUrl}/settings/members`);
  await page.getByLabel('Phone number').fill(viewerPhone);
  await page.getByRole('button', { name: 'Permissions' }).click();
  await page.getByRole('option', { name: 'View only' }).click();
  await page.getByRole('button', { name: 'Send invite' }).click();
  await expect(page.getByText('Invite sent')).toBeVisible();

  // UF-04 step 2: the invitee follows the invite link and lands on the event.
  const member = await memberPage(browser);
  const code = await requestPhoneCode(member, `/login?next=${encodeURIComponent(eventUrl)}`, viewerPhone);
  await pasteCode(member, code);
  await expect(member).toHaveURL(new RegExp(`${eventUrl}$`));

  // UF-04-1: view-only cannot open money (403 panel, no figures).
  await member.goto(`${eventUrl}/money`);
  await expect(member.getByText("You don't have access to this")).toBeVisible();
  await expect(member.getByText('Planned budget')).toHaveCount(0);

  // UF-04-3: removal takes effect on the next request (404 — ids can't be probed).
  await page.getByRole('button', { name: 'Remove' }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).last().click();
  await expect(page.getByText(viewerPhone)).toHaveCount(0);
  await member.goto(eventUrl);
  await expect(member.getByText('This page could not be found.')).toBeVisible();
  await member.context().close();
});

test('UF-04-2 (UI pin): finance preset stores the approval cap for P7 quotes', async ({ page }) => {
  await newHost(page);
  const eventUrl = await quickEvent(page, 'Finance Party');
  const financePhone = freshPhone();

  await page.goto(`${eventUrl}/settings/members`);
  await page.getByLabel('Phone number').fill(financePhone);
  await page.getByRole('button', { name: 'Permissions' }).click();
  await page.getByRole('option', { name: /Finance/ }).click();
  await page.getByLabel(/Can approve payments up to/).fill('100000');
  await page.getByRole('button', { name: 'Send invite' }).click();
  await expect(page.getByText('Invite sent')).toBeVisible();
  await expect(page.getByText(/Approves up to.*100,000/)).toBeVisible();
});
