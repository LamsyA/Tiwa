import { test, type Page } from '@playwright/test';
import { expect, isolateIp, latestMessage } from './support/auth.js';

// P5-T13: UF-10 guest uploads, UF-11 host moderation + slideshow, UF-12 official album.
// Worker jobs (moderation verdicts, watermark, ZIP assembly, retention, expiry mail)
// are covered by worker integration tests; e2e asserts the UI contracts plus the
// live SSE channel on member actions (approve/hide publish gallery:{id} from the
// server action, no worker needed). Requires `pnpm db:seed` (MOMSDEMO/LOAD5000)
// and S3Mock on :9090 (browser multipart PUTs land there).
test.describe.configure({ mode: 'serial', timeout: 300_000 });
test.use({ actionTimeout: 20_000, navigationTimeout: 30_000 });

const CODE = 'MOMSDEMO';
const LOAD_CODE = 'LOAD5000';
const HOST_EMAIL = 'e2e-host-1@tiwa.test';

/** Host sign-in via magic link (deterministic, no OTP rate-limit pressure). */
async function signInHost(page: Page): Promise<void> {
  await page.goto('/login?next=%2Fhome');
  await page.getByRole('tab', { name: 'Continue with email' }).click();
  await page.getByLabel('Email address').fill(HOST_EMAIL);
  await page.getByRole('button', { name: 'Send link' }).click();
  await expect(page.getByText('Check your email')).toBeVisible();
  const body = await latestMessage(page.request, HOST_EMAIL);
  const link = body.match(/href="([^"]+)"/)?.[1]?.replace(/&amp;/g, '&');
  if (!link) throw new Error('no magic link in outbox');
  await page.goto(link);
  await expect(page).not.toHaveURL(/\/login/);
}

/** Valid PNG magic bytes + padding to keep throttled 3G busy. */
function pngBuffer(seed: number, sizeKB = 100): Buffer {
  const onePx = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABRU5ErkJggg==',
    'base64',
  );
  const pad = Buffer.alloc(Math.max(0, sizeKB * 1024 - onePx.length), seed % 251);
  return Buffer.concat([onePx, pad]);
}

let guest: Page;
let host: Page;
let hostEventUrl = '';

test.beforeAll(async ({ browser }) => {
  const guestContext = await browser.newContext();
  guest = await guestContext.newPage();
  await guest.setExtraHTTPHeaders({
    'x-forwarded-for': `10.${1 + Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`,
  });
  const hostContext = await browser.newContext();
  host = await hostContext.newPage();
  await isolateIp(host);
  await signInHost(host);
  await host.goto('/events');
  await expect(host.getByRole('heading', { name: 'Events' })).toBeVisible();
  // Event cards use stretched links (zero-area anchors Playwright calls
  // hidden): read the href instead of clicking through the overview.
  const eventLink = host.getByRole('link', { name: /40th Birthday/i }).first();
  await expect(eventLink).toBeAttached();
  const eventHref = (await eventLink.getAttribute('href')) ?? '';
  const match = eventHref.match(/\/events\/([0-9a-f-]+)/);
  if (!match?.[1]) throw new Error('no event link on /events');
  hostEventUrl = `/events/${match[1]}/moments`;
});

test.afterAll(async () => {
  await guest
    .context()
    .close()
    .catch(() => undefined);
  await host
    .context()
    .close()
    .catch(() => undefined);
});

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

async function throttle3G(page: Page): Promise<void> {
  try {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: 750 * 1024,
      uploadThroughput: 750 * 1024,
      latency: 100,
    });
  } catch {
    // Non-Chromium engines have no CDP; the flow still runs unthrottled.
  }
}

async function pickFiles(
  page: Page,
  inputSelector: string,
  files: { name: string; mimeType: string; buffer: Buffer }[],
) {
  // setInputFiles directly on the <input> (no dialog): the button-driven
  // file dialog races with progress re-renders mid-upload and flakes.
  // input[type=file] carries the implicit ARIA role "button", so prefer
  // CSS selectors over getByRole here.
  await page.locator(inputSelector).first().setInputFiles(files);
}

test('UF-10: 20 photos upload on throttled 3G with an offline toggle; none duplicated or lost', async () => {
  await gotoSettled(guest, `/m/${CODE}`);
  await expect(guest.getByRole('link', { name: /Add photos/ })).toBeVisible();
  await guest.getByRole('link', { name: /Add photos/ }).click();

  // First-upload name + consent (no account).
  await expect(guest.getByLabel(/first name/i)).toBeVisible();
  await guest.getByLabel(/first name/i).fill('E2E Guest');
  await guest.getByRole('button', { name: 'Continue' }).click();

  await throttle3G(guest);
  const files = Array.from({ length: 20 }, (_, i) => ({
    name: `e2e-${String(i).padStart(2, '0')}.png`,
    mimeType: 'image/png',
    buffer: pngBuffer(i),
  }));
  await pickFiles(guest, 'input[type="file"]', files.slice(0, 8));
  await expect(guest.getByText('Done', { exact: true }).first()).toBeVisible({ timeout: 120_000 });
  // Drop offline, queue the rest, come back: everything still lands exactly once.
  await guest.context().setOffline(true);
  await pickFiles(guest, 'input[type="file"]', files.slice(8));
  await guest.waitForTimeout(4000);
  await guest.context().setOffline(false);
  await expect(guest.getByText(/sent to the host for approval/i)).toBeVisible({ timeout: 180_000 });
});

test('UF-10-5: host bulk-approves; guest sees the live pill and the photos', async () => {
  await gotoSettled(guest, `/m/${CODE}`);
  const before = await guest.getByRole('link', { name: /^Guests ·/ }).textContent();

  await gotoSettled(host, hostEventUrl);
  await host.getByRole('button', { name: 'Select' }).click();
  const boxes = host.locator('input[type="checkbox"]');
  const count = await boxes.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i += 1) await boxes.nth(i).check();
  await host.getByRole('button', { name: 'Approve all' }).click();
  await expect(host.getByText(/Nothing waiting/i)).toBeVisible({ timeout: 60_000 });

  const pill = guest.getByRole('button', { name: /new photos? — show/i });
  await expect(pill).toBeVisible({ timeout: 10_000 });
  await pill.click();
  const after = await guest.getByRole('link', { name: /^Guests ·/ }).textContent();
  expect(before).not.toBe(after);

  // My uploads (same guest session) lists exactly the 20, no duplicates.
  await guest
    .getByRole('button', { name: /My uploads/ })
    .first()
    .click();
  await expect(guest.getByRole('feed').getByRole('button').first()).toBeVisible();
  expect(await guest.getByRole('feed').getByRole('button').count()).toBe(20);

  // Owners delete their own uploads (MOM-17).
  await guest.getByRole('feed').getByRole('button').first().click();
  await expect(guest.getByRole('dialog')).toBeVisible();
  await guest.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(guest.getByRole('feed').getByRole('button')).toHaveCount(19);
});

test('UF-11-1: hiding removes the item from the gallery and the slideshow within 10 s', async () => {
  await gotoSettled(guest, `/m/${CODE}`);
  const grid = guest.getByRole('feed');
  await expect(grid.getByRole('button').first()).toBeVisible();
  const visibleBefore = await grid.getByRole('button').count();

  await gotoSettled(host, hostEventUrl);
  await host.getByRole('button', { name: /Published/ }).click();
  const tile = host.locator('[data-published-tile]').first();
  await expect(tile).toBeVisible();
  const hiddenId = await tile.getAttribute('data-media-id');
  await tile.getByRole('button', { name: 'Hide', exact: true }).click();

  const pill = guest.getByRole('button', { name: /new photos? — show/i });
  await expect(pill).toBeVisible({ timeout: 10_000 });
  await pill.click();
  await expect.poll(async () => grid.getByRole('button').count(), { timeout: 10_000 }).toBe(visibleBefore - 1);

  // The slideshow feed excludes it too (UF-11-2: never shows non-PUBLISHED).
  const feed = await guest.request.get(`/api/gallery/${CODE}/slideshow`);
  expect(feed.ok()).toBe(true);
  const ids = ((await feed.json()).data.items as { id: string }[]).map((item) => item.id);
  expect(ids).not.toContain(hiddenId);
});

test('UF-11-2: slideshow shows published items; delay setting persists', async () => {
  const feed = await guest.request.get(`/api/gallery/${CODE}/slideshow`);
  expect(feed.ok()).toBe(true);
  const body = (await feed.json()) as { data: { items: { id: string }[] } };
  expect(body.data.items.length).toBeGreaterThan(0);

  await gotoSettled(host, hostEventUrl);
  await host.getByLabel(/Slideshow delay/i).fill('45');
  await host.getByRole('button', { name: 'Save settings' }).click();
  await expect(host.getByText(/Settings saved/i)).toBeVisible();
  await host.reload();
  await expect(host.getByLabel(/Slideshow delay/i)).toHaveValue('45');

  await gotoSettled(guest, `/m/${CODE}/slideshow`);
  await expect(guest.getByText(/of \d+/)).toBeVisible();
});

test('UF-10-6: 5000-item grid stays virtualised (≤ 200 DOM tiles)', async ({ browser }) => {
  const viewerContext = await browser.newContext();
  const viewer = await viewerContext.newPage();
  await gotoSettled(viewer, `/m/${LOAD_CODE}`);
  const grid = viewer.getByRole('feed');
  await expect(grid.getByRole('button').first()).toBeVisible({ timeout: 60_000 });
  const scroller = viewer.locator('[role="feed"]');
  for (let i = 0; i < 12; i += 1) {
    await scroller.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await viewer.waitForTimeout(400);
  }
  const tiles = await grid.getByRole('button').count();
  expect(tiles).toBeGreaterThan(0);
  expect(tiles).toBeLessThanOrEqual(200);
  await viewerContext.close();
});

test('MOM-14: guestbook post shows; host hide removes it', async () => {
  const text = `E2E wall ${Date.now()}`;
  await gotoSettled(guest, `/m/${CODE}?tab=guestbook`);
  await guest.getByLabel(/Message/i).fill(text);
  await guest.getByRole('button', { name: 'Sign guestbook' }).click();
  await expect(guest.getByText(text)).toBeVisible();

  await gotoSettled(host, hostEventUrl);
  const row = host.getByText(text);
  await expect(row).toBeVisible();
  await row.locator('xpath=ancestor::li[1]').getByRole('button', { name: 'Hide' }).click();
  await gotoSettled(guest, `/m/${CODE}?tab=guestbook`);
  await expect(guest.getByText(text)).not.toBeVisible();
});

test('UF-12 + MOM-13: official upload publishes; ZIP queues for email', async () => {
  await gotoSettled(host, hostEventUrl);
  const files = [0, 1].map((i) => ({
    name: `official-${i}.png`,
    mimeType: 'image/png',
    buffer: pngBuffer(40 + i, 30),
  }));
  await pickFiles(host, 'input[type="file"]:not([webkitdirectory])', files);
  await expect(host.getByText('Done', { exact: true }).first()).toBeVisible({ timeout: 120_000 });

  // Publish the two official uploads via the review queue.
  await host.getByRole('button', { name: 'Select' }).click();
  const boxes = host.locator('input[type="checkbox"]');
  for (let i = 0; i < (await boxes.count()); i += 1) await boxes.nth(i).check();
  await host.getByRole('button', { name: 'Approve all' }).click();

  await gotoSettled(guest, `/m/${CODE}?album=OFFICIAL`);
  // Tiles render without filenames; the Official tab must show items.
  await expect(guest.getByRole('feed').getByRole('button').first()).toBeVisible();

  // Download-all queues a ZIP for email delivery.
  await gotoSettled(host, hostEventUrl);
  await host.getByRole('button', { name: /Prepare download|Download ZIP/ }).click();
  await expect(host.getByText(/Preparing your ZIP/i)).toBeVisible({ timeout: 30_000 });
});

test('P5-T12: expiry banner shows; footer toggle is Plus-gated on FREE', async () => {
  await gotoSettled(host, hostEventUrl);
  await expect(host.getByText(/Photos stay until/i)).toBeVisible();
  const footerSwitch = host.getByRole('switch', { name: /Planned with Tiwa/i });
  await expect(footerSwitch).toBeDisabled();
  await expect(host.getByText(/needs Moments Plus/i).first()).toBeVisible();
});
