import { env } from './env.js';

// Risky features. OFF in production by default; locked decisions (D-M03,
// D-O01, D-O07) require human sign-off before enabling held/payouts/WhatsApp
// bulk in production. DB overrides (FeatureFlagOverride) are loaded by
// @tiwa/core `flags` and passed to `resolveFlag`.
export const FLAG_NAMES = ['payments.held', 'payments.payouts', 'whatsapp.bulk', 'ai.enabled'] as const;

export type FlagName = (typeof FLAG_NAMES)[number];

const OVERRIDES: Record<FlagName, string> = {
  'payments.held': 'FLAG_PAYMENTS_HELD',
  'payments.payouts': 'FLAG_PAYMENTS_PAYOUTS',
  'whatsapp.bulk': 'FLAG_WHATSAPP_BULK',
  'ai.enabled': 'FLAG_AI_ENABLED',
};

function parseOverride(raw: string | undefined): boolean | undefined {
  if (raw === undefined || raw === '') return undefined;
  if (raw === '1' || raw.toLowerCase() === 'true') return true;
  if (raw === '0' || raw.toLowerCase() === 'false') return false;
  throw new Error(`Invalid flag override ${raw}: use 1/0 or true/false`);
}

/**
 * Resolve a flag. Precedence: explicit `FLAG_*` env override, then
 * environment default (ON everywhere except production).
 */
export function getFlag(name: FlagName, source: NodeJS.ProcessEnv = process.env): boolean {
  const override = parseOverride(source[OVERRIDES[name]]);
  if (override !== undefined) return override;
  return (source.APP_ENV ?? env.APP_ENV) !== 'production';
}

/** All flags resolved at once (convenient for SSR context + tests). */
export function getFlags(source: NodeJS.ProcessEnv = process.env): Record<FlagName, boolean> {
  return Object.fromEntries(FLAG_NAMES.map((name) => [name, getFlag(name, source)])) as Record<FlagName, boolean>;
}

/** DB overrides for one flag: a row for the country beats the global row (countryCode ''). */
export interface FlagOverrides {
  country?: boolean | undefined;
  global?: boolean | undefined;
}

/**
 * Full precedence (P2-T10): explicit `FLAG_*` env override → DB override for
 * the country → global DB override → default (ON everywhere except production).
 * The env override stays first so operators can kill a feature without a deploy
 * or a database write.
 */
export function resolveFlag(
  name: FlagName,
  overrides: FlagOverrides = {},
  source: NodeJS.ProcessEnv = process.env,
): boolean {
  const envOverride = parseOverride(source[OVERRIDES[name]]);
  if (envOverride !== undefined) return envOverride;
  if (overrides.country !== undefined) return overrides.country;
  if (overrides.global !== undefined) return overrides.global;
  return (source.APP_ENV ?? env.APP_ENV) !== 'production';
}
