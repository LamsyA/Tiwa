import { prisma } from '@tiwa/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FeatureDisabledError } from '../shared/errors.js';
import { clearFlagCache, getFlagsFor, isEnabled, requireFlag } from './flags.js';

// 'ZZ' is not a real country, so these rows never collide with seed data.
const COUNTRY = 'ZZ';
const ENV_KEYS = ['APP_ENV', 'FLAG_AI_ENABLED', 'FLAG_WHATSAPP_BULK'] as const;
const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
// The dev database is shared: keep any real global whatsapp.bulk row and put it back.
let globalRow: { enabled: boolean; updatedBy: string | null } | null = null;

beforeAll(async () => {
  globalRow = await prisma.featureFlagOverride.findUnique({
    where: { key_countryCode: { key: 'whatsapp.bulk', countryCode: '' } },
    select: { enabled: true, updatedBy: true },
  });
});

beforeEach(async () => {
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.APP_ENV = 'production';
  await prisma.featureFlagOverride.deleteMany({ where: { countryCode: COUNTRY } });
  await prisma.featureFlagOverride.deleteMany({ where: { key: 'whatsapp.bulk', countryCode: '' } });
  clearFlagCache();
});

afterAll(async () => {
  await prisma.featureFlagOverride.deleteMany({ where: { countryCode: COUNTRY } });
  await prisma.featureFlagOverride.deleteMany({ where: { key: 'whatsapp.bulk', countryCode: '' } });
  if (globalRow) {
    await prisma.featureFlagOverride.create({ data: { key: 'whatsapp.bulk', countryCode: '', ...globalRow } });
  }
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  await prisma.$disconnect();
});

describe('flag resolver with DB overrides', () => {
  it('production defaults are OFF', async () => {
    const flags = await getFlagsFor(COUNTRY);
    expect(Object.values(flags).every((value) => value === false)).toBe(true);
  });

  it('a country row turns a flag on for that country only', async () => {
    await prisma.featureFlagOverride.create({ data: { key: 'ai.enabled', countryCode: COUNTRY, enabled: true } });
    expect(await isEnabled('ai.enabled', COUNTRY)).toBe(true);
    expect(await isEnabled('ai.enabled', 'YY')).toBe(false);
  });

  it('a country row beats the global row', async () => {
    await prisma.featureFlagOverride.create({ data: { key: 'whatsapp.bulk', countryCode: '', enabled: true } });
    await prisma.featureFlagOverride.create({ data: { key: 'whatsapp.bulk', countryCode: COUNTRY, enabled: false } });
    expect(await isEnabled('whatsapp.bulk', COUNTRY)).toBe(false);
    expect(await isEnabled('whatsapp.bulk', 'YY')).toBe(true);
  });

  it('the env override beats DB rows', async () => {
    await prisma.featureFlagOverride.create({ data: { key: 'ai.enabled', countryCode: COUNTRY, enabled: true } });
    process.env.FLAG_AI_ENABLED = '0';
    expect(await isEnabled('ai.enabled', COUNTRY)).toBe(false);
  });

  it('caches per country until cleared', async () => {
    const before = await getFlagsFor(COUNTRY, 1_000);
    await prisma.featureFlagOverride.create({ data: { key: 'ai.enabled', countryCode: COUNTRY, enabled: true } });
    expect((await getFlagsFor(COUNTRY, 2_000))['ai.enabled']).toBe(before['ai.enabled']);
    expect((await getFlagsFor(COUNTRY, 20_000))['ai.enabled']).toBe(true);
  });

  it('requireFlag throws FEATURE_DISABLED when off', async () => {
    await expect(requireFlag('payments.held', COUNTRY)).rejects.toBeInstanceOf(FeatureDisabledError);
  });
});
