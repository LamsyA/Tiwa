import { createEventDraft } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { FakeEmail } from '@tiwa/messaging';
import { FakeStorage } from '@tiwa/storage';
import { afterAll, describe, expect, it } from 'vitest';
import { handleRetention } from './retention.js';

const users: string[] = [];
const eventIds: string[] = [];
const galleryIds: string[] = [];

const fakeLog = { info: () => undefined } as unknown as Parameters<typeof handleRetention>[0];

async function makeHost(emailSuffix: string) {
  const user = await prisma.user.create({
    data: { name: 'Host', email: `host-${emailSuffix}@example.com`, countryCode: 'NG' },
  });
  users.push(user.id);
  return { kind: 'user' as const, userId: user.id, isAdmin: false };
}

async function makeGallery(endsAt: Date) {
  const tag = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const host = await makeHost(tag);
  const { eventId } = await createEventDraft(host, { type: 'birthday' });
  eventIds.push(eventId);
  await prisma.event.update({
    where: { id: eventId },
    data: { startsAt: new Date(endsAt.getTime() - 86400000), endsAt },
  });
  const gallery = await prisma.gallery.create({
    data: { eventId, code: `t12-${tag}`, accessCode: 'ABCDEF' },
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

describe('media/retention', () => {
  it('backfills expiry and item limits for galleries missing them', async () => {
    const { gallery } = await makeGallery(new Date('2031-06-01T12:00:00Z'));
    await prisma.gallery.update({ where: { id: gallery.id }, data: { expiresAt: null, itemLimit: 10 } });
    const store = new FakeStorage();
    await handleRetention(fakeLog, {
      storagePrivate: store,
      email: new FakeEmail(),
      now: new Date('2031-06-02T00:00:00Z'),
    });
    const row = await prisma.gallery.findUniqueOrThrow({ where: { id: gallery.id } });
    expect(row.expiresAt?.toISOString()).toBe(new Date('2031-08-30T12:00:00Z').toISOString());
    expect(row.itemLimit).toBe(500);
  });

  it('warns hosts 14 days out, once per 30 days', async () => {
    const { host, gallery } = await makeGallery(new Date('2031-06-01T12:00:00Z'));
    const store = new FakeStorage();
    const email = new FakeEmail();
    const now = new Date('2031-08-21T00:00:00Z'); // 10 days before 2031-08-30
    await prisma.gallery.update({ where: { id: gallery.id }, data: { expiresAt: new Date('2031-08-30T12:00:00Z') } });
    const hostRow = await prisma.user.findUniqueOrThrow({ where: { id: host.userId }, select: { email: true } });
    await handleRetention(fakeLog, { storagePrivate: store, email, now });
    const mine = email.sent.filter((sent) => sent.to === hostRow.email);
    expect(mine).toHaveLength(1);
    expect(mine[0]?.subject).toContain('expire soon');
    const audits = await prisma.auditLog.count({ where: { action: 'media.expiryWarned', targetId: gallery.id } });
    expect(audits).toBe(1);
    await handleRetention(fakeLog, { storagePrivate: store, email, now });
    expect(email.sent.filter((sent) => sent.to === hostRow.email)).toHaveLength(1);
  });

  it('purges expired galleries: rows, derivatives, twins and zips — keeps the guestbook', async () => {
    const { gallery } = await makeGallery(new Date('2031-01-01T12:00:00Z'));
    const store = new FakeStorage();
    await store.put(`g/${gallery.id}/o.jpg`, new Uint8Array([1]), 'image/jpeg');
    await store.put(`g/${gallery.id}/img_320.avif`, new Uint8Array([2]), 'image/avif');
    await store.put(`g/${gallery.id}/img_320.webp`, new Uint8Array([3]), 'image/webp');
    await store.put(`g/${gallery.id}/img_320.wm.avif`, new Uint8Array([4]), 'image/avif');
    await prisma.mediaItem.create({
      data: {
        galleryId: gallery.id,
        album: 'GUEST',
        kind: 'PHOTO',
        state: 'PUBLISHED',
        originalKey: `g/${gallery.id}/o.jpg`,
        thumbKey: `g/${gallery.id}/img_320.wm.avif`,
        largeKey: `g/${gallery.id}/img_1080.wm.avif`,
        sizeBytes: 10,
      },
    });
    await prisma.guestbookMessage.create({ data: { galleryId: gallery.id, body: 'kept' } });
    const zip = await prisma.mediaZip.create({ data: { galleryId: gallery.id, key: `exports/${gallery.id}/z.zip` } });
    await store.put(`exports/${gallery.id}/z.zip`, new Uint8Array([5]), 'application/zip');
    await prisma.gallery.update({ where: { id: gallery.id }, data: { expiresAt: new Date('2031-02-01T00:00:00Z') } });
    const result = await handleRetention(fakeLog, {
      storagePrivate: store,
      email: new FakeEmail(),
      now: new Date('2031-03-01T00:00:00Z'),
    });
    expect(result.status).toMatch(/purged:[1-9]/);
    expect(await prisma.mediaItem.count({ where: { galleryId: gallery.id } })).toBe(0);
    expect(await prisma.mediaZip.count({ where: { galleryId: gallery.id } })).toBe(0);
    expect(await prisma.guestbookMessage.count({ where: { galleryId: gallery.id } })).toBe(1);
    for (const key of [
      `g/${gallery.id}/o.jpg`,
      `g/${gallery.id}/img_320.avif`,
      `g/${gallery.id}/img_320.webp`,
      `g/${gallery.id}/img_320.wm.avif`,
      `g/${gallery.id}/img_1080.avif`,
      `exports/${gallery.id}/z.zip`,
    ]) {
      expect(store.objects.has(key), key).toBe(false);
    }
    void zip;
  });
});
