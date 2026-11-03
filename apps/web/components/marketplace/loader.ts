import {
  getPublicAvailabilityRows,
  getPublicProfileForOrg,
  NotFoundError,
  resolvePublicOrgId,
  type PublicProfileKind,
} from '@tiwa/core';
import { unstable_cache } from 'next/cache';
import { notFound } from 'next/navigation';

/** Shared loader for the public profile pages (P6-T04): 404s for drafts and wrong-kind slugs.
 *
 * Profile data is cached with tag `vendor:{orgId}` (Backend.md §6), so edits
 * revalidate instantly while anonymous hits stay cached. Photos go through
 * `/api/profile-photo/[itemId]` (fresh signed redirect) because signed URLs
 * must never sit in cached HTML. */

// The data cache stores JSON, which has no BigInt or Date: money (package
// prices, starting price) and dates are tagged on the way in and revived on
// the way out, so the page gets the same types as an uncached call.
const BIGINT_TAG = '__bigint:';
const DATE_TAG = '__date:';
function encode(this: Record<string, unknown>, key: string, value: unknown) {
  const raw = this[key];
  if (raw instanceof Date) return `${DATE_TAG}${raw.toISOString()}`;
  return typeof value === 'bigint' ? `${BIGINT_TAG}${value}` : value;
}
function decode(_: string, value: unknown) {
  if (typeof value !== 'string') return value;
  if (value.startsWith(BIGINT_TAG)) return BigInt(value.slice(BIGINT_TAG.length));
  if (value.startsWith(DATE_TAG)) return new Date(value.slice(DATE_TAG.length));
  return value;
}

type PublicProfile = Awaited<ReturnType<typeof getPublicProfileForOrg>>;

async function cachedProfile(orgId: string, kind: PublicProfileKind): Promise<PublicProfile> {
  const json = await unstable_cache(
    async () => JSON.stringify(await getPublicProfileForOrg(orgId, kind), encode),
    ['public-profile-v2', orgId, kind],
    { tags: [`vendor:${orgId}`], revalidate: 3600 },
  )();
  return JSON.parse(json, decode) as PublicProfile;
}

export async function loadPublicProfile(slug: string, kind: PublicProfileKind) {
  let orgId: string;
  try {
    orgId = await resolvePublicOrgId(slug, kind);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  let profile;
  try {
    profile = await cachedProfile(orgId, kind);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const now = new Date();
  const monthStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
  // Six months ahead for the availability calendar (D-X43).
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 6, 0)).toISOString().slice(0, 10);
  const [photos, availabilityRows] = await Promise.all([
    Promise.resolve(
      profile.portfolio.map((item) => ({ id: item.id, url: `/api/profile-photo/${item.id}`, caption: item.caption })),
    ),
    getPublicAvailabilityRows(orgId, monthStart, monthEnd),
  ]);
  return { profile, photos, availabilityRows };
}
