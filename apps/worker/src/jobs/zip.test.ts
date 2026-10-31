import { createEventDraft } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { FakeEmail } from '@tiwa/messaging';
import { FakeStorage } from '@tiwa/storage';
import { afterAll, describe, expect, it } from 'vitest';
import { handleZip } from './zip.js';

const users: string[] = [];
const eventIds: string[] = [];
const galleryIds: string[] = [];

const fakeLog = { info: () => undefined } as unknown as Parameters<typeof handleZip>[1];

async function makeHost(email = 'host@example.com') {
  const user = await prisma.user.create({ data: { name: 'Host', email, countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user' as const, userId: user.id, isAdmin: false };
}

async function makeGallery() {
  const host = await makeHost(`host-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`);
  const { eventId } = await createEventDraft(host, { type: 'birthday' });
  eventIds.push(eventId);
  await prisma.event.update({ where: { id: eventId }, data: { startsAt: new Date('2031-05-01T12:00:00Z') } });
  const gallery = await prisma.gallery.create({
    data: { eventId, code: `t11-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, accessCode: 'ABCDEF' },
  });
  galleryIds.push(gallery.id);
  return { host, eventId, gallery };
}

afterAll(async () => {
  await prisma.mediaZip.deleteMany({ where: { galleryId: { in: galleryIds } } });
  await prisma.mediaItem.deleteMany({ where: { galleryId: { in: galleryIds } } });
  await prisma.guestbookMessage.deleteMany({ where: { galleryId: { in: galleryIds } } });
  await prisma.guestSession.deleteMany({ where: { galleryId: { in: galleryIds } } });
  await prisma.gallery.deleteMany({ where: { id: { in: galleryIds } } });
  await prisma.task.deleteMany({ where: { eventId: { in: eventIds } } });
  await prisma.programmeItem.deleteMany({ where: { eventId: { in: eventIds } } });
  await prisma.eventDay.deleteMany({ where: { eventId: { in: eventIds } } });
  await prisma.budgetCategory.deleteMany({ where: { eventId: { in: eventIds } } });
  await prisma.eventParticipant.deleteMany({ where: { eventId: { in: eventIds } } });
  await prisma.auditLog.deleteMany({ where: { targetId: { in: [...eventIds, ...galleryIds] } } });
  await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

describe('media/zip', () => {
  it('packs published originals into Official/Guest folders and emails the link', async () => {
    const { host, gallery } = await makeGallery();
    const store = new FakeStorage();
    await store.put(`g/${gallery.id}/a.jpg`, new Uint8Array([1, 2, 3]), 'image/jpeg');
    await store.put(`g/${gallery.id}/b.jpg`, new Uint8Array([4, 5, 6, 7]), 'image/jpeg');
    await prisma.mediaItem.createMany({
      data: [
        {
          galleryId: gallery.id,
          album: 'OFFICIAL',
          kind: 'PHOTO',
          state: 'PUBLISHED',
          originalKey: `g/${gallery.id}/a.jpg`,
          sizeBytes: 3,
        },
        {
          galleryId: gallery.id,
          album: 'GUEST',
          kind: 'PHOTO',
          state: 'PUBLISHED',
          originalKey: `g/${gallery.id}/b.jpg`,
          sizeBytes: 4,
        },
        {
          galleryId: gallery.id,
          album: 'GUEST',
          kind: 'PHOTO',
          state: 'PENDING_REVIEW',
          originalKey: `g/${gallery.id}/c.jpg`,
          sizeBytes: 5,
        },
        {
          galleryId: gallery.id,
          album: 'GUEST',
          kind: 'PHOTO',
          state: 'BLOCKED',
          originalKey: `g/${gallery.id}/d.jpg`,
          sizeBytes: 6,
        },
      ],
    });
    const zip = await prisma.mediaZip.create({ data: { galleryId: gallery.id, requestedByUserId: host.userId } });
    const email = new FakeEmail();
    expect(await handleZip({ zipId: zip.id }, fakeLog, { storagePrivate: store, email })).toEqual({ status: 'READY' });
    const row = await prisma.mediaZip.findUniqueOrThrow({ where: { id: zip.id } });
    expect(row.status).toBe('READY');
    expect(row.itemCount).toBe(2);
    expect(row.key).toContain('.zip');
    const packed = store.objects.get(row.key!);
    expect(packed).toBeTruthy();
    // ZIP local headers list both folders, pending/blocked excluded.
    const names = new TextDecoder().decode(packed!.body);
    expect(names).toContain('Official/a.jpg');
    expect(names).toContain('Guest/b.jpg');
    expect(names).not.toContain('c.jpg');
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0]).toMatchObject({ to: expect.stringContaining('@example.com') });
    // Idempotent rerun.
    expect(await handleZip({ zipId: zip.id }, fakeLog, { storagePrivate: store, email })).toEqual({ status: 'READY' });
    expect(email.sent).toHaveLength(1);
  });

  it('fails empty galleries without sending mail', async () => {
    const { gallery } = await makeGallery();
    const store = new FakeStorage();
    const zip = await prisma.mediaZip.create({ data: { galleryId: gallery.id } });
    const email = new FakeEmail();
    expect(await handleZip({ zipId: zip.id }, fakeLog, { storagePrivate: store, email })).toEqual({ status: 'FAILED' });
    expect((await prisma.mediaZip.findUniqueOrThrow({ where: { id: zip.id } })).failReason).toBe('empty');
    expect(email.sent).toHaveLength(0);
  });
});
