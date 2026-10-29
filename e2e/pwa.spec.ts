import { expect, test } from '@playwright/test';

test('manifest is served with installable fields', async ({ request }) => {
  const response = await request.get('/manifest.webmanifest');
  expect(response.status()).toBe(200);
  const manifest = await response.json();
  expect(manifest.name).toContain('Tiwa');
  expect(manifest.short_name).toBe('Tiwa');
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBe('/');
  const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
  expect(sizes).toContain('192x192');
  expect(sizes).toContain('512x512');
  expect(manifest.icons.some((icon: { purpose?: string }) => icon.purpose === 'maskable')).toBe(true);
});

test('manifest is linked from every page', async ({ page }) => {
  await page.goto('/');
  const href = await page.getAttribute('link[rel="manifest"]', 'href');
  expect(href).toBe('/manifest.webmanifest');
});

test('service worker script is precached in production builds', async ({ request }) => {
  // Serwist registers (and serves /sw.js) from production builds only.
  test.skip(!process.env.CI, 'dev server does not serve the worker');
  const response = await request.get('/sw.js');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('javascript');
});

for (const width of [360, 768, 1440]) {
  test(`gallery has no horizontal scroll at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/dev/ui?theme=light');
    await expect(page.getByRole('heading', { name: 'UI gallery (dev only)' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test('keyboard-only users can reach interactive controls', async ({ page, isMobile }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/dev/ui?theme=light');
  await expect(page.getByRole('heading', { name: 'UI gallery (dev only)' })).toBeVisible();
  await page.keyboard.press('Tab');
  const seen = new Set<string>();
  for (let i = 0; i < 15; i += 1) {
    const key = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      if (!active || active === document.body) return 'NONE';
      const label =
        active.getAttribute('aria-label') ??
        (active as HTMLInputElement).labels?.[0]?.textContent?.trim() ??
        (active.textContent ?? '').trim().slice(0, 24);
      return `${active.tagName}:${label}`;
    });
    if (key === 'NONE') {
      // Touch-first engines may drop focus to body (e.g. order wrap);
      // desktop must never strand keyboard users.
      expect(isMobile, 'desktop tab must always land somewhere').toBe(true);
      continue;
    }
    seen.add(key);
    const visible = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      if (!active || active === document.body) return false;
      const rect = active.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    expect(visible, `focused element ${key} must be visible`).toBe(true);
    await page.keyboard.press('Tab');
  }
  // Desktop Tab order is the strict case. Mobile WebKit (touch-first;
  // VoiceOver/TalkBack are the P17 mobile screen-reader gates) collapses
  // link stops and cycles form controls, so assert progress without traps.
  const minimum = isMobile ? 3 : 8;
  expect(seen.size, `unique tab stops (mobile=${isMobile})`).toBeGreaterThan(minimum);
  expect(errors, `page errors: ${errors.join('; ')}`).toEqual([]);
});
