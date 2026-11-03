import { isTestHookEnabled } from './test-hooks.js';

/**
 * Sign-in methods switched on for this deployment (D-X48). Phone codes and
 * Google stay visible as "Coming soon" until their env flag is set; the e2e
 * server keeps phone on so the suites can sign in with fake SMS.
 */
export function authMethods(source: Record<string, string | undefined> = process.env) {
  return {
    phone: source.AUTH_PHONE_ENABLED === '1' || isTestHookEnabled(source),
    google: source.AUTH_GOOGLE_ENABLED === '1' && Boolean(source.GOOGLE_CLIENT_ID && source.GOOGLE_CLIENT_SECRET),
  };
}
