import { prisma } from '@tiwa/db';
import { FakeStorage } from '@tiwa/storage';
import { afterAll, describe, expect, it } from 'vitest';
import type { Actor } from '../auth/authorize.js';
import { NotFoundError, ValidationError } from '../shared/errors.js';
import { attachmentKey, startAttachment, type ImageScanner } from './attachments.js';

/** Test scanner: records keys; `decide` picks the verdict. */
class FakeModeration implements ImageScanner {
  readonly scanned: { key: string; sizeBytes: number }[] = [];
  constructor(private readonly decide: (input: { sizeBytes: number }) => 'APPROVE' | 'BLOCK' = () => 'APPROVE') {}
  async scan(input: { key: string; mime: string; sizeBytes: number; kind: 'PHOTO' | 'VIDEO' }) {
    this.scanned.push({ key: input.key, sizeBytes: input.sizeBytes });
    return { verdict: this.decide(input) };
  }
}
import { listMessages } from './inbox.js';
import { sendMessage, sendMessageSchema, startThread } from './threads.js';

type UserActor = Extract<Actor, { kind: 'user' }>;
const RUN = String(Date.now()).slice(-7);
const users: string[] = [];
const orgs: string[] = [];
let seq = 0;
const cid = () => `att-${RUN}-${(seq += 1)}`;
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const pdf = new TextEncoder().encode('%PDF-1.7 quote');

async function setup() {
  const host = await prisma.user.create({ data: { name: 'Host', countryCode: 'NG' } });
  const owner = await prisma.user.create({ data: { name: 'Owner', countryCode: 'NG' } });
  const stranger = await prisma.user.create({ data: { name: 'Stranger', countryCode: 'NG' } });
  users.push(host.id, owner.id, stranger.id);
  const org = await prisma.organization.create({
    data: { kind: 'VENDOR', name: 'Vendor', slug: `att-${RUN}-${orgs.length}`, countryCode: 'NG' },
  });
  orgs.push(org.id);
  await prisma.membership.create({ data: { orgId: org.id, userId: owner.id, role: 'OWNER' } });
  const actor = (id: string): UserActor => ({ kind: 'user', userId: id, isAdmin: false });
  const { threadId } = await startThread(actor(host.id), {
    context: 'PROFILE',
    toOrgId: org.id,
    firstMessage: { clientMessageId: cid(), body: 'Hi' },
  });
  return { host: actor(host.id), owner: actor(owner.id), stranger: actor(stranger.id), threadId };
}

afterAll(async () => {
  await prisma.thread.deleteMany({ where: { createdById: { in: users } } });
  await prisma.membership.deleteMany({ where: { orgId: { in: orgs } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

describe('chat attachments (lean, D-X20)', () => {
  it('photo + PDF: signed upload, verified, stored as an IMAGE/FILE message, downloadable by participants only', async () => {
    const storage = new FakeStorage();
    const moderation = new FakeModeration();
    const { host, owner, stranger, threadId } = await setup();

    const photo = await startAttachment(storage, host, { threadId, mime: 'image/png', sizeBytes: png.byteLength });
    expect(photo.key.startsWith(`chat/${threadId}/`)).toBe(true);
    await storage.put(photo.key, png, 'image/png');
    const doc = await startAttachment(storage, host, { threadId, mime: 'application/pdf', sizeBytes: pdf.byteLength });
    await storage.put(doc.key, pdf, 'application/pdf');

    const { messageId } = await sendMessage(
      host,
      {
        threadId,
        clientMessageId: cid(),
        attachments: [
          { key: photo.key, name: 'Hall.png', mime: 'image/png', sizeBytes: png.byteLength },
          { key: doc.key, name: 'Quote.pdf', mime: 'application/pdf', sizeBytes: pdf.byteLength },
        ],
      },
      { storage, moderation },
    );
    const stored = await prisma.message.findUniqueOrThrow({ where: { id: messageId } });
    expect(stored.kind).toBe('FILE'); // mixed → FILE; all images → IMAGE
    expect(moderation.scanned.map((s) => s.key)).toEqual([photo.key]); // only images are scanned

    const view = (await listMessages(owner, threadId)).messages.find((m) => m.id === messageId);
    expect(view?.attachments.map((a) => a.name)).toEqual(['Hall.png', 'Quote.pdf']);
    expect(JSON.stringify(view)).not.toContain(photo.key); // keys stay server-side

    expect((await attachmentKey(owner, messageId, 1)).key).toBe(doc.key);
    await expect(attachmentKey(stranger, messageId, 0)).rejects.toBeInstanceOf(NotFoundError);
    await expect(attachmentKey(owner, messageId, 5)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects wrong bytes, wrong size, foreign keys and blocked images — and deletes them', async () => {
    const storage = new FakeStorage();
    const moderation = new FakeModeration((input) => (input.sizeBytes === 13 ? 'BLOCK' : 'APPROVE'));
    const { host, threadId } = await setup();
    const send = (attachment: { key: string; name: string; mime: string; sizeBytes: number }) =>
      sendMessage(host, { threadId, clientMessageId: cid(), attachments: [attachment] }, { storage, moderation });

    const fake = await startAttachment(storage, host, { threadId, mime: 'image/png', sizeBytes: 5 });
    await storage.put(fake.key, new TextEncoder().encode('hello'), 'image/png');
    await expect(send({ key: fake.key, name: 'x.png', mime: 'image/png', sizeBytes: 5 })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(await storage.head(fake.key)).toBeNull();

    const sized = await startAttachment(storage, host, { threadId, mime: 'image/png', sizeBytes: 99 });
    await storage.put(sized.key, png, 'image/png');
    await expect(send({ key: sized.key, name: 'x.png', mime: 'image/png', sizeBytes: 99 })).rejects.toBeInstanceOf(
      ValidationError,
    );

    await expect(
      send({ key: 'chat/another-thread/abc', name: 'x.png', mime: 'image/png', sizeBytes: 12 }),
    ).rejects.toBeInstanceOf(ValidationError);

    const bad = new Uint8Array([...png, 9]);
    const blocked = await startAttachment(storage, host, { threadId, mime: 'image/png', sizeBytes: bad.byteLength });
    await storage.put(blocked.key, bad, 'image/png');
    await expect(
      send({ key: blocked.key, name: 'x.png', mime: 'image/png', sizeBytes: bad.byteLength }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await storage.head(blocked.key)).toBeNull();
  });

  it('strangers cannot get upload URLs; empty messages are refused', async () => {
    const storage = new FakeStorage();
    const { stranger, threadId } = await setup();
    await expect(
      startAttachment(storage, stranger, { threadId, mime: 'image/png', sizeBytes: 10 }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(sendMessageSchema.safeParse({ threadId, clientMessageId: cid() }).success).toBe(false);
  });
});
