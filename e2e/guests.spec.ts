import { test, type Browser, type Page } from '@playwright/test';
import { expect, freshPhone, isolateIp, pasteCode, requestPhoneCode, signInWithPhone } from './support/auth.js';

// P4-T12: UF-06 manage the guest list (add, paste, groups, search, bulk actions).
test.describe.configure({ timeout: 180_000 });
test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });

async function newHost(page: Page): Promise<void> {
  await isolateIp(page);
  await signInWithPhone(page, '/signup', freshPhone());
  await expect(page).toHaveURL(/\/onboarding\/role/);
  await page.getByRole('link', { name: /I'm hosting an event/ }).click();
  await page.getByLabel('Your name').fill('UF06 Host');
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

async function memberPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  const member = await context.newPage();
  await member.setExtraHTTPHeaders({
    'x-forwarded-for': `10.${1 + Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`,
  });
  return member;
}

test('UF-06-1: manual add, paste add, search, bulk delete', async ({ page }) => {
  await newHost(page);
  const eventUrl = await quickEvent(page, 'Guest List Party');
  await gotoSettled(page, `${eventUrl}/guests`);
  await expect(page.getByText('Add your guests')).toBeVisible();

  // Manual add.
  await page.getByRole('button', { name: 'Type names' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Adaeze Okafor');
  await page.getByLabel('Phone (optional)').fill('08031234567');
  await page.getByRole('button', { name: 'Add guest' }).click();
  await see(page, 'Adaeze Okafor');

  // Paste add.
  await page.getByRole('button', { name: 'Paste a list' }).first().click();
  await page.getByRole('textbox').fill('Emeka Obi, 08039876543\nFunmi Ade, funmi@example.com');
  await page.getByRole('button', { name: 'Check list' }).click();
  await page.getByRole('button', { name: 'Add 2 guests' }).click();
  await see(page, 'Emeka Obi');
  await see(page, 'Funmi Ade');

  // Search narrows to one row (explicit tap first: small viewports need focus before fill).
  const search = page.getByPlaceholder('Search name, phone or email');
  await search.click();
  await search.fill('emeka');
  await expect(page).toHaveURL(/q=emeka/, { timeout: 15000 });
  await see(page, 'Emeka Obi');
  await expect(page.getByText('Funmi Ade')).toHaveCount(0);
  await search.click();
  await search.fill('');
  await expect(page).not.toHaveURL(/q=/, { timeout: 15000 });
  await see(page, 'Funmi Ade');

  // Bulk delete everything back to the empty state. Named row checkboxes only:
  // the desktop table also renders a "Select all" box, and the responsive
  // double render keeps hidden duplicates in the DOM.
  const boxes = page.getByRole('checkbox', { name: /Select row \d+/ }).filter({ visible: true });
  await expect.poll(() => boxes.count(), { timeout: 10000 }).toBeGreaterThan(0);
  const count = await boxes.count();
  for (let i = 0; i < count; i += 1) await boxes.nth(i).check();
  await page.getByRole('button', { name: 'Delete' }).first().click();
  await page.getByRole('button', { name: 'Delete', exact: true }).last().click();
  await expect(page.getByText('Add your guests')).toBeVisible({ timeout: 15000 });
});

test('UF-06-2: groups, assignment, duplicate merge', async ({ page }) => {
  await newHost(page);
  const eventUrl = await quickEvent(page, 'Groups Party');
  await gotoSettled(page, `${eventUrl}/guests`);

  // Group via the Groups tab.
  await page.getByRole('tab', { name: 'Groups' }).click();
  await page.getByRole('button', { name: 'New group' }).click();
  await page.getByLabel('Group name').fill('Family');
  await page.getByRole('button', { name: 'Save group' }).click();
  await see(page, 'Family');

  // Bulk-assign a guest to the group from the list tab.
  await page.getByRole('tab', { name: 'Guests' }).click();
  await page.getByRole('button', { name: 'Type names' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Group Member');
  await page.getByLabel('Phone (optional)').fill('08035551111');
  await page.getByRole('button', { name: 'Add guest' }).click();
  await see(page, 'Group Member');
  await page.getByRole('checkbox', { name: 'Select row 1' }).filter({ visible: true }).first().check();
  await page.getByLabel('Add to group').click();
  await page.getByRole('option', { name: 'Family' }).click();
  await see(page, 'Group Member');

  // Same phone again → merge prompt → merge into one.
  // (Empty-state buttons unmount after the first guest; the header takes over.)
  await page.getByRole('button', { name: 'Add guests' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Group Member Twin');
  await page.getByLabel('Phone (optional)').fill('08035551111');
  await page.getByRole('button', { name: 'Add guest' }).click();
  await expect(page.getByText('Possible duplicates')).toBeVisible({ timeout: 15000 });
  await page
    .getByRole('button', { name: /Merge into/ })
    .first()
    .click();
  await expect(page.getByText('Guests merged')).toBeVisible();
});

test('UF-06-3: view-only member sees redacted contacts', async ({ page, browser }) => {
  await newHost(page);
  const eventUrl = await quickEvent(page, 'Redacted Party');
  await gotoSettled(page, `${eventUrl}/guests`);
  await page.getByRole('button', { name: 'Type names' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Private Guest');
  await page.getByLabel('Phone (optional)').fill('08031234567');
  await page.getByRole('button', { name: 'Add guest' }).click();
  await see(page, 'Private Guest');

  const viewerPhone = freshPhone();
  await gotoSettled(page, `${eventUrl}/settings/members`);
  await page.getByLabel('Phone number').fill(viewerPhone);
  await page.getByRole('button', { name: 'Permissions' }).click();
  await page.getByRole('option', { name: 'View only' }).click();
  await page.getByRole('button', { name: 'Send invite' }).click();
  await expect(page.getByText('Invite sent')).toBeVisible();

  const member = await memberPage(browser);
  const code = await requestPhoneCode(member, `/login?next=${encodeURIComponent(eventUrl)}`, viewerPhone);
  await pasteCode(member, code);
  await expect(member).toHaveURL(new RegExp(`${eventUrl}$`));
  await member.goto(`${eventUrl}/guests`);
  await expect(member.getByText('Private Guest', { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(member.getByText('08031234567')).toHaveCount(0);
  await expect(member.getByText('Hidden').filter({ visible: true }).first()).toBeVisible();
  await expect(member.getByRole('button', { name: 'Type names' })).toHaveCount(0);
  await member.context().close();
});
