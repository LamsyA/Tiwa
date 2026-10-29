import { env } from '@tiwa/config';

/**
 * E2E test hooks exist only when E2E_TEST_HOOKS=1, outside production, with
 * fake SMS and email providers — so they can never expose a real code.
 */
export function isTestHookEnabled(
  source: Record<string, string | undefined> = process.env,
  config: { APP_ENV: string; SMS_PROVIDER?: unknown; EMAIL_PROVIDER?: unknown } = env,
): boolean {
  return (
    source.E2E_TEST_HOOKS === '1' &&
    config.APP_ENV !== 'production' &&
    config.SMS_PROVIDER === 'fake' &&
    config.EMAIL_PROVIDER === 'fake'
  );
}
