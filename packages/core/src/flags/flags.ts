import { FLAG_NAMES, resolveFlag, type FlagName, type FlagOverrides } from '@tiwa/config';
import { prisma } from '@tiwa/db';
import { FeatureDisabledError } from '../shared/errors.js';

// Server-side flag resolver (P2-T10): config precedence + FeatureFlagOverride
// rows. Overrides are cached per country for a few seconds so a busy page
// doesn't query on every render; an admin change shows up within the TTL.

export type Flags = Record<FlagName, boolean>;

const TTL_MS = 10_000;
const cache = new Map<string, { at: number; overrides: Record<string, FlagOverrides> }>();

async function loadOverrides(countryCode: string, now: number): Promise<Record<string, FlagOverrides>> {
  const hit = cache.get(countryCode);
  if (hit && now - hit.at < TTL_MS) return hit.overrides;
  const rows = await prisma.featureFlagOverride.findMany({
    where: { key: { in: [...FLAG_NAMES] }, countryCode: { in: [countryCode.toUpperCase(), ''] } },
  });
  const overrides: Record<string, FlagOverrides> = {};
  for (const row of rows) {
    const entry = (overrides[row.key] ??= {});
    if (row.countryCode === '') entry.global = row.enabled;
    else entry.country = row.enabled;
  }
  cache.set(countryCode, { at: now, overrides });
  return overrides;
}

/** Every flag resolved for one country. Safe to pass to the client: booleans only. */
export async function getFlagsFor(countryCode: string, now = Date.now()): Promise<Flags> {
  const overrides = await loadOverrides(countryCode, now);
  return Object.fromEntries(FLAG_NAMES.map((name) => [name, resolveFlag(name, overrides[name] ?? {})])) as Flags;
}

export async function isEnabled(name: FlagName, countryCode: string): Promise<boolean> {
  return (await getFlagsFor(countryCode))[name];
}

/** Guard for risky commands: throws FEATURE_DISABLED when the flag is off. */
export async function requireFlag(name: FlagName, countryCode: string): Promise<void> {
  if (!(await isEnabled(name, countryCode))) throw new FeatureDisabledError(undefined, { flag: name });
}

/** Tests and admin writes (P16) call this so a change applies immediately. */
export function clearFlagCache(): void {
  cache.clear();
}
