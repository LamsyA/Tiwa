import { env } from '@tiwa/config';
import { createModerationProvider, type ModerationProvider } from '@tiwa/moderation';

// Image safety scans for chat attachments (D-X20: inline, no worker).
const globalModeration = globalThis as unknown as { __tiwaModeration?: ModerationProvider };

export function moderation(): ModerationProvider {
  globalModeration.__tiwaModeration ??= createModerationProvider(env.MODERATION_PROVIDER);
  return globalModeration.__tiwaModeration;
}
