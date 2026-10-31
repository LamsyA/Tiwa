import { prisma } from '@tiwa/db';
import { sniffMime, type Storage } from '@tiwa/storage';
import { z } from 'zod';
import type { Actor } from '../auth/authorize.js';
import { authorizeOrg, type OrgAction } from '../auth/org.js';
import { ConflictError, NotFoundError, ValidationError } from '../shared/errors.js';
import { uuidv7 } from '../shared/ids.js';
import { audit } from '../shared/outbox.js';

// Business verification (MKT-06, P6-T03): the business uploads an ID and its
// CAC registration certificate; status goes PENDING for the admin queue
// (decided in P16, UF-28). The Verified badge (T04) needs APPROVED.

type UserActor = Extract<Actor, { kind: 'user' }>;

export const MAX_VERIFICATION_BYTES = 10 * 1024 * 1024;

export const VERIFICATION_TYPES: Record<string, string> = {
  'application/pdf': 'application/pdf',
  'image/jpeg': 'image/jpeg',
  'image/png': 'image/png',
};

export const VERIFICATION_DOC_TYPES = ['id', 'cac', 'other'] as const;

export const startVerificationUploadSchema = z.object({
  orgId: z.string().uuid(),
  docType: z.enum(VERIFICATION_DOC_TYPES),
  mime: z.string().refine((mime) => mime in VERIFICATION_TYPES, 'typeNotAllowed'),
  sizeBytes: z.number().int().min(1, 'emptyFile').max(MAX_VERIFICATION_BYTES, 'tooLarge'),
});

function keyFor(orgId: string, uploadId: string): string {
  return `business/${orgId}/verification/${uploadId}`;
}

async function loadAccess(actor: UserActor, orgId: string, action: OrgAction) {
  const membership = await prisma.membership.findUnique({
    where: { orgId_userId: { orgId, userId: actor.userId } },
  });
  authorizeOrg(actor, action, orgId, membership ? { orgId, role: membership.role } : null);
}

/** Mint a signed PUT for one verification document; the key is returned for the submit call. */
export async function startVerificationUpload(
  storage: Storage,
  actor: UserActor,
  input: z.infer<typeof startVerificationUploadSchema>,
) {
  await loadAccess(actor, input.orgId, 'org.manage');
  const pending = await prisma.businessVerification.findFirst({ where: { orgId: input.orgId, status: 'PENDING' } });
  if (pending) throw new ConflictError('A verification is already in review', { reason: 'already-pending' });
  const uploadId = uuidv7();
  const storageKey = keyFor(input.orgId, uploadId);
  const uploadUrl = await storage.signPut(storageKey, input.mime, input.sizeBytes);
  return { uploadId, storageKey, uploadUrl };
}

export const submitVerificationSchema = z.object({
  orgId: z.string().uuid(),
  documents: z
    .array(z.object({ type: z.enum(VERIFICATION_DOC_TYPES), storageKey: z.string().min(1).max(300) }))
    .min(1, 'documentsRequired')
    .max(5, 'documentsTooMany'),
});

export async function submitVerification(
  storage: Storage,
  actor: UserActor,
  input: z.infer<typeof submitVerificationSchema>,
) {
  await loadAccess(actor, input.orgId, 'org.manage');
  const pending = await prisma.businessVerification.findFirst({ where: { orgId: input.orgId, status: 'PENDING' } });
  if (pending) throw new ConflictError('A verification is already in review', { reason: 'already-pending' });
  for (const document of input.documents) {
    if (!document.storageKey.startsWith(`business/${input.orgId}/verification/`)) {
      throw new ValidationError('Document is not from this business', { field: 'documents', key: 'keyMismatch' });
    }
    const stored = await storage.head(document.storageKey);
    const sniffed = stored ? sniffMime(await storage.readStart(document.storageKey, 16)) : null;
    if (!stored || !sniffed || !(sniffed in VERIFICATION_TYPES)) {
      await storage.delete(document.storageKey).catch(() => undefined);
      throw new ValidationError('Document is missing or not a supported file', {
        field: 'documents',
        key: 'contentMismatch',
      });
    }
  }
  return prisma.$transaction(async (tx) => {
    const verification = await tx.businessVerification.create({
      data: { orgId: input.orgId, status: 'PENDING', documents: input.documents },
    });
    await tx.organization.update({ where: { id: input.orgId }, data: { verification: 'PENDING' } });
    await audit(tx, {
      actor,
      action: 'org.verification.submit',
      targetType: 'Organization',
      targetId: input.orgId,
      data: { verificationId: verification.id, count: input.documents.length },
    });
    return verification;
  });
}

export async function getVerification(actor: UserActor, orgId: string) {
  await loadAccess(actor, orgId, 'org.view');
  return prisma.businessVerification.findFirst({ where: { orgId }, orderBy: { createdAt: 'desc' } });
}

export async function removeVerificationDocument(
  storage: Storage,
  actor: UserActor,
  input: { orgId: string; storageKey: string },
) {
  await loadAccess(actor, input.orgId, 'org.manage');
  if (!input.storageKey.startsWith(`business/${input.orgId}/verification/`)) throw new NotFoundError();
  await storage.delete(input.storageKey).catch(() => undefined);
}
