import { prisma } from '@tiwa/db';
import { FakeStorage } from '@tiwa/storage';
import { afterAll, describe, expect, it } from 'vitest';
import type { Actor } from '../auth/authorize.js';
import { PRESETS } from '../auth/presets.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../shared/errors.js';
import { toStoredPermissions } from './access.js';
import { createEventDraft } from './commands.js';
import {
  completeDocumentUpload,
  deleteDocument,
  documentDownloadUrl,
  listDocuments,
  startDocumentSchema,
  startDocumentUpload,
} from './documents.js';

type UserActor = Extract<Actor, { kind: 'user' }>;
const users: string[] = [];
const pdf = new TextEncoder().encode('%PDF-1.7 contract');

async function makeUser(name = 'Host'): Promise<UserActor> {
  const user = await prisma.user.create({ data: { name, countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user', userId: user.id, isAdmin: false };
}

afterAll(async () => {
  const events = await prisma.event.findMany({ where: { createdById: { in: users } }, select: { id: true } });
  const ids = events.map((event) => event.id);
  await prisma.document.deleteMany({ where: { eventId: { in: ids } } });
  await prisma.eventParticipant.deleteMany({ where: { eventId: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { targetId: { in: ids } } });
  await prisma.event.deleteMany({ where: { id: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

describe('documents (EVT-08)', () => {
  it('start → upload → complete → list → signed download → delete', async () => {
    const storage = new FakeStorage();
    const host = await makeUser();
    const { eventId } = await createEventDraft(host, { type: 'birthday' });
    const started = await startDocumentUpload(storage, host, {
      eventId,
      name: 'Venue contract.pdf',
      mime: 'application/pdf',
      sizeBytes: pdf.byteLength,
    });
    expect(started.uploadUrl).toContain('fake://put/');
    // Not listed until the upload is confirmed.
    expect(await listDocuments(host, eventId)).toHaveLength(0);

    const row = await prisma.document.findUniqueOrThrow({ where: { id: started.documentId } });
    expect(row.storageKey).not.toContain('contract'); // no file names in storage keys
    await storage.put(row.storageKey, pdf, 'application/pdf');
    await completeDocumentUpload(storage, host, { eventId, documentId: started.documentId });

    const list = await listDocuments(host, eventId);
    expect(list.map((doc) => doc.name)).toEqual(['Venue contract.pdf']);
    expect(await documentDownloadUrl(storage, host, { eventId, documentId: started.documentId })).toContain(
      'fake://get/',
    );

    await deleteDocument(storage, host, { eventId, documentId: started.documentId });
    expect(await listDocuments(host, eventId)).toHaveLength(0);
    expect(await storage.head(row.storageKey)).toBeNull();
  });

  it('rejects content that does not match its declared type, and wrong sizes', async () => {
    const storage = new FakeStorage();
    const host = await makeUser();
    const { eventId } = await createEventDraft(host, { type: 'birthday' });
    const html = new TextEncoder().encode('<html>not a pdf</html>');
    const started = await startDocumentUpload(storage, host, {
      eventId,
      name: 'sneaky.pdf',
      mime: 'application/pdf',
      sizeBytes: html.byteLength,
    });
    const row = await prisma.document.findUniqueOrThrow({ where: { id: started.documentId } });
    await storage.put(row.storageKey, html, 'application/pdf');
    await expect(
      completeDocumentUpload(storage, host, { eventId, documentId: started.documentId }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await storage.head(row.storageKey)).toBeNull();

    const sized = await startDocumentUpload(storage, host, {
      eventId,
      name: 'a.pdf',
      mime: 'application/pdf',
      sizeBytes: 999,
    });
    const sizedRow = await prisma.document.findUniqueOrThrow({ where: { id: sized.documentId } });
    await storage.put(sizedRow.storageKey, pdf, 'application/pdf');
    await expect(
      completeDocumentUpload(storage, host, { eventId, documentId: sized.documentId }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('validates type and the 25 MB limit; view-only members can list but not upload', async () => {
    expect(
      startDocumentSchema.safeParse({
        eventId: crypto.randomUUID(),
        name: 'x.exe',
        mime: 'application/x-msdownload',
        sizeBytes: 10,
      }).success,
    ).toBe(false);
    expect(
      startDocumentSchema.safeParse({
        eventId: crypto.randomUUID(),
        name: 'big.pdf',
        mime: 'application/pdf',
        sizeBytes: 26 * 1024 * 1024,
      }).success,
    ).toBe(false);

    const storage = new FakeStorage();
    const host = await makeUser();
    const viewer = await makeUser('Viewer');
    const stranger = await makeUser('Stranger');
    const { eventId } = await createEventDraft(host, { type: 'birthday' });
    await prisma.eventParticipant.create({
      data: { eventId, userId: viewer.userId, role: 'CO_HOST', permissions: toStoredPermissions(PRESETS.view_only) },
    });
    await expect(
      startDocumentUpload(storage, viewer, { eventId, name: 'a.pdf', mime: 'application/pdf', sizeBytes: 10 }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(await listDocuments(viewer, eventId)).toEqual([]);
    await expect(listDocuments(stranger, eventId)).rejects.toBeInstanceOf(NotFoundError);
  });
});
