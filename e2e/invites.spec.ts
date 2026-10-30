import { test, type Browser, type Page } from '@playwright/test';
import { expect, freshPhone, isolateIp, signInWithPhone } from './support/auth.js';

// P4-T12: UF-07 send invites + tracking, UF-08 personal link RSVP, UF-09 shared link.
// Worker fan-out/sends are covered by worker integration tests; e2e asserts
// the UI contract up to batch QUEUED plus tracking counters.
test.describe.configure({ timeout: 180_000 });
test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });

async function newHost(page: Page): Promise<void> {
  await isolateIp(page);
  await signInWithPhone(page, '/signup', freshPhone());
  await expect(page).toHaveURL(/\/onboarding\/role/);
  await page.getByRole('link', { name: /I'm hosting an event/ }).click();
  await page.getByLabel('Your name').fill('UF07 Host');
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

/** Exact-name assertion robust to the responsive table+card double render. */
async function see(page: Page, name: string): Promise<void> {
  await expect(page.getByText(name, { exact: true }).filter({ visible: true }).first()).toBeVisible();
}

/** goto that survives a racing router.refresh() from the previous page. */
async function gotoSettled(page: Page, url: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await page.goto(url);
      return;
    } catch (error) {
      if (attempt >= 2) throw error;
      await page.waitForTimeout(1000);
    }
  }
}

async function anonPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  const anon = await context.newPage();
  await anon.setExtraHTTPHeaders({
    'x-forwarded-for': `10.${1 + Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`,
  });
  return anon;
}

async function seedTwoGuests(page: Page, eventUrl: string): Promise<void> {
  await gotoSettled(page, `${eventUrl}/guests`);
  await page.getByRole('button', { name: 'Paste a list' }).first().click();
  await page.getByRole('textbox').fill('Invite Ada, 08031234567, ada@example.com\nInvite Bob, bob@example.com');
  await page.getByRole('button', { name: 'Check list' }).click();
  await page.getByRole('button', { name: 'Add 2 guests' }).click();
  await see(page, 'Invite Ada');
}

test('UF-07: switch gates the tab; composer sends; tracking counts', async ({ page }) => {
  await newHost(page);
  const eventUrl = await quickEvent(page, 'Invite Flow Party');
  await seedTwoGuests(page, eventUrl);

  await gotoSettled(page, `${eventUrl}/invites`);
  // Birthday template ships with invites on; turn off and the tab hides (UF-07-6).
  const invitesSwitch = page.getByRole('switch', { name: /Turn (on|off) invitations/ });
  if ((await invitesSwitch.getAttribute('aria-label')) === 'Turn off invitations') {
    await invitesSwitch.click();
    await page.getByRole('button', { name: 'Turn off invitations', exact: true }).last().click();
  }
  await page.getByRole('button', { name: 'Turn on invitations' }).waitFor({ timeout: 15000 });
  const navOff = await page.getByRole('navigation', { name: 'Event sections' }).getByRole('link').allInnerTexts();
  expect(navOff).not.toContain('Invites');
  await page.getByRole('button', { name: 'Turn on invitations' }).click();
  await page.waitForTimeout(1500);
  const navOn = await page.getByRole('navigation', { name: 'Event sections' }).getByRole('link').allInnerTexts();
  expect(navOn).toContain('Invites');

  // Composer: who -> how -> message -> review -> one click (UF-07-1).
  await page.getByRole('button', { name: 'New invite' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('WhatsApp preview')).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Ready to send?')).toBeVisible();
  await expect(page.getByRole('button', { name: /Send to 2 guests/ })).toBeVisible();
  await page.getByRole('button', { name: /Send to 2 guests/ }).click();
  await expect(page.getByText('Invitations are on their way.')).toBeVisible();

  // Tracking table with counters (batch QUEUED; worker fan-out is covered by worker tests).
  await page.keyboard.press('Escape');
  await expect(page.getByText('Sent invitations')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('2', { exact: true }).first()).toBeVisible();
});

test('UF-09: shared link RSVP creates a guest; toggle off closes it', async ({ page, browser }) => {
  await newHost(page);
  const eventUrl = await quickEvent(page, 'Shared Link Party');
  await gotoSettled(page, `${eventUrl}/invites`);
  if (await page.getByRole('button', { name: 'Turn on invitations' }).count()) {
    await page.getByRole('button', { name: 'Turn on invitations' }).click();
    await page.waitForTimeout(1500);
  }
  await page.getByText('Share one link').waitFor({ timeout: 15000 });
  await page.getByRole('switch', { name: 'Turn shared link on' }).click();
  await page.getByRole('img', { name: 'Event QR code' }).waitFor({ timeout: 15000 });
  const shareUrl = await page.getByLabel('Event link').inputValue();
  expect(shareUrl).toContain('/e/');
  expect(shareUrl.endsWith('/rsvp')).toBe(true);

  const anon = await anonPage(browser);
  await anon.goto(shareUrl);
  await anon.getByLabel('Your name').fill('Walk-in Wale');
  await anon.getByRole('button', { name: "I'm coming" }).click();
  await expect(anon.getByText("You're on the list")).toBeVisible({ timeout: 15000 });
  await anon.context().close();

  await gotoSettled(page, `${eventUrl}/guests`);
  await see(page, 'Walk-in Wale');

  await gotoSettled(page, `${eventUrl}/invites`);
  await page.getByRole('switch', { name: 'Turn shared link off' }).click();
  await page
    .getByText(/RSVP closed/)
    .first()
    .waitFor({ timeout: 15000 });
  const anon2 = await anonPage(browser);
  await anon2.goto(shareUrl);
  await expect(anon2.getByText('no longer accepts replies')).toBeVisible({ timeout: 15000 });
  await anon2.context().close();
});

test('UF-08: personal link one-tap RSVP, no account; plain GET records nothing', async ({ page, browser, request }) => {
  await newHost(page);
  const eventUrl = await quickEvent(page, 'RSVP Party');
  await seedTwoGuests(page, eventUrl);

  // LINK-only batch mints personal tokens without needing the worker.
  await gotoSettled(page, `${eventUrl}/invites`);
  if (await page.getByRole('button', { name: 'Turn on invitations' }).count()) {
    await page.getByRole('button', { name: 'Turn on invitations' }).click();
    await page.waitForTimeout(1500);
  }
  await page.getByRole('button', { name: 'New invite' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  // LINK-only batch: deselect the three defaults, select Link, assert each toggle lands.
  for (const channel of ['WhatsApp', 'Email', 'SMS'] as const) {
    const chip = page.getByRole('button', { name: channel, exact: true });
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'false', { timeout: 10000 });
  }
  const linkChip = page.getByRole('button', { name: 'Link only', exact: true });
  await linkChip.click();
  await expect(linkChip).toHaveAttribute('aria-pressed', 'true', { timeout: 10000 });
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: /Send to 2 guests/ }).click();
  await page.getByText('Invitations are on their way.').waitFor({ timeout: 15000 });
  await page.keyboard.press('Escape');

  // Read the personal link from the guest edit dialog. The post-send
  // router.refresh() can still be in flight and win over goto — retry it.
  await gotoSettled(page, `${eventUrl}/guests`);
  await see(page, 'Invite Ada');
  await page.getByRole('button', { name: 'Edit' }).filter({ visible: true }).first().click();
  await expect(page.getByText('Personal link')).toBeVisible({ timeout: 10000 });
  const link = await page.getByLabel('Personal link').inputValue();
  expect(link).toContain('/i/');
  await page.keyboard.press('Escape');

  // UF-08-3: a plain GET of ?r=yes records nothing (no JS executed).
  // Both guests still unanswered: two "No reply" pills + the counter label.
  await request.get(`${link}?r=yes&sig=x`);
  await gotoSettled(page, `${eventUrl}/guests`);
  await expect(page.getByText('No reply', { exact: true }).filter({ visible: true })).toHaveCount(3, {
    timeout: 15000,
  });

  // One tap, no account (UF-08-1, UF-08-2).
  const anon = await anonPage(browser);
  await anon.goto(link);
  await anon.getByRole('button', { name: "I'm coming" }).first().click();
  await expect(anon.getByRole('img', { name: 'Your pass QR' })).toBeVisible({ timeout: 15000 });

  // Yes/No buttons are gone once answered; Undo flips back.
  await expect(anon.getByRole('button', { name: "I'm coming" })).toHaveCount(0);
  await anon.getByRole('button', { name: 'Undo' }).click();
  await expect(anon.getByRole('button', { name: "I'm coming" }).first()).toBeVisible({ timeout: 15000 });

  // Pass extras + calendar links render.
  await anon.getByRole('button', { name: "I'm coming" }).first().click();
  await expect(anon.getByRole('img', { name: 'Your pass QR' })).toBeVisible({ timeout: 15000 });
  await expect(anon.getByText('Add to Google Calendar')).toBeVisible();
  await expect(anon.getByText('Download .ics')).toBeVisible();
  await anon.context().close();
});
