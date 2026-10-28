import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

for (const theme of ['light', 'dark'] as const) {
  test(`gallery renders ${theme} with no scroll or page errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`/dev/ui?theme=${theme}`);
    await expect(page.getByRole('heading', { name: 'UI gallery (dev only)' })).toBeVisible();
    for (const name of ['Buttons', 'Inputs', 'Overlays', 'App frame (host)']) {
      await expect(page.getByRole('heading', { name, exact: true }).first()).toBeVisible();
    }
    const activeTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(activeTheme).toBe(theme);
    expect(errors, `page errors: ${errors.join('; ')}`).toEqual([]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test(`gallery ${theme} has zero serious axe violations`, async ({ page }) => {
    await page.goto(`/dev/ui?theme=${theme}`);
    await expect(page.getByRole('heading', { name: 'UI gallery (dev only)' })).toBeVisible();
    // Scoped to our markup: Next's dev-only overlay (nextjs-portal) is not
    // our code and does not exist in production builds.
    const results = await new AxeBuilder({ page }).include('#gallery-root').analyze();
    const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(
      blocking.map((v) => `${v.id}: ${v.nodes.length} node(s)`),
      JSON.stringify(blocking, null, 2),
    ).toEqual([]);
  });
}
