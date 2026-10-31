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

function cachedProfile(orgId: string, kind: PublicProfileKind) {
  return unstable_cache(() => getPublicProfileForOrg(orgId, kind), ['public-profile', orgId, kind], {
    tags: [`vendor:${orgId}`],
    revalidate: 3600,
  })();
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
  const lastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const monthEnd = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  const [photos, availabilityRows] = await Promise.all([
    Promise.resolve(
      profile.portfolio.map((item) => ({ id: item.id, url: `/api/profile-photo/${item.id}`, caption: item.caption })),
    ),
    getPublicAvailabilityRows(orgId, monthStart, monthEnd),
  ]);
  return { profile, photos, availabilityRows };
}
