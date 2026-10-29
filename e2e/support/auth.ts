import { expect as baseExpect, type APIRequestContext, type Page } from '@playwright/test';

// Account flows cross several routes; on a cold `next dev` each compiles on
// first hit, so assertions get more room than the 5 s default.
export const expect = baseExpect.configure({ timeout: 20_000 });

// Shared helpers for account flows. Codes and links come from the Fake
// senders through /api/test/outbox (on only with E2E_TEST_HOOKS=1).

let counter = 0;

/** A fresh Nigerian mobile number per call (OTP send is limited to 3 per number per 10 min). */
export function freshPhone(): string {
  counter += 1;
  const tail = `${Date.now() % 1_000_000}${counter}`.slice(-6).padStart(6, '0');
  return `+234803${(Number(process.pid) % 10).toString()}${tail}`;
}

/** A distinct client IP per test, so the per-IP login limit (10 per 10 min) never bleeds across tests. */
export async function isolateIp(page: Page): Promise<void> {
  const octet = () => Math.floor(Math.random() * 250) + 1;
  await page.setExtraHTTPHeaders({ 'x-forwarded-for': `10.${octet()}.${octet()}.${octet()}` });
}

export async function latestMessage(request: APIRequestContext, to: string): Promise<string> {
  let body = '';
  await expect
    .poll(
      async () => {
        const response = await request.get(`/api/test/outbox?to=${encodeURIComponent(to)}`);
        if (response.status() === 404 && !(await response.text())) {
          // Either nothing sent yet, or hooks are off (dev server started without E2E_TEST_HOOKS=1).
          return '';
        }
        body = ((await response.json()) as { body: string }).body;
        return body;
      },
      { message: `no message for ${to} — is the server running with E2E_TEST_HOOKS=1?`, timeout: 10_000 },
    )
    .not.toBe('');
  return body;
}

export async function latestCode(request: APIRequestContext, phone: string, after = ''): Promise<string> {
  let code = '';
  await expect
    .poll(async () => {
      code = (await latestMessage(request, phone)).match(/\b(\d{6})\b/)?.[1] ?? '';
      return code !== '' && code !== after;
    })
    .toBe(true);
  return code;
}

/** Paste a code into the first OTP box (UF-01-2: paste fills all boxes and auto-submits). */
export async function pasteCode(page: Page, code: string): Promise<void> {
  const first = page.getByLabel(/digit 1$/);
  await first.focus();
  await first.evaluate((element, text) => {
    const data = new DataTransfer();
    data.setData('text/plain', text);
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, code);
}

/** Phone sign-up/login up to the code screen; returns the code that was sent. */
export async function requestPhoneCode(page: Page, path: string, phone: string): Promise<string> {
  await page.goto(path);
  await page.getByRole('tab', { name: 'Continue with phone' }).click();
  await page.getByLabel('Phone number').fill(phone);
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByLabel(/digit 1$/)).toBeVisible();
  return latestCode(page.request, phone);
}

/** Full phone sign-in from `path`; resolves once the code is accepted. */
export async function signInWithPhone(page: Page, path: string, phone: string): Promise<void> {
  const code = await requestPhoneCode(page, path, phone);
  await pasteCode(page, code);
  await expect(page).not.toHaveURL(/\/(login|signup)/);
}
