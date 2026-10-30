import { prisma } from '@tiwa/db';
import { sniffMime, type Storage } from '@tiwa/storage';
import { z } from 'zod';
import type { Actor, EventAccess } from '../auth/authorize.js';
import { NotFoundError, ValidationError } from '../shared/errors.js';
import { uuidv7 } from '../shared/ids.js';
import { audit } from '../shared/outbox.js';
import { requireEventAccess, resolveEventAccess } from './access.js';

// Event documents (EVT-08): PDFs, images and office files up to 25 MB.
// Flow: start (signed PUT) → browser uploads straight to storage (D-A05) →
// complete (size + magic bytes verified, Backend.md §12) → listed.

type UserActor = Extract<Actor, { kind: 'user' }>;

export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

/** Declared MIME → the sniffed family it must match. */
export const DOCUMENT_TYPES: Record<string, string> = {
  'application/pdf': 'application/pdf',
  'image/jpeg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
  'image/heic': 'image/heic',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'application/zip',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'application/zip',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'application/zip',
};

export const startDocumentSchema = z.object({
  eventId: z.string().uuid(),
  name: z.string().trim().min(1, 'nameRequired').max(200, 'nameTooLong'),
  mime: z.string().refine((mime) => mime in DOCUMENT_TYPES, 'typeNotAllowed'),
  sizeBytes: z.number().int().min(1, 'emptyFile').max(MAX_DOCUMENT_BYTES, 'tooLarge'),
});

export const documentIdSchema = z.object({ eventId: z.string().uuid(), documentId: z.string().uuid() });

/** Storage keys never contain the user's file name (it may hold personal data). */
function keyFor(eventId: string, documentId: string): string {
  return `events/${eventId}/documents/${documentId}`;
}

export async function startDocumentUpload(
  storage: Storage,
  actor: UserActor,
  input: z.infer<typeof startDocumentSchema>,
) {
  await requireEventAccess(actor, input.eventId, 'event.edit');
  const id = uuidv7();
  const storageKey = keyFor(input.eventId, id);
  await prisma.document.create({
    data: {
      id,
      eventId: input.eventId,
      uploadedById: actor.userId,
      name: input.name,
      storageKey,
      mime: input.mime,
      sizeBytes: input.sizeBytes,
    },
  });
  const uploadUrl = await storage.signPut(storageKey, input.mime, input.sizeBytes);
  return { documentId: id, uploadUrl };
}

export async function completeDocumentUpload(
  storage: Storage,
  actor: UserActor,
  input: z.infer<typeof documentIdSchema>,
) {
  await requireEventAccess(actor, input.eventId, 'event.edit');
  const document = await prisma.document.findFirst({
    where: { id: input.documentId, eventId: input.eventId, uploadedById: actor.userId, deletedAt: null },
  });
  if (!document) throw new NotFoundError('Document not found');
  if (document.uploadedAt) return { documentId: document.id };

  const stored = await storage.head(document.storageKey);
  const sniffed = stored ? sniffMime(await storage.readStart(document.storageKey, 16)) : null;
  const valid = stored !== null && stored.sizeBytes === document.sizeBytes && sniffed === DOCUMENT_TYPES[document.mime];
  if (!valid) {
    await storage.delete(document.storageKey).catch(() => undefined);
    await prisma.document.update({ where: { id: document.id }, data: { deletedAt: new Date() } });
    throw new ValidationError('File content does not match its type', { field: 'file', key: 'contentMismatch' });
  }
  await prisma.$transaction(async (tx) => {
    await tx.document.update({ where: { id: document.id }, data: { uploadedAt: new Date() } });
    await audit(tx, {
      actor,
      action: 'event.document.add',
      targetType: 'Event',
      targetId: input.eventId,
      data: { documentId: document.id },
    });
  });
  return { documentId: document.id };
}

export async function listDocuments(actor: UserActor, eventId: string, preloaded?: EventAccess) {
  await resolveEventAccess(actor, eventId, 'event.view', preloaded);
  return prisma.document.findMany({
    where: { eventId, uploadedAt: { not: null }, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, mime: true, sizeBytes: true, createdAt: true, uploadedById: true },
  });
}

/** Short-lived signed download link, issued per request after a permission check. */
export async function documentDownloadUrl(storage: Storage, actor: UserActor, input: z.infer<typeof documentIdSchema>) {
  await requireEventAccess(actor, input.eventId, 'event.view');
  const document = await prisma.document.findFirst({
    where: { id: input.documentId, eventId: input.eventId, uploadedAt: { not: null }, deletedAt: null },
  });
  if (!document) throw new NotFoundError('Document not found');
  return storage.getSignedUrl(document.storageKey, 300, document.name);
}

export async function deleteDocument(storage: Storage, actor: UserActor, input: z.infer<typeof documentIdSchema>) {
  await requireEventAccess(actor, input.eventId, 'event.edit');
  const document = await prisma.document.findFirst({
    where: { id: input.documentId, eventId: input.eventId, deletedAt: null },
  });
  if (!document) throw new NotFoundError('Document not found');
  await prisma.$transaction(async (tx) => {
    await tx.document.update({ where: { id: document.id }, data: { deletedAt: new Date() } });
    await audit(tx, {
      actor,
      action: 'event.document.delete',
      targetType: 'Event',
      targetId: input.eventId,
      data: { documentId: document.id },
    });
  });
  await storage.delete(document.storageKey).catch(() => undefined);
}
