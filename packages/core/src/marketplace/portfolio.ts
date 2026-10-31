import { prisma } from '@tiwa/db';
import { sniffMime, type Storage } from '@tiwa/storage';
import { z } from 'zod';
import type { Actor } from '../auth/authorize.js';
import { authorizeOrg, type OrgAction } from '../auth/org.js';
import { NotFoundError, ValidationError } from '../shared/errors.js';
import { uuidv7 } from '../shared/ids.js';
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
  await storage.delete(item.key).catch(() => undefined);
}
