import { test, type Page } from '@playwright/test';
import { expect, freshPhone, isolateIp, latestMessage, signInWithPhone } from './support/auth.js';

// P6-T10: UF-13 vendor onboarding → live profile, UF-14 search part,
// UF-29-1 venue search capacity/date/slot. Requires `pnpm db:seed`
// (seed-venue-e2e + venue owner) and S3Mock on :9090.
// Parallel-safe: each run creates its own vendor (unique name); the shared
// venue is mutated on per-project dates only.
test.describe.configure({ mode: 'serial', timeout: 300_000 });
test.use({ actionTimeout: 20_000, navigationTimeout: 30_000 });

const VENUE_EMAIL = 'venue-e2e@tiwa.test';

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

/** Search results render once per navigation; reload-poll until the count settles (parallel-run safe). */
async function pollSearch(page: Page, url: string, name: string, want: number): Promise<void> {
  await gotoSettled(page, url);
  await expect(async () => {
    await page.reload().catch(() => undefined);
    await expect(page.getByRole('link', { name })).toHaveCount(want, { timeout: 10_000 });
  }).toPass({ timeout: 90_000 });
}

/** Same, for assertions that are not a single link count. */
async function pollCheck(page: Page, url: string, check: () => Promise<void>): Promise<void> {
  await gotoSettled(page, url);
  await expect(async () => {
    await page.reload().catch(() => undefined);
    await check();
  }).toPass({ timeout: 90_000 });
}

/** Valid PNG magic bytes + padding. */
function pngBuffer(seed: number, sizeKB = 50): Buffer {
  const onePx = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABRU5ErkJggg==',
    'base64',
  );
  const pad = Buffer.alloc(Math.max(0, sizeKB * 1024 - onePx.length), seed % 251);
  return Buffer.concat([onePx, pad]);
}

/** Fresh vendor account with a unique business name (no shared state). */
async function newVendor(page: Page, project: string): Promise<string> {
  const name = `E2E Food ${project} ${String(Date.now()).slice(-6)}`;
  await isolateIp(page);
  await signInWithPhone(page, '/signup', freshPhone());
  await expect(page).toHaveURL(/\/onboarding\/role/);
  await page.getByRole('link', { name: /provide event services/i }).click();
  await expect(page).toHaveURL(/\/onboarding\/business\?role=vendor/);
  // Owner-name field only appears when the account name is still the phone number;
  // the label query can miss pre-hydration, so attempt the fill unconditionally.
  await page
    .getByLabel('Your name')
    .fill('E2E Owner')
    .catch(() => undefined);
  await page.getByLabel('Business name').fill(name);
  await page.getByLabel('City').first().fill('Lagos');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/home/);
  return name;
}

test('UF-13: profile goes live when published; OG tags present', async ({ browser }, testInfo) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const name = await newVendor(page, testInfo.project.name);

  await gotoSettled(page, '/business/profile');
  await expect(page.getByRole('heading', { name: 'Get listed' })).toBeVisible();
  // Complete the profile details (categories + city).
  await page.getByRole('button', { name: 'Catering', exact: true }).click();
  await page.getByLabel('About').fill(`${name} — party food.`);
  await page.getByLabel('City', { exact: true }).fill('Lagos');
  await page.getByRole('button', { name: 'Save' }).first().click();
  await expect(page.getByText('Saved')).toBeVisible();

  // Not public until published (D-X34: publishing no longer waits for the checklist).
  await pollSearch(page, `/vendors?q=${encodeURIComponent(name)}`, name, 0);

  // Portfolio: 6 uploads.
  const files = Array.from({ length: 6 }, (_, i) => ({
    name: `dish-${i}.png`,
    mimeType: 'image/png',
    buffer: pngBuffer(i),
  }));
  await gotoSettled(page, '/business/profile');
  await page.locator('input[type="file"][accept*="image"]').first().setInputFiles(files);
  await expect(page.locator('li img')).toHaveCount(6, { timeout: 90_000 });

  // Package: one is enough to publish.
  await page.getByRole('button', { name: 'Add package' }).click();
  await page.getByLabel('Package name').fill('Party platters');
  const partyForm = page.locator('form', { has: page.getByLabel('Package name') });
  await partyForm.getByLabel('Starting price').fill('250000');
  await partyForm.getByLabel("What's included (one per line)").fill('100 portions\nSetup');
  await page.getByRole('button', { name: 'Save' }).last().click();
  await expect(page.getByText('Party platters')).toBeVisible();

  // Publish → live banner (UF-13-1).
  await page.getByRole('button', { name: 'Publish profile' }).click();
  await expect(page.getByText('Your profile is live')).toBeVisible();

  // Public page renders with OG tags (UF-13-3), reached through search.
  // Poll with reloads: a crowded parallel run can serve one stale render.
  await pollSearch(page, `/vendors?q=${encodeURIComponent(name)}`, name, 1);
  await page.getByRole('link', { name }).first().click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
  const ogTitle = await page.locator('meta[property="og:title"]').getAttribute('content');
  expect(ogTitle).toContain(name);
  const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content');
  expect(ogImage).toContain('opengraph-image');

  // Unpublish hides it again (UF-13-1).
  await gotoSettled(page, '/business/profile');
  await page.getByRole('button', { name: 'Unpublish' }).click();
  await expect(page.getByRole('button', { name: 'Publish profile' })).toBeVisible();
  await pollSearch(page, `/vendors?q=${encodeURIComponent(name)}`, name, 0);
  await context.close();
});

test('UF-14 search: category/city finds the vendor; blocked dates exclude (UF-14-2)', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const name = await newVendor(page, `s-${Date.now() % 1000}`);

  // Publish quickly: profile is partial, so complete it via the UI.
  await gotoSettled(page, '/business/profile');
  await page.getByRole('button', { name: 'Catering', exact: true }).click();
  await page.getByLabel('About').fill(`${name} — party food.`);
  await page.getByLabel('City', { exact: true }).fill('Lagos');
  await page.getByRole('button', { name: 'Save' }).first().click();
  await expect(page.getByText('Saved')).toBeVisible();
  const files = Array.from({ length: 6 }, (_, i) => ({
    name: `plate-${i}.png`,
    mimeType: 'image/png',
    buffer: pngBuffer(i + 10),
  }));
  await page.locator('input[type="file"][accept*="image"]').first().setInputFiles(files);
  await expect(page.locator('li img')).toHaveCount(6, { timeout: 90_000 });
  await page.getByRole('button', { name: 'Add package' }).click();
  await page.getByLabel('Package name').fill('Platters');
  await page.getByRole('button', { name: 'Save' }).last().click();
  await page.getByRole('button', { name: 'Publish profile' }).click();
  await expect(page.getByText('Your profile is live')).toBeVisible();

  // q narrows to the vendor; broad category/city pages hold thousands (load set).
  await pollSearch(page, `/vendors?q=${encodeURIComponent(name)}`, name, 1);
  await gotoSettled(page, '/vendors?category=catering&city=Lagos');
  await expect(page.getByRole('list', { name: 'Search results' }).getByRole('listitem')).toHaveCount(20);

  // Block a date, then search free on it (UF-14-2).
  await gotoSettled(page, '/business/profile');
  await page.getByLabel('Block date').fill('2027-11-20');
  await page.getByRole('button', { name: 'Block date' }).click();
  await expect(page.getByText('2027-11-20')).toBeVisible();

  await pollSearch(page, `/vendors?q=${encodeURIComponent(name)}&freeOn=2027-11-20`, name, 0);
  await pollSearch(page, `/vendors?q=${encodeURIComponent(name)}&freeOn=2027-11-21`, name, 1);

  // Cleanup: unblock.
  await gotoSettled(page, '/business/profile');
  await page.getByRole('button', { name: 'Unblock' }).first().click();
  await expect(page.getByText('2027-11-20')).toHaveCount(0);
  await context.close();
});

test('UF-29-1: venue search returns only big-enough, free spaces', async ({ browser }, testInfo) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signInEmail(page, VENUE_EMAIL);
  // Per-project date a month out (inside the spaces page's 90-day window,
  // and never shared between parallel mobile/desktop runs).
  const offsetDays = testInfo.project.name === 'mobile' ? 30 : 31;
  const date = new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

  // 300 guests: the 500-seat Grand Hall matches, the 100-seat Garden does not.
  await pollCheck(page, '/venues?city=Lagos&guests=300', async () => {
    await expect(page.getByRole('link', { name: 'E2E Grand Hall' }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Grand Hall', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Garden', { exact: true })).toHaveCount(0, { timeout: 10_000 });
  });

  // Block the hall for the date → the venue disappears for that slot.
  await gotoSettled(page, '/business/spaces');
  const hall = page.locator('div.flex.flex-col.gap-3.p-4', { has: page.getByRole('heading', { name: 'Grand Hall' }) });
  await hall.getByLabel('Block date').fill(date);
  await hall.getByRole('button', { name: 'Block date' }).click();
  await expect(hall.getByText(date)).toBeVisible();

  await pollCheck(page, `/venues?city=Lagos&guests=300&date=${date}&slot=EVENING`, async () => {
    await expect(page.getByRole('link', { name: 'E2E Grand Hall' })).toHaveCount(0, { timeout: 10_000 });
  });

  // Cleanup: unblock; the venue is back.
  await gotoSettled(page, '/business/spaces');
  const hallAgain = page.locator('div.flex.flex-col.gap-3.p-4', {
    has: page.getByRole('heading', { name: 'Grand Hall' }),
  });
  await hallAgain.getByRole('button', { name: 'Unblock' }).first().click();
  await pollCheck(page, `/venues?city=Lagos&guests=300&date=${date}&slot=EVENING`, async () => {
    await expect(page.getByRole('link', { name: 'E2E Grand Hall' }).first()).toBeVisible({ timeout: 10_000 });
  });
  await context.close();
});
