import { prisma } from '@tiwa/db';
import { sniffMime, type Storage } from '@tiwa/storage';
import { z } from 'zod';
import type { Actor } from '../auth/authorize.js';
import { authorizeOrg, type OrgAction } from '../auth/org.js';
import { NotFoundError, ValidationError } from '../shared/errors.js';
import { uuidv7 } from '../shared/ids.js';
import { requireEventAccess } from '../events/access.js';
import { audit } from '../shared/outbox.js';

// Portfolio items (MKT-01, P6-T02): the public proof of past work. Same
// start → browser PUT → complete pattern as event documents (D-A05):
// keys never contain file names, completion verifies magic bytes.

type UserActor = Extract<Actor, { kind: 'user' }>;

export const MAX_PORTFOLIO_BYTES = 10 * 1024 * 1024;

export const PORTFOLIO_TYPES: Record<string, string> = {
  'image/jpeg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
};

export const startPortfolioUploadSchema = z.object({
  orgId: z.string().uuid(),
  mime: z.string().refine((mime) => mime in PORTFOLIO_TYPES, 'typeNotAllowed'),
  sizeBytes: z.number().int().min(1, 'emptyFile').max(MAX_PORTFOLIO_BYTES, 'tooLarge'),
  caption: z.string().trim().max(200, 'captionTooLong').optional(),
});

export const portfolioItemSchema = z.object({ orgId: z.string().uuid(), itemId: z.string().uuid() });

function keyFor(orgId: string, itemId: string): string {
  return `business/${orgId}/portfolio/${itemId}`;
}

async function loadAccess(actor: UserActor, orgId: string, action: OrgAction) {
  const membership = await prisma.membership.findUnique({
    where: { orgId_userId: { orgId, userId: actor.userId } },
  });
  authorizeOrg(actor, action, orgId, membership ? { orgId, role: membership.role } : null);
}

export async function startPortfolioUpload(
  storage: Storage,
  actor: UserActor,
  input: z.infer<typeof startPortfolioUploadSchema>,
) {
  await loadAccess(actor, input.orgId, 'org.manage');
  const count = await prisma.portfolioItem.count({ where: { orgId: input.orgId } });
  if (count >= 60) throw new ValidationError('Portfolio is full', { field: 'file', key: 'portfolioFull' });
  const id = uuidv7();
  const storageKey = keyFor(input.orgId, id);
  await prisma.portfolioItem.create({
    data: { id, orgId: input.orgId, kind: 'PHOTO', key: storageKey, caption: input.caption || null, sortOrder: count },
  });
  const uploadUrl = await storage.signPut(storageKey, input.mime, input.sizeBytes);
  return { itemId: id, uploadUrl };
}

export async function completePortfolioUpload(
  storage: Storage,
  actor: UserActor,
  input: z.infer<typeof portfolioItemSchema>,
) {
  await loadAccess(actor, input.orgId, 'org.manage');
  const item = await prisma.portfolioItem.findFirst({ where: { id: input.itemId, orgId: input.orgId } });
  if (!item) throw new NotFoundError('Portfolio item not found');
  const stored = await storage.head(item.key);
  const sniffed = stored ? sniffMime(await storage.readStart(item.key, 16)) : null;
  const valid = stored !== null && sniffed !== null && sniffed in PORTFOLIO_TYPES;
  if (!valid) {
    await storage.delete(item.key).catch(() => undefined);
    await prisma.portfolioItem.delete({ where: { id: item.id } });
    throw new ValidationError('File content is not a supported image', { field: 'file', key: 'contentMismatch' });
  }
  await audit(prisma, {
    actor,
    action: 'org.portfolio.add',
    targetType: 'Organization',
    targetId: input.orgId,
    data: { itemId: item.id },
  });
  return { itemId: item.id };
}

export async function removePortfolioItem(
  storage: Storage,
  actor: UserActor,
  input: z.infer<typeof portfolioItemSchema>,
) {
  await loadAccess(actor, input.orgId, 'org.manage');
  const item = await prisma.portfolioItem.findFirst({ where: { id: input.itemId, orgId: input.orgId } });
  if (!item) throw new NotFoundError('Portfolio item not found');
  await prisma.$transaction(async (tx) => {
    await tx.portfolioItem.delete({ where: { id: item.id } });
    await audit(tx, {
      actor,
      action: 'org.portfolio.remove',
      targetType: 'Organization',
      targetId: input.orgId,
      data: { itemId: item.id },
    });
  });
  // Moments-sourced items reference shared gallery storage — never delete it.
  if (!item.mediaItemId) await storage.delete(item.key).catch(() => undefined);
}

export const addMomentsSchema = z.object({
  orgId: z.string().uuid(),
  mediaItemIds: z.array(z.string().uuid()).min(1).max(30),
});

/** Tag host-approved-path Moments photos to a verified event (P14-T04):
 * the media must be published event photos from a COMPLETED booking of
 * this vendor. Items start pending; the event host approves them. */
export async function addMomentsToPortfolio(actor: UserActor, raw: z.input<typeof addMomentsSchema>) {
  const input = addMomentsSchema.parse(raw);
  const membership = await prisma.membership.findFirst({
    where: { userId: actor.userId, orgId: input.orgId },
    select: { role: true },
  });
  if (!membership) throw new NotFoundError('Business not found');
  const media = await prisma.mediaItem.findMany({
    where: { id: { in: input.mediaItemIds }, state: 'PUBLISHED', kind: 'PHOTO' },
    select: { id: true, galleryId: true, largeKey: true, thumbKey: true },
  });
  if (media.length !== input.mediaItemIds.length) {
    throw new ValidationError('Some photos are not available', { field: 'mediaItemIds' });
  }
  const galleries = await prisma.gallery.findMany({
    where: { id: { in: [...new Set(media.map((row) => row.galleryId))] } },
    select: { id: true, eventId: true },
  });
  const galleryEvents = new Map(galleries.map((row) => [row.id, row.eventId] as const));
  const eventIds = [...new Set([...galleryEvents.values()])];
  const verified = await prisma.booking.findMany({
    where: { eventId: { in: eventIds }, vendorOrgId: input.orgId, status: 'COMPLETED' },
    select: { eventId: true },
  });
  const verifiedEvents = new Set(verified.map((row) => row.eventId));
  const rows = media.filter((row) => {
    const eventId = galleryEvents.get(row.galleryId);
    return eventId !== undefined && verifiedEvents.has(eventId);
  });
  if (rows.length !== media.length) {
    throw new ValidationError('Photos must come from your completed events', { field: 'mediaItemIds' });
  }
  const existing = await prisma.portfolioItem.count({ where: { orgId: input.orgId } });
  if (existing + rows.length > 60) throw new ValidationError('Portfolio is full', { field: 'mediaItemIds' });
  const created = await prisma.$transaction(async (tx) => {
    const out: { itemId: string; eventId: string }[] = [];
    for (const row of rows) {
      const eventId = galleryEvents.get(row.galleryId)!;
      const item = await tx.portfolioItem.upsert({
        where: { mediaItemId: row.id },
        create: {
          id: uuidv7(),
          orgId: input.orgId,
          kind: 'PHOTO',
          key: row.largeKey ?? row.thumbKey ?? '',
          thumbKey: row.thumbKey,
          mediaItemId: row.id,
          eventId,
        },
        update: {},
        select: { id: true },
      });
      await audit(tx, {
        actor,
        action: 'org.portfolio.add',
        targetType: 'Organization',
        targetId: input.orgId,
        data: { itemId: item.id, eventId, fromMoments: true },
      });
      out.push({ itemId: item.id, eventId });
    }
    return out;
  });
  return { itemIds: created.map((row) => row.itemId) };
}

export const approvePortfolioSchema = z.object({ itemId: z.string().uuid() });

async function loadPortfolioItemForHost(actor: UserActor, itemId: string) {
  const item = await prisma.portfolioItem.findUnique({
    where: { id: itemId },
    select: { id: true, orgId: true, eventId: true, mediaItemId: true, approvedAt: true },
  });
  if (!item || !item.eventId || !item.mediaItemId) throw new NotFoundError('Portfolio item not found');
  await requireEventAccess(actor, item.eventId, 'event.edit');
  return item;
}

/** The event host approves a vendor's Moments photo for their portfolio. */
export async function approvePortfolioItem(actor: UserActor, raw: z.input<typeof approvePortfolioSchema>) {
  const input = approvePortfolioSchema.parse(raw);
  const item = await loadPortfolioItemForHost(actor, input.itemId);
  await prisma.$transaction(async (tx) => {
    await tx.portfolioItem.update({
      where: { id: item.id },
      data: { approvedAt: new Date(), approvedById: actor.userId },
    });
    await audit(tx, {
      actor,
      action: 'org.portfolio.approve',
      targetType: 'Organization',
      targetId: item.orgId,
      data: { itemId: item.id, eventId: item.eventId },
    });
  });
  return { ok: true as const };
}

/** The event host declines: the row goes, the shared gallery photo stays. */
export async function declinePortfolioItem(actor: UserActor, raw: z.input<typeof approvePortfolioSchema>) {
  const input = approvePortfolioSchema.parse(raw);
  const item = await loadPortfolioItemForHost(actor, input.itemId);
  await prisma.$transaction(async (tx) => {
    await tx.portfolioItem.delete({ where: { id: item.id } });
    await audit(tx, {
      actor,
      action: 'org.portfolio.decline',
      targetType: 'Organization',
      targetId: item.orgId,
      data: { itemId: item.id, eventId: item.eventId },
    });
  });
  return { ok: true as const };
}

/** Pending host approvals for one event (close page, P14-T04). */
export async function pendingPortfolioItems(actor: UserActor, eventId: string) {
  await requireEventAccess(actor, eventId, 'event.view');
  const rows = await prisma.portfolioItem.findMany({
    where: { eventId, approvedAt: null, mediaItemId: { not: null } },
    orderBy: { id: 'asc' },
    select: { id: true, orgId: true, key: true, thumbKey: true, caption: true },
  });
  const orgs = await prisma.organization.findMany({
    where: { id: { in: [...new Set(rows.map((row) => row.orgId))] } },
    select: { id: true, name: true },
  });
  const names = new Map(orgs.map((row) => [row.id, row.name] as const));
  return rows.map((row) => ({ ...row, orgName: names.get(row.orgId) ?? '?' }));
}

/** Events whose photos the vendor may claim (T04): COMPLETED bookings. */
export async function momentsSourceEvents(orgId: string) {
  const bookings = await prisma.booking.findMany({
    where: { vendorOrgId: orgId, status: 'COMPLETED' },
    select: { eventId: true, event: { select: { name: true } } },
    take: 30,
  });
  const galleries = await prisma.gallery.findMany({
    where: { eventId: { in: [...new Set(bookings.map((row) => row.eventId))] } },
    select: { id: true, eventId: true },
  });
  const galleryIds = galleries.map((row) => row.id);
  const media =
    galleryIds.length > 0
      ? await prisma.mediaItem.findMany({
          where: { galleryId: { in: galleryIds }, state: 'PUBLISHED', kind: 'PHOTO' },
          orderBy: { createdAt: 'desc' },
          take: 120,
          select: { id: true, galleryId: true, thumbKey: true },
        })
      : [];
  const galleryById = new Map(galleries.map((row) => [row.id, row.eventId] as const));
  const eventById = new Map(bookings.map((row) => [row.eventId, row.event.name] as const));
  const byEvent = new Map<string, { id: string; thumbKey: string | null }[]>();
  for (const row of media) {
    const eventId = galleryById.get(row.galleryId);
    if (!eventId) continue;
    const list = byEvent.get(eventId) ?? [];
    list.push({ id: row.id, thumbKey: row.thumbKey });
    byEvent.set(eventId, list);
  }
  return [...byEvent.entries()].map(([eventId, items]) => ({
    eventId,
    eventName: eventById.get(eventId) ?? '?',
    items,
  }));
}

/** Vendor workspace view: everything plus approval state (T04). */
export async function listVendorPortfolio(actor: UserActor, orgId: string) {
  const membership = await prisma.membership.findFirst({
    where: { userId: actor.userId, orgId },
    select: { role: true },
  });
  if (!membership) throw new NotFoundError('Business not found');
  return prisma.portfolioItem.findMany({
    where: { orgId },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, key: true, thumbKey: true, caption: true, mediaItemId: true, eventId: true, approvedAt: true },
  });
}
