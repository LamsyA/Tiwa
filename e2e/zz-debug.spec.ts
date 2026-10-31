import { test, expect } from '@playwright/test';

function pngBuffer(seed: number, sizeKB = 30): Buffer {
  const onePx = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABRU5ErkJggg==',
    'base64',
  );
  const pad = Buffer.alloc(Math.max(0, sizeKB * 1024 - onePx.length), seed % 251);
  return Buffer.concat([onePx, pad]);
}

test('debug offline transition', async ({ page, context }) => {
  test.setTimeout(180000);
  page.on('requestfailed', (request) => {
    if (!request.url().includes('socket') && !request.url().includes('hot-update'))
      console.log(
        'REQFAIL:',
        request.method(),
        new URL(request.url()).pathname.slice(0, 60),
        request.failure()?.errorText,
      );
  });
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.pathname.includes('/api/') && response.status() >= 400)
      console.log('HTTP-ERR:', response.status(), url.pathname.slice(0, 60));
  });
  await page.goto('/m/MOMSDEMO/upload');
  await expect(page.getByLabel(/first name/i)).toBeVisible();
  await page.getByLabel(/first name/i).fill('Debug Guest');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForTimeout(1000);
  const files = Array.from({ length: 4 }, (_, i) => ({
    name: `e2e-${i}.png`,
    mimeType: 'image/png',
    buffer: pngBuffer(i),
  }));
  await page.locator('input[type="file"]').first().setInputFiles(files);
  await page.waitForFunction(
    () => [...document.querySelectorAll('li')].filter((li) => li.textContent?.includes('Done')).length >= 2,
    null,
    { timeout: 60000 },
  );
  console.log('--- batch 1 progressing, going offline ---');
  await context.setOffline(true);
  const more = Array.from({ length: 4 }, (_, i) => ({
    name: `f2-${i}.png`,
    mimeType: 'image/png',
    buffer: pngBuffer(50 + i),
  }));
  await page.locator('input[type="file"]').first().setInputFiles(more);
  await page.waitForTimeout(5000);
  console.log('--- back online ---');
  await context.setOffline(false);
  await page.waitForTimeout(20000);
  const uppy = await page.evaluate(() => {
    const u = (window as unknown as { __uppyDebug?: { getFiles: () => unknown[] } }).__uppyDebug;
    if (!u) return 'NO_UPPY';
    return u.getFiles().map((entry) => {
      const file = entry as Record<string, unknown>;
      const progress = file.progress as Record<string, unknown> | undefined;
      const meta = file.meta as Record<string, unknown> | undefined;
      return {
        name: file.name,
        error: (file.error as string | null) ?? null,
        bytesUploaded: progress?.bytesUploaded ?? null,
        uploadStarted: progress?.uploadStarted ?? null,
        uploadComplete: progress?.uploadComplete ?? null,
        hasMediaId: Boolean(meta?.mediaId),
      };
    });
  });
  console.log('UPPY-STATE:', JSON.stringify(uppy).slice(0, 2500));
});
