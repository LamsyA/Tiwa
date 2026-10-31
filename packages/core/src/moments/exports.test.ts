import { prisma } from '@tiwa/db';
import { afterAll, describe, expect, it } from 'vitest';
import { createEventDraft } from '../events/commands.js';
import { ensureGallery } from './galleries.js';
import {
  getLatestZip,
  listGuestbookMessages,
  listGuestbookMessagesForHost,
  postGuestbookMessage,
  requestGalleryZip,
  setGuestbookHidden,
} from './exports.js';

const users: string[] = [];
const events: string[] = [];

async function makeHost() {
  const user = await prisma.user.create({ data: { name: 'Host', countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user' as const, userId: user.id, isAdmin: false };
}

async function eventWithGallery() {
  const host = await makeHost();
  const { eventId } = await createEventDraft(host, { type: 'birthday' });
  events.push(eventId);
  await prisma.event.update({ where: { id: eventId }, data: { startsAt: new Date('2031-03-01T15:00:00Z') } });
  await prisma.$transaction((tx) => ensureGallery(tx, eventId));
  const gallery = await prisma.gallery.findUniqueOrThrow({ where: { eventId } });
  return { host, eventId, gallery };
}

afterAll(async () => {
  const galleryIds = (await prisma.gallery.findMany({ where: { eventId: { in: events } }, select: { id: true } })).map(
    (row) => row.id,
  );
  await prisma.mediaZip.deleteMany({ where: { galleryId: { in: galleryIds } } });
  await prisma.guestbookMessage.deleteMany({ where: { galleryId: { in: galleryIds } } });
  await prisma.outboxEvent.deleteMany({ where: { topic: 'media/zip' } });
  await prisma.mediaItem.deleteMany({ where: { galleryId: { in: galleryIds } } });
  await prisma.guestSession.deleteMany({ where: { galleryId: { in: galleryIds } } });
  await prisma.gallery.deleteMany({ where: { eventId: { in: events } } });
  await prisma.task.deleteMany({ where: { eventId: { in: events } } });
  await prisma.programmeItem.deleteMany({ where: { eventId: { in: events } } });
  await prisma.eventDay.deleteMany({ where: { eventId: { in: events } } });
  await prisma.budgetCategory.deleteMany({ where: { eventId: { in: events } } });
  await prisma.eventParticipant.deleteMany({ where: { eventId: { in: events } } });
  await prisma.auditLog.deleteMany({ where: { targetId: { in: events } } });
  await prisma.event.deleteMany({ where: { id: { in: events } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

describe('requestGalleryZip + getLatestZip', () => {
  it('creates one pending row per hour and enqueues the job', async () => {
    const { host, eventId } = await eventWithGallery();
    expect(await getLatestZip(host, eventId)).toBeNull();
    const first = await requestGalleryZip(host, { eventId });
    expect(first.status).toBe('PENDING');
    const second = await requestGalleryZip(host, { eventId });
    expect(second.zipId).toBe(first.zipId);
    const rows = await prisma.outboxEvent.findMany({ where: { topic: 'media/zip' } });
    expect(rows.filter((row) => (row.payload as { zipId?: string }).zipId === first.zipId)).toHaveLength(1);
    const latest = await getLatestZip(host, eventId);
    expect(latest).toMatchObject({ id: first.zipId, status: 'PENDING' });
    const stranger = await makeHost();
    await expect(requestGalleryZip(stranger, { eventId })).rejects.toThrow();
    await expect(getLatestZip(stranger, eventId)).rejects.toThrow();
  });
});

describe('guestbook', () => {
  it('posts through the privacy gate, lists newest first, hides for hosts', async () => {
    const { host, eventId, gallery } = await eventWithGallery();
    await prisma.gallery.update({ where: { id: gallery.id }, data: { privacy: 'GUESTS_ONLY' } });
    await expect(postGuestbookMessage({ kind: 'anonymous' }, { code: gallery.code, body: 'Hello' })).rejects.toThrow(
      /guests only/i,
    );
    const { messageId } = await postGuestbookMessage(
      { kind: 'anonymous' },
      { code: gallery.code, access: gallery.accessCode!, name: 'Ada', body: 'Beautiful day!' },
    );
    await postGuestbookMessage(
      { kind: 'anonymous' },
      { code: gallery.code, access: gallery.accessCode!, body: 'Second' },
    );
    const wall = await listGuestbookMessages(gallery.id);
    expect(wall.messages.map((m) => m.body)).toEqual(['Second', 'Beautiful day!']);
    expect(wall.messages[1]).toMatchObject({ name: 'Ada' });

    await setGuestbookHidden(host, { eventId, messageId, hidden: true });
    expect((await listGuestbookMessages(gallery.id)).messages).toHaveLength(1);
    const full = await listGuestbookMessagesForHost(host, eventId);
    expect(full.messages).toHaveLength(2);
    await setGuestbookHidden(host, { eventId, messageId, hidden: false });
    expect((await listGuestbookMessages(gallery.id)).messages).toHaveLength(2);

    const stranger = await makeHost();
    await expect(setGuestbookHidden(stranger, { eventId, messageId, hidden: true })).rejects.toThrow();
    await expect(listGuestbookMessagesForHost(stranger, eventId)).rejects.toThrow();
  });
});
