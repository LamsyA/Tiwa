import { test, type Page } from '@playwright/test';
import { expect, isolateIp } from './support/auth.js';

// D-X64: a host asks a planner for a proposal, the planner replies from their
// Proposals inbox, and the host accepts it, which hires the planner onto the
// event. Uses the demo planner Occasions by Temi (`pnpm db:seed:demo`).
test.describe.configure({ mode: 'serial', timeout: 300_000 });
test.use({ actionTimeout: 20_000, navigationTimeout: 30_000 });

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const DEMO_PASSWORD = process.env.DEMO_BUSINESS_PASSWORD ?? 'TiwaDemo2026!';

/** goto that survives a racing router.refresh() from the previous page. */
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

async function newHostWithEvent(page: Page, eventName: string): Promise<string> {
  await isolateIp(page);
  await page.goto('/signup');
  await page.getByLabel('Your name').fill('Proposal Host');
  await page.getByLabel('Username', { exact: true }).fill(`ph_${RUN}`);
  await page.getByLabel('Password', { exact: true }).fill('host-password-1');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/onboarding\/role/);
  await page.getByRole('link', { name: /I'm hosting an event/ }).click();
  await page.waitForURL(/onboarding\/profile|events\/new/);
  if (page.url().includes('profile')) {
    await page
      .getByLabel('Your name')
      .fill('Proposal Host')
      .catch(() => undefined);
    await page.getByRole('button', { name: /Continue/ }).click();
  }
  await expect(page).toHaveURL(/\/events\/new$/);
  await page
    .getByRole('button', { name: /Birthday/ })
    .first()
    .click();
  await page.getByLabel('Event name').fill(eventName);
  await page.getByLabel('Date', { exact: true }).fill('2031-06-01');
  await page.getByLabel('Starts').fill('16:00');
  for (let step = 0; step < 5; step += 1) {
    await page
      .getByLabel('Expected guests')
      .fill('150', { timeout: 1500 })
      .catch(() => undefined);
    await page
      .getByLabel('Total budget')
      .fill('5000000', { timeout: 500 })
      .catch(() => undefined);
    if (await page.getByRole('button', { name: 'Create event' }).isVisible()) break;
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.waitForTimeout(500);
  }
  await page.getByRole('button', { name: 'Create event' }).click();
  await expect(page).toHaveURL(/\/events\/[0-9a-f-]+\?welcome=1$/);
  return new URL(page.url()).pathname.split('/')[2] as string;
}

test('D-X64: request a proposal, planner replies, host accepts and hires', async ({ browser }) => {
  const hostCtx = await browser.newContext();
  const plannerCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  const planner = await plannerCtx.newPage();
  const eventName = `Proposal Party ${RUN}`;

  const eventId = await newHostWithEvent(host, eventName);

  // The event's Vendors tab invites the host to hire a planner.
  await host.goto(`/events/${eventId}/vendors`);
  await expect(host.getByRole('heading', { name: 'Hire a planner to run it for you' })).toBeVisible();

  // From the planner's profile: Request a proposal.
  await host.goto(`/planners/demo-planner-occasions-by-temi?eventId=${eventId}`);
  await host.getByRole('button', { name: 'Request a proposal' }).first().click();
  const dialog = host.getByRole('dialog');
  await dialog.getByText('Day-of coordination').click();
  await dialog.getByLabel('Anything they should know?').fill(`Outdoor party ${RUN}`);
  await dialog.getByRole('button', { name: 'Send request' }).click();
  await expect(dialog.getByText('Request sent')).toBeVisible({ timeout: 30_000 });

  // The planner signs in, finds it under Proposals and sends a proposal.
  await isolateIp(planner);
  await planner.goto('/login?next=%2Fquotes');
  await planner.waitForLoadState('networkidle');
  await planner.getByLabel('Username or email').fill('occasionsbytemi');
  await planner.getByLabel('Password', { exact: true }).fill(DEMO_PASSWORD);
  await planner.getByRole('button', { name: 'Sign in' }).click();
  await expect(planner).toHaveURL(/\/quotes/);
  await expect(planner.getByRole('heading', { name: 'Proposal requests' }).first()).toBeVisible();
  await expect(planner.getByText(`Outdoor party ${RUN}`)).toBeVisible({ timeout: 30_000 });
  // Open this run's request, not another run's (parallel projects share the planner).
  await planner
    .getByRole('listitem')
    .filter({ hasText: `Outdoor party ${RUN}` })
    .getByRole('link', { name: 'Write a proposal' })
    .click();
  await planner.getByPlaceholder(/Service/).fill('Day-of coordination with 3 coordinators');
  await planner.getByLabel('Qty').fill('1');
  await planner.getByLabel('Unit price').fill('450000');
  await planner.getByLabel(/Cancellation terms/).fill('Retainer is non-refundable within 14 days of the event');
  await planner.getByLabel(/Valid until/).fill('2031-01-01');
  await planner.getByRole('button', { name: 'Send proposal' }).click();
  await expect(planner.getByText(/^(Proposal|Quote|Revised proposal|Revised quote) sent$/).first()).toBeVisible({
    timeout: 30_000,
  });

  // The host reviews the proposal document and accepts & hires.
  await host.goto(`/events/${eventId}/vendors/planning`);
  await expect(host.getByRole('heading', { name: 'Planner proposals' }).first()).toBeVisible();
  await expect(host.getByText('Scope of work')).toBeVisible({ timeout: 30_000 });
  await expect(host.getByText(/450,000/).first()).toBeVisible();

  // D-X66: the host asks for changes; the planner sees the message and revises.
  const changeNote = `Add a second coordinator ${RUN}`;
  await host.getByRole('button', { name: 'Request changes' }).first().click();
  const changes = host.getByRole('dialog');
  await changes.getByRole('textbox').fill(changeNote);
  await changes.getByRole('button', { name: 'Send request' }).click();
  await expect(host.getByText('You asked for changes').first()).toBeVisible({ timeout: 30_000 });
  await expect(host.getByRole('button', { name: 'Accept & hire' })).toHaveCount(0);

  await gotoSettled(planner, '/quotes');
  const sentBack = planner.getByRole('listitem').filter({ hasText: changeNote });
  await expect(sentBack.getByText('Changes requested')).toBeVisible({ timeout: 30_000 });
  await sentBack.getByRole('link', { name: 'Revise proposal' }).click();
  await expect(planner.getByText('The client asked for changes')).toBeVisible();
  await expect(planner.getByText(`“${changeNote}”`)).toBeVisible();
  await planner.getByLabel('Unit price').first().fill('500000');
  await planner.getByRole('button', { name: 'Send revised proposal' }).click();
  await expect(planner.getByText(/^(Proposal|Quote|Revised proposal|Revised quote) sent$/).first()).toBeVisible({
    timeout: 30_000,
  });
  // …and for the planner, under Sent.
  await expect(planner).toHaveURL(/\/quotes$/);
  await planner
    .getByRole('link', { name: new RegExp(`Proposal Party ${RUN}`) })
    .first()
    .click();
  await expect(planner.getByText(/You sent a revised version 2/).first()).toBeVisible();
  await expect(planner.getByText(changeNote).locator('visible=true').first()).toBeVisible();

  await gotoSettled(host, `/events/${eventId}/vendors/planning`);
  await expect(host.getByText(/Revised · v2/)).toBeVisible({ timeout: 30_000 });
  await expect(host.getByText(/500,000/).first()).toBeVisible();
  // D-X67: the whole negotiation is on record for the host…
  await host.getByText('Proposal history').first().click();
  await expect(host.getByText(/sent version 1/).first()).toBeVisible();
  await expect(host.getByText('You asked for changes').first()).toBeVisible();
  await expect(host.getByText(/sent a revised version 2/).first()).toBeVisible();
  await host.getByRole('button', { name: 'Accept & hire' }).first().click();
  const accept = host.getByRole('dialog');
  await accept.getByLabel(/I agree to this scope/).check();
  await accept.getByRole('button', { name: 'Accept & hire' }).click();
  await expect(host.getByText('Your planner is hired')).toBeVisible({ timeout: 30_000 });

  // The planner is now on the event.
  await gotoSettled(host, `/events/${eventId}/vendors`);
  await expect(host.getByRole('heading', { name: /Occasions by Temi is planning this event/ })).toBeVisible();
  await planner.goto(`/events/${eventId}`);
  await expect(planner.getByRole('heading', { name: eventName, level: 1 })).toBeVisible();

  await hostCtx.close();
  await plannerCtx.close();
});
