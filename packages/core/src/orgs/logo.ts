import { prisma } from '@tiwa/db';
import { sniffMime, type Storage } from '@tiwa/storage';
import { z } from 'zod';
import type { Actor } from '../auth/authorize.js';
import { authorizeOrg } from '../auth/org.js';
import { NotFoundError, ValidationError } from '../shared/errors.js';
import { uuidv7 } from '../shared/ids.js';
import { audit } from '../shared/outbox.js';

// Business logo (D-X47): shown on proposals, invoices and the public profile.
// Same start → browser PUT → complete pattern as portfolio photos; the key
// is only stored once the bytes are checked to be an image.

type UserActor = Extract<Actor, { kind: 'user' }>;

const LOGO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export const startLogoUploadSchema = z.object({
  orgId: z.string().uuid(),
  mime: z.string().refine((mime) => LOGO_TYPES.includes(mime), 'typeNotAllowed'),
  sizeBytes: z.number().int().min(1, 'emptyFile').max(MAX_LOGO_BYTES, 'tooLarge'),
});

export const completeLogoUploadSchema = z.object({
  orgId: z.string().uuid(),
  key: z.string().min(1).max(200),
});

async function requireManager(actor: UserActor, orgId: string) {
  const membership = await prisma.membership.findUnique({ where: { orgId_userId: { orgId, userId: actor.userId } } });
  authorizeOrg(actor, 'org.manage', orgId, membership ? { orgId, role: membership.role } : null);
}

export async function startLogoUpload(storage: Storage, actor: UserActor, raw: z.input<typeof startLogoUploadSchema>) {
  const input = startLogoUploadSchema.parse(raw);
  await requireManager(actor, input.orgId);
  const key = `business/${input.orgId}/logo/${uuidv7()}`;
  const uploadUrl = await storage.signPut(key, input.mime, input.sizeBytes);
  return { key, uploadUrl };
}

export async function completeLogoUpload(
  storage: Storage,
  actor: UserActor,
  raw: z.input<typeof completeLogoUploadSchema>,
) {
  const input = completeLogoUploadSchema.parse(raw);
  await requireManager(actor, input.orgId);
  if (!input.key.startsWith(`business/${input.orgId}/logo/`)) throw new NotFoundError('Logo not found');
  const stored = await storage.head(input.key);
  const sniffed = stored ? sniffMime(await storage.readStart(input.key, 16)) : null;
  if (!sniffed || !LOGO_TYPES.includes(sniffed)) {
    await storage.delete(input.key).catch(() => undefined);
    throw new ValidationError('That file is not an image', { field: 'file', key: 'typeNotAllowed' });
  }
  const previous = await prisma.organization.findUniqueOrThrow({
    where: { id: input.orgId },
    select: { logoKey: true },
  });
  await prisma.$transaction(async (tx) => {
    await tx.organization.update({ where: { id: input.orgId }, data: { logoKey: input.key } });
    await audit(tx, { actor, action: 'org.logo.set', targetType: 'Organization', targetId: input.orgId, data: {} });
  });
  if (previous.logoKey && previous.logoKey !== input.key) await storage.delete(previous.logoKey).catch(() => undefined);
  return { key: input.key };
}

/** Storage key of an org's logo, for the redirect route (logos are public branding). */
export async function orgLogoKey(orgId: string): Promise<string> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { logoKey: true, deletedAt: true },
  });
  if (!org?.logoKey || org.deletedAt) throw new NotFoundError('Logo not found');
  return org.logoKey;
}
