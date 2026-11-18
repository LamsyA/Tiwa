import { test } from '@playwright/test';
import { expect, freshPhone, isolateIp, latestMessage, signInWithPhone } from './support/auth.js';

// D-X88: a planner invites a staff member. Staff land on Home, see only the
// events they're assigned to (no other clients), and are told when assigned.
test.describe.configure({ timeout: 240_000 });
test.use({ actionTimeout: 20_000, navigationTimeout: 30_000 });

const PW = process.env.DEMO_BUSINESS_PASSWORD ?? 'TiwaDemo2026!';

test('D-X88: staff invite, scoped workspace, assignment notification', async ({ page, browser, baseURL }) => {
  await isolateIp(page);
  await page.goto('/login?next=%2Fsettings%2Fteam');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Username or email').fill('occasionsbytemi');
  await page.getByLabel('Password', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/settings\/team/);

  const invitee = freshPhone();
  await page.getByLabel('Phone number').fill(invitee);
  await page.getByRole('button', { name: 'Send invite' }).click();
  await expect(page.getByText('Invite sent')).toBeVisible();
  const text = await latestMessage(page.request, invitee);
  expect(text).toContain('team on Tiwa');
  const link = text.match(/https?:\/\/\S+/)?.[0] as string;

  // Staff signs in from the SMS and lands on Home.
  const ctx = await browser.newContext({ baseURL: baseURL as string });
  const staff = await ctx.newPage();
  await isolateIp(staff);
  await signInWithPhone(staff, new URL(link).pathname + new URL(link).search, invitee);
  await expect(staff).toHaveURL(/\/home$/);
  // Staff menu: no sales or business pages.
  await expect(staff.getByRole('link', { name: 'Invoices' })).toHaveCount(0);
  await expect(staff.getByRole('link', { name: 'Pipeline' })).toHaveCount(0);

  // Before any assignment: none of the business's clients.
  await page.goto('/clients');
  const firstClient = page.getByRole('main').locator('a[href^="/clients/"]').first();
  await expect(firstClient).toBeVisible();
  const clientHref = (await firstClient.getAttribute('href')) as string;
  await staff.goto('/clients');
  await expect(staff.getByRole('main').locator(`a[href="${clientHref}"]`)).toHaveCount(0);
  await staff.goto(clientHref);
  await expect(staff.getByText(/not found|could not be found|404/i).first()).toBeVisible();

  // Owner assigns them to an event.
  await page.goto('/team');
  const eventSelect = page.getByLabel('Event');
  const eventName = ((await eventSelect.locator('option').first().textContent()) ?? '').trim();
  const memberSelect = page.getByLabel('Staff member');
  const staffValue = await memberSelect
    .locator('option', { hasText: invitee.replace(/\D/g, '').slice(-8) })
    .first()
    .getAttribute('value');
  await memberSelect.selectOption(staffValue as string);
  await page.getByRole('button', { name: 'Assign' }).click();
  await expect(page.getByRole('status').filter({ hasText: /Assigned|Couldn|already/ })).toHaveText(/Assigned/);

  // Staff is told, and the link opens the event.
  await staff.goto('/notifications');
  const note = staff.getByRole('button', {
    name: new RegExp(`You're on ${eventName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
  });
  await expect(note.first()).toBeVisible({ timeout: 30_000 });
  await note.first().click();
  await expect(staff).toHaveURL(/\/events\/[0-9a-f-]+/);
  await expect(staff.getByRole('heading', { level: 1, name: eventName })).toBeVisible();

  // Their calendar shows only that event.
  await staff.goto('/calendar');
  await expect(staff.getByRole('main').getByText(eventName).first()).toBeVisible();
  await ctx.close();
});
