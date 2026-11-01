import { prisma } from '@tiwa/db';
import type { ModerationProvider } from '@tiwa/moderation';
import { sniffMime, type Storage } from '@tiwa/storage';
import { z } from 'zod';
import type { Actor } from '../auth/authorize.js';
import { NotFoundError, ValidationError } from '../shared/errors.js';
import { uuidv7 } from '../shared/ids.js';
import { requireParticipant } from './threads.js';

// Chat attachments (Backend.md §9a.4, lean per D-X20): photos and files up to
// 25 MB, uploaded straight to private storage with a signed PUT (D-A05),
// verified by size and magic bytes when the message is sent, images scanned
// by the moderation adapter. No worker involved. Voice notes arrive in P13.

type UserActor = Extract<Actor, { kind: 'user' }>;

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_ATTACHMENTS = 10;

/** Declared MIME → the family its bytes must sniff as. */
export const ATTACHMENT_TYPES: Record<string, string> = {
  'image/jpeg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
  'image/heic': 'image/heic',
  'application/pdf': 'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'application/zip',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'application/zip',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'application/zip',
};

export const isImage = (mime: string) => mime.startsWith('image/');

export const startAttachmentSchema = z.object({
  threadId: z.string().uuid(),
  mime: z.string().refine((mime) => mime in ATTACHMENT_TYPES, 'typeNotAllowed'),
  sizeBytes: z.number().int().min(1, 'emptyFile').max(MAX_ATTACHMENT_BYTES, 'tooLarge'),
});

export const attachmentSchema = z.object({
  key: z.string().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  mime: z.string().refine((mime) => mime in ATTACHMENT_TYPES, 'typeNotAllowed'),
  sizeBytes: z.number().int().min(1).max(MAX_ATTACHMENT_BYTES),
});

export type AttachmentInput = z.infer<typeof attachmentSchema>;

export interface StoredAttachment {
  key: string;
  name: string;
  mime: string;
  sizeBytes: number;
}

export interface AttachmentDeps {
  storage: Storage;
  moderation: ModerationProvider;
}

const keyPrefix = (threadId: string) => `chat/${threadId}/`;

/** Signed PUT for one file; the key is scoped to the thread and never contains the file name. */
export async function startAttachment(
  storage: Storage,
  actor: UserActor,
  input: z.infer<typeof startAttachmentSchema>,
) {
  await requireParticipant(actor, input.threadId);
  const key = `${keyPrefix(input.threadId)}${uuidv7()}`;
  return { key, uploadUrl: await storage.signPut(key, input.mime, input.sizeBytes) };
}

/**
 * Check every attachment before its message is stored: the key belongs to
 * this thread, the object exists with the declared size, the bytes match the
 * type, and images pass moderation. Anything that fails is deleted.
 */
export async function verifyAttachments(
  deps: AttachmentDeps,
  threadId: string,
  attachments: AttachmentInput[],
): Promise<StoredAttachment[]> {
  const out: StoredAttachment[] = [];
  for (const attachment of attachments) {
    const fail = async (key: string) => {
      await deps.storage.delete(attachment.key).catch(() => undefined);
      throw new ValidationError('Attachment rejected', { field: 'attachments', key });
    };
    if (!attachment.key.startsWith(keyPrefix(threadId))) await fail('attachmentMismatch');
    const stored = await deps.storage.head(attachment.key);
    if (!stored || stored.sizeBytes !== attachment.sizeBytes) await fail('attachmentMismatch');
    const sniffed = sniffMime(await deps.storage.readStart(attachment.key, 16));
    if (sniffed !== ATTACHMENT_TYPES[attachment.mime]) await fail('attachmentMismatch');
    if (isImage(attachment.mime)) {
      const scan = await deps.moderation.scan({
        key: attachment.key,
        mime: attachment.mime,
        sizeBytes: attachment.sizeBytes,
        kind: 'PHOTO',
      });
      if (scan.verdict === 'BLOCK') await fail('attachmentBlocked');
    }
    out.push({ key: attachment.key, name: attachment.name, mime: attachment.mime, sizeBytes: attachment.sizeBytes });
  }
  return out;
}

/** The storage key of file `index` on a message, for a participant (the download route signs it). */
export async function attachmentKey(actor: UserActor, messageId: string, index: number): Promise<StoredAttachment> {
  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message || message.deletedAt) throw new NotFoundError('Attachment not found');
  await requireParticipant(actor, message.threadId);
  const attachment = (message.attachments as unknown as StoredAttachment[])[index];
  if (!attachment) throw new NotFoundError('Attachment not found');
  return attachment;
}
