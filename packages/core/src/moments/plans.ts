import { prisma } from '@tiwa/db';

// Plans (P5-T12, MOM-03): free limits vs Plus. Entitlements come from
// payments in P8; until then the stored plan stands and Plus is granted
// manually (support path). Limits are enforced from these constants, not
// scattered literals.

export const PLAN_LIMITS = {
  FREE: { items: 500, videoSec: 30, retentionDays: 90 },
  PLUS: { items: 5000, videoSec: 180, retentionDays: 365 },
} as const;

export type GalleryPlan = keyof typeof PLAN_LIMITS;

export function planLimits(plan: string): (typeof PLAN_LIMITS)[keyof typeof PLAN_LIMITS] {
  return plan === 'PLUS' ? PLAN_LIMITS.PLUS : PLAN_LIMITS.FREE;
}

/** Retention runs from the event end (fallback start, fallback now). */
export function expiryFor(event: { endsAt: Date | null; startsAt: Date | null }, plan: string, now = new Date()): Date {
  const anchor = event.endsAt ?? event.startsAt ?? now;
  return new Date(anchor.getTime() + planLimits(plan).retentionDays * 24 * 3600 * 1000);
}

type Tx = Pick<typeof prisma, 'gallery' | 'event'>;

/**
 * Stamp limits + expiry when a gallery becomes live (finalize) and backfill
 * galleries that predate the field. Never downgrades an explicit itemLimit
 * a host was given — only raises to the plan floor.
 */
export async function syncGalleryPlanTx(
  tx: Tx,
  eventId: string,
  opts?: { force?: boolean },
): Promise<{ plan: GalleryPlan; itemLimit: number; expiresAt: Date }> {
  const event = await tx.event.findUniqueOrThrow({
    where: { id: eventId },
    select: { endsAt: true, startsAt: true },
  });
  const gallery = await tx.gallery.findUniqueOrThrow({ where: { eventId } });
  const plan: GalleryPlan = gallery.plan === 'PLUS' ? 'PLUS' : 'FREE';
  const limits = planLimits(plan);
  const data: { itemLimit?: number; expiresAt?: Date } = {};
  if (opts?.force || gallery.itemLimit < limits.items) data.itemLimit = Math.max(gallery.itemLimit, limits.items);
  if (opts?.force || !gallery.expiresAt) data.expiresAt = expiryFor(event, plan);
  if (Object.keys(data).length > 0) await tx.gallery.update({ where: { id: gallery.id }, data });
  const fresh = await tx.gallery.findUniqueOrThrow({ where: { id: gallery.id } });
  return { plan, itemLimit: fresh.itemLimit, expiresAt: fresh.expiresAt ?? expiryFor(event, plan) };
}

export interface GalleryExpiry {
  plan: GalleryPlan;
  itemLimit: number;
  itemCount: number;
  expiresAt: Date | null;
  daysLeft: number | null;
  footerForced: boolean;
}

export async function getGalleryExpiry(eventId: string, now = new Date()): Promise<GalleryExpiry> {
  const gallery = await prisma.gallery.findUniqueOrThrow({ where: { eventId } });
  const plan: GalleryPlan = gallery.plan === 'PLUS' ? 'PLUS' : 'FREE';
  const itemCount = await prisma.mediaItem.count({ where: { galleryId: gallery.id, deletedAt: null } });
  const daysLeft = gallery.expiresAt ? Math.ceil((gallery.expiresAt.getTime() - now.getTime()) / 86400000) : null;
  return {
    plan,
    itemLimit: gallery.itemLimit,
    itemCount,
    expiresAt: gallery.expiresAt,
    daysLeft,
    footerForced: plan === 'FREE' && gallery.showFooter,
  };
}
