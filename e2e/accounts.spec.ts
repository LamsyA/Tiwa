import { test } from '@playwright/test';
import {
  expect,
  freshPhone,
  isolateIp,
  latestMessage,
  pasteCode,
  requestPhoneCode,
  signInWithPhone,
} from './support/auth.js';

// P2-T11: UF-01 (sign up + onboarding) and UF-02 (log in), both widths.

test.describe.configure({ timeout: 120_000 });
test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });

test.beforeEach(async ({ page }) => {
  await isolateIp(page);
});

test.describe('UF-01 sign up and onboarding', () => {
  test('UF-01-1/2: phone sign-up reaches /events/new in 4 screens; pasted code auto-submits', async ({ page }) => {
    const phone = freshPhone();
    const screens: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) screens.push(new URL(frame.url()).pathname);
    });

    const code = await requestPhoneCode(page, '/signup', phone); // screens 1 (method) + 2 (code)
    await pasteCode(page, code); // no Verify click: 6 pasted digits submit on their own (UF-01-2)

    await expect(page).toHaveURL(/\/onboarding\/role/); // screen 3
    await expect(page.getByRole('heading', { name: 'What brings you to Tiwa?' })).toBeVisible();
    await page.getByRole('link', { name: /I'm hosting an event/ }).click();

    await expect(page).toHaveURL(/\/onboarding\/profile/); // screen 4
    await page.getByLabel('Your name').fill('Adaeze Okafor');
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page).toHaveURL(/\/events\/new$/);
    // /signup holds screens 1–2 (method, code); /onboarding is an instant redirect, not a screen.
    const visited = [...new Set(screens)].filter((path) => path !== '/onboarding' && path !== '/events/new');
    expect(visited).toEqual(['/signup', '/onboarding/role', '/onboarding/profile']);
  });

  test('UF-01-3: vendor onboarding creates the business with me as Owner', async ({ page }) => {
    await signInWithPhone(page, '/signup', freshPhone());
    await expect(page).toHaveURL(/\/onboarding\/role/);
    await page.getByRole('link', { name: /I provide event services/ }).click();

    await expect(page.getByRole('heading', { name: 'Set up your business' })).toBeVisible();
    // Validation shows message-key strings, not raw errors.
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('Give your business a name')).toBeVisible();

    await page.getByLabel('Your name').fill('Bisi Adeyemi');
    await page.getByLabel('Business name').fill('Bisi Small Chops');
    await page.getByLabel('City').fill('Lagos');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/\/home$/);

    await page.goto('/settings/team');
    await expect(page.getByRole('heading', { name: 'Bisi Small Chops team' })).toBeVisible();
    const me = page.getByRole('listitem').filter({ hasText: 'Bisi Adeyemi' });
    await expect(me.getByText('Owner')).toBeVisible();
  });

  test('UF-01-4: five wrong codes lock the form with a clear message', async ({ page }) => {
    const phone = freshPhone();
    const real = await requestPhoneCode(page, '/signup', phone);
    // Five different wrong codes: re-pasting an unchanged value does not resubmit.
    const wrongCodes = ['000000', '111111', '222222', '333333', '444444', '555555'].filter((code) => code !== real);
    // Each attempt waits for its own verify response: the previous error stays on screen.
    const attempt = async (code: string) => {
      const verified = page.waitForResponse((response) => response.url().endsWith('/api/auth/otp/verify'));
      await pasteCode(page, code);
      return (await verified).status();
    };
    for (const wrong of wrongCodes.slice(0, 5)) {
      expect(await attempt(wrong)).toBe(400);
      await expect(page.getByText('That code is wrong or expired')).toBeVisible();
    }
    // Even the right code is refused once locked.
    expect(await attempt(real)).toBe(429);
    await expect(page.getByText('Too many tries')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Verify' })).toBeDisabled();
  });

  test('UF-01-5 (team variant): an invited member skips the role step and lands where the invite points', async ({
    page,
    browser,
    baseURL,
  }) => {
    // Owner sets up a business and invites a new number. (Event co-host invites arrive with events in P3.)
    await signInWithPhone(page, '/signup', freshPhone());
    await page.getByRole('link', { name: /I plan events for clients/ }).click();
    await page.getByLabel('Your name').fill('Tola Planner');
    await page.getByLabel('Business name').fill('Tola Events');
    await page.getByLabel('City').fill('Lagos');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/\/home$/);

    await page.goto('/settings/team');
    const invitee = freshPhone();
    await page.getByLabel('Phone number').fill(invitee);
    await page.getByRole('button', { name: 'Send invite' }).click();
    await expect(page.getByText('Invite sent')).toBeVisible();
    await expect(page.getByText('Not signed in yet')).toBeVisible();

    const inviteText = await latestMessage(page.request, invitee);
    const link = inviteText.match(/https?:\/\/\S+/)?.[0];
    expect(link).toBeTruthy();

    const guest = await browser.newContext({ baseURL: baseURL as string });
    const other = await guest.newPage();
    await isolateIp(other);
    const path = new URL(link as string).pathname + new URL(link as string).search;
    await signInWithPhone(other, path, invitee);
    await expect(other).toHaveURL(/\/settings\/team$/);
    await expect(other.getByRole('heading', { name: 'Tola Events team' })).toBeVisible();
    await guest.close();
  });
});

test.describe('UF-02 log in', () => {
  test('UF-02-2: a protected page sends me to /login?next=… and back after login; session cookie is httpOnly + Lax', async ({
    page,
    context,
  }) => {
    // Create an account first, then sign out by clearing cookies.
    const phone = freshPhone();
    await signInWithPhone(page, '/signup', phone);
    await page.getByRole('link', { name: /I'm hosting an event/ }).click();
    await page.getByLabel('Your name').fill('Kemi');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/\/events\/new$/);

    const session = (await context.cookies()).find((cookie) => cookie.name.includes('session_token'));
    expect(session?.httpOnly).toBe(true);
    expect(session?.sameSite).toBe('Lax');

    await context.clearCookies();
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/login\?next=%2Fsettings$/);

    const code = await requestPhoneCode(page, page.url(), phone);
    await pasteCode(page, code);
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
  });

  test('UF-02-1: a magic link signs in once; the second use does not', async ({ page, browser, baseURL }) => {
    const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
    await page.goto('/login?next=%2Fsettings');
    await page.getByRole('tab', { name: 'Continue with email' }).click();
    await page.getByLabel('Email address').fill(email);
    await page.getByRole('button', { name: 'Send link' }).click();
    await expect(page.getByText('Check your email')).toBeVisible();

    const link = (await latestMessage(page.request, email)).match(/href="([^"]+)"/)?.[1]?.replace(/&amp;/g, '&');
    expect(link).toContain('/api/auth/magic-link/verify');

    await page.goto(link as string);
    // New email account → onboarding first; `next` is carried through it.
    await expect(page).toHaveURL(/\/onboarding\/role\?next=%2Fsettings$/);

    const second = await browser.newContext({ baseURL: baseURL as string });
    const again = await second.newPage();
    await again.goto(link as string);
    await again.goto('/settings');
    await expect(again).toHaveURL(/\/login\?next=%2Fsettings$/);
    await second.close();
  });
});

test('signed-out visitors to app pages are redirected, never shown a blank page', async ({ page }) => {
  for (const path of ['/home', '/settings/team', '/onboarding/role']) {
    await page.goto(path);
    await expect(page).toHaveURL(
      new RegExp(`/login\\?next=${encodeURIComponent(path).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
    );
  }
});

test('the test outbox hook never lists messages without a recipient', async ({ request }) => {
  expect((await request.get('/api/test/outbox')).status()).toBe(400);
});
