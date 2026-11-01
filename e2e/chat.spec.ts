import { test, type Browser, type Page } from '@playwright/test';
import { expect, freshPhone, isolateIp, pasteCode, requestPhoneCode, signInWithEmail } from './support/auth.js';

// P6-T19: UF-30 (lean scope, D-X20: no voice notes or push; quote cards come
// with P7) and UF-31, against the seeded e2e venue (owner venue-e2e@tiwa.test)
// and the seeded ended event "Tolu's 30th" (guest phone +2348030009999).

test.describe.configure({ timeout: 180_000, mode: 'serial' });
test.use({ actionTimeout: 15_000, navigationTimeout: 45_000 });

const VENUE_SLUG = 'seed-venue-e2e';
const VENUE_OWNER = 'venue-e2e@tiwa.test';
const ENQUIRY_GUEST_PHONE = '+2348030009999';
const ENQUIRY_INVITE = 'seed-enquiry-invite-token-0001';
const RUN = Date.now().toString(36);

/** The open conversation (the section holding the composer), so list previews and sheets don't match. */
const thread = (page: Page) => page.locator('section:has(form textarea)');

async function newPage(browser: Browser, baseURL: string | undefined): Promise<Page> {
  const context = await browser.newContext({ baseURL: baseURL as string });
  const page = await context.newPage();
  await isolateIp(page);
  return page;
}

/** A brand-new host: phone sign-up + name (lands on /events/new). */
async function newHost(page: Page, name: string) {
  const code = await requestPhoneCode(page, '/signup', freshPhone());
  await pasteCode(page, code);
  await page.getByRole('link', { name: /I'm hosting an event/ }).click();
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/events\/new$/);
}

async function openComposerFromProfile(page: Page) {
  await page.goto(`/vendors/${VENUE_SLUG}`);
  await page.getByRole('button', { name: 'Message', exact: true }).click();
  return page.getByRole('dialog');
}

test('UF-30-1/2/4: host messages a venue from its profile; live delivery, receipts, typing, masking', async ({
  browser,
  baseURL,
}) => {
  const host = await newPage(browser, baseURL);
  const vendor = await newPage(browser, baseURL);
  const hostName = `Kemi ${RUN}`;
  await newHost(host, hostName);
  await signInWithEmail(vendor, '/login?next=%2Finbox', VENUE_OWNER);
  await expect(vendor).toHaveURL(/\/inbox/);

  // UF-30 steps 1–2: [Message] on the profile, suggested text, send → thread opens.
  const sheet = await openComposerFromProfile(host);
  const composer = sheet.getByLabel('Message', { exact: true });
  await expect(composer).not.toHaveValue('');
  await composer.fill(`Hello from ${RUN}`);
  await sheet.getByRole('button', { name: 'Send' }).click();
  await expect(host).toHaveURL(/\/inbox\/[0-9a-f-]+/);
  const threadUrl = host.url();

  // The venue's inbox updates live and the thread opens for the team.
  const row = vendor.getByRole('link', { name: new RegExp(hostName) });
  await expect(row).toBeVisible();
  await row.click();
  await expect(thread(vendor).getByText(`Hello from ${RUN}`)).toBeVisible();

  // UF-30-1: a new message reaches the open thread live (< 2 s).
  const start = Date.now();
  await host.getByLabel('Message', { exact: true }).fill(`Are you free in June? ${RUN}`);
  await host.getByLabel('Message', { exact: true }).press('Enter');
  await expect(thread(vendor).getByText(`Are you free in June? ${RUN}`)).toBeVisible({ timeout: 2_000 });
  expect(Date.now() - start).toBeLessThan(4_000); // includes the send round-trip

  // UF-30-2: the vendor has the thread open → the host's last message shows "Seen"; typing shows live.
  await expect(thread(host).getByLabel('Seen').last()).toBeVisible({ timeout: 10_000 });
  await vendor.getByLabel('Message', { exact: true }).pressSequentially('Yes we', { delay: 50 });
  await expect(
    thread(host)
      .getByRole('status')
      .filter({ hasText: /typing/ }),
  ).toBeVisible({ timeout: 5_000 });
  await vendor.getByLabel('Message', { exact: true }).fill('Yes we are free.');
  await vendor.getByLabel('Message', { exact: true }).press('Enter');
  await expect(thread(host).getByText('Yes we are free.')).toBeVisible();

  // UF-30-4 / §9a.3: a phone number before booking → warning → masked for the venue, visible to the host.
  await host.getByLabel('Message', { exact: true }).fill(`Call me on 08031234567 ${RUN}`);
  await host.getByLabel('Message', { exact: true }).press('Enter');
  const warning = host.getByRole('dialog');
  await expect(warning.getByText('Keep payments on Tiwa')).toBeVisible();
  await warning.getByRole('button', { name: 'Send anyway' }).click();
  await expect(thread(host).getByText(`Call me on 08031234567 ${RUN}`)).toBeVisible();
  await expect(thread(vendor).getByText(`Call me on •••• ${RUN}`)).toBeVisible();
  await expect(
    thread(vendor).getByText('Contact details are shared automatically once you book.').first(),
  ).toBeVisible();
  await expect(thread(vendor).getByText('08031234567')).toHaveCount(0);

  // Step 2 again: [Message] for the same parties reopens the same thread.
  const again = await openComposerFromProfile(host);
  await again.getByLabel('Message', { exact: true }).fill(`Second hello ${RUN}`);
  await again.getByRole('button', { name: 'Send' }).click();
  await expect(host).toHaveURL(threadUrl);

  await host.context().close();
  await vendor.context().close();
});

test('UF-30-7: report creates a moderation item; blocking stops the other side from sending', async ({
  browser,
  baseURL,
}) => {
  const host = await newPage(browser, baseURL);
  const vendor = await newPage(browser, baseURL);
  const hostName = `Bola ${RUN}`;
  await newHost(host, hostName);
  await signInWithEmail(vendor, '/login?next=%2Finbox', VENUE_OWNER);

  const sheet = await openComposerFromProfile(host);
  await sheet.getByLabel('Message', { exact: true }).fill(`Block test ${RUN}`);
  await sheet.getByRole('button', { name: 'Send' }).click();
  await expect(host).toHaveURL(/\/inbox\/[0-9a-f-]+/);

  await vendor.getByRole('link', { name: new RegExp(hostName) }).click();
  await expect(thread(vendor).getByText(`Block test ${RUN}`)).toBeVisible();

  // Report the host's message.
  await vendor.getByRole('button', { name: 'Message options' }).last().click();
  await vendor.getByRole('menuitem', { name: 'Report' }).click();
  await vendor.getByRole('dialog').getByLabel("What's wrong?").fill('Spam for the e2e test');
  await vendor.getByRole('dialog').getByRole('button', { name: 'Report' }).click();
  await expect(thread(vendor).getByText('Thanks. Our team will review it.')).toBeVisible();

  // Block from the thread menu → the host can no longer send.
  await vendor.getByRole('button', { name: 'Conversation options' }).click();
  await vendor.getByRole('menuitem', { name: 'Block' }).click();
  await vendor.getByRole('dialog').getByRole('button', { name: 'Block' }).click();
  await expect(thread(vendor).getByText("Blocked. They can't message you any more.")).toBeVisible();

  await host.getByLabel('Message', { exact: true }).fill(`After block ${RUN}`);
  await host.getByLabel('Message', { exact: true }).press('Enter');
  await expect(thread(host).getByText("Your message couldn't be sent.")).toBeVisible({ timeout: 15_000 });
  await expect(thread(vendor).getByText(`After block ${RUN}`)).toHaveCount(0);

  await host.context().close();
  await vendor.context().close();
});

test('UF-31: after the event, an attending guest messages the venue; the venue sees "Met at"', async ({
  browser,
  baseURL,
}) => {
  const guest = await newPage(browser, baseURL);
  const vendor = await newPage(browser, baseURL);

  // UF-31-1: the pass page shows [Message] for the venue once the event has ended.
  await guest.goto(`/i/${ENQUIRY_INVITE}/pass`);
  const section = guest.getByRole('region', { name: 'Message the team behind this event' });
  await expect(section).toBeVisible();
  await section.getByRole('button', { name: 'Message', exact: true }).first().click();

  // UF-31-3: phone OTP first (signed out → login → back with the sheet open).
  await expect(guest).toHaveURL(/\/login\?next=/);
  const code = await requestPhoneCode(guest, guest.url(), ENQUIRY_GUEST_PHONE);
  await pasteCode(guest, code);
  // A first-time phone sign-up asks for a first name, then returns to the pass page with the sheet open.
  await expect(guest).toHaveURL(/\/onboarding\/role|\/i\//);
  if (/\/onboarding\/role/.test(guest.url())) {
    await guest.getByRole('link', { name: /I'm hosting an event/ }).click();
    await guest.getByLabel('Your name').fill('Enquiry Guest');
    await guest.getByRole('button', { name: 'Continue' }).click();
  }
  await expect(guest).toHaveURL(new RegExp(`/i/${ENQUIRY_INVITE}/pass`));
  const sheet = guest.getByRole('dialog');
  await sheet.getByLabel('Message', { exact: true }).fill(`Loved the venue! ${RUN}`);
  await sheet.getByRole('button', { name: 'Send' }).click();
  await expect(guest).toHaveURL(/\/inbox\/[0-9a-f-]+/);

  // UF-31-4/5: the venue sees it under Enquiries with "Met at: Tolu's 30th", and can reply.
  await signInWithEmail(vendor, '/login?next=%2Finbox%3Ffilter%3Denquiries', VENUE_OWNER);
  const row = vendor.getByRole('link', { name: /Met at: Tolu's 30th/ }).first();
  await expect(row).toBeVisible();
  await row.click();
  await expect(thread(vendor).getByText(`Loved the venue! ${RUN}`)).toBeVisible();
  await vendor.getByLabel('Message', { exact: true }).fill('Thank you! Happy to help.');
  await vendor.getByLabel('Message', { exact: true }).press('Enter');
  await expect(thread(guest).getByText('Thank you! Happy to help.')).toBeVisible();

  await guest.context().close();
  await vendor.context().close();
});
