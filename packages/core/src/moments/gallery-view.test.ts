import { prisma } from '@tiwa/db';
import { afterAll, describe, expect, it } from 'vitest';
import { createGuestSession } from './uploads.js';
import { ensureGallery } from './galleries.js';
import {
  claimGallerySessionFromInvite,
  deleteOwnMedia,
  getGalleryPage,
  listGalleryMedia,
  requestMediaRemoval,
} from './gallery-view.js';
import { createEventDraft } from '../events/commands.js';

const users: string[] = [];
const events: string[] = [];

async function makeHost() {
  const user = await prisma.user.create({ data: { name: 'Host', countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user' as const, userId: user.id, isAdmin: false };
}

async function eventWithGallery(privacy: 'LINK' | 'GUESTS_ONLY' | 'PUBLIC' = 'LINK') {
  const host = await makeHost();
  const { eventId } = await createEventDraft(host, { type: 'birthday' });
  events.push(eventId);
  await prisma.event.update({ where: { id: eventId }, data: { startsAt: new Date('2031-03-01T15:00:00Z') } });
  await prisma.$transaction((tx) => ensureGallery(tx, eventId));
  const gallery = await prisma.gallery.findUniqueOrThrow({ where: { eventId } });
  await prisma.gallery.update({ where: { id: gallery.id }, data: { privacy } });
  return { host, eventId, gallery };
}

async function seedItems(galleryId: string, sessionId?: string) {
  const base = {
    galleryId,
    kind: 'PHOTO' as const,
    state: 'PUBLISHED' as const,
    originalKey: `g/${galleryId}/o.jpg`,
    sizeBytes: 10,
  };
  const official = await prisma.mediaItem.create({
    data: { ...base, album: 'OFFICIAL' as const },
    select: { id: true, createdAt: true },
  });
  const guest = await prisma.mediaItem.create({
    data: { ...base, album: 'GUEST' as const, uploaderSessionId: sessionId ?? null },
    select: { id: true, createdAt: true },
  });
  await prisma.mediaItem.create({ data: { ...base, album: 'GUEST' as const, state: 'BLOCKED' as const } });
  await prisma.mediaItem.create({ data: { ...base, album: 'GUEST' as const, state: 'PENDING_REVIEW' as const } });
  return { official, guest };
}

afterAll(async () => {
  const galleryIds = (await prisma.gallery.findMany({ where: { eventId: { in: events } }, select: { id: true } })).map(
    (row) => row.id,
  );
  const mediaIds = (
    await prisma.mediaItem.findMany({ where: { galleryId: { in: galleryIds } }, select: { id: true } })
  ).map((row) => row.id);
  await prisma.report.deleteMany({ where: { targetId: { in: mediaIds } } });
  await prisma.mediaItem.deleteMany({ where: { galleryId: { in: galleryIds } } });
  await prisma.guestbookMessage.deleteMany({ where: { galleryId: { in: galleryIds } } });
  await prisma.guestSession.deleteMany({ where: { galleryId: { in: galleryIds } } });
  await prisma.guest.deleteMany({ where: { eventId: { in: events } } });
  await prisma.report.deleteMany({ where: { targetType: 'media' } });
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

describe('getGalleryPage privacy', () => {
  it('opens LINK galleries to anonymous viewers with counts', async () => {
    const { gallery } = await eventWithGallery('LINK');
    await seedItems(gallery.id);
    const page = await getGalleryPage(gallery.code, { kind: 'anonymous' });
    expect(page.counts).toEqual({ official: 1, guest: 1 });
    expect(page.isMember).toBe(false);
  });

  it('locks GUESTS_ONLY without a session, member or access code', async () => {
    const { gallery } = await eventWithGallery('GUESTS_ONLY');
    await expect(getGalleryPage(gallery.code, { kind: 'anonymous' })).rejects.toThrow(/guests only/i);
    await expect(getGalleryPage(gallery.code, { kind: 'anonymous' }, { accessCode: 'WRONG1' })).rejects.toThrow(
      /guests only/i,
    );
    const open = await getGalleryPage(gallery.code, { kind: 'anonymous' }, { accessCode: gallery.accessCode! });
    expect(open.gallery.id).toBe(gallery.id);
  });

  it('admits members and guest sessions to GUESTS_ONLY galleries', async () => {
    const { host, gallery } = await eventWithGallery('GUESTS_ONLY');
    const member = await getGalleryPage(gallery.code, host);
    expect(member.isMember).toBe(true);
    const { sessionId } = await prisma.$transaction((tx) => createGuestSession(tx, gallery.id, 'Ada'));
    const guest = await getGalleryPage(gallery.code, { kind: 'gallery-session', sessionId });
    expect(guest.sessionId).toBe(sessionId);
    const viaList = await getGalleryPage(gallery.code, { kind: 'anonymous' }, { sessionIds: [sessionId] });
    expect(viaList.sessionId).toBe(sessionId);
  });
});

describe('listGalleryMedia', () => {
  it('filters to published rows per album with cursor pagination and mine flags', async () => {
    const { gallery } = await eventWithGallery('PUBLIC');
    const { sessionId } = await prisma.$transaction((tx) => createGuestSession(tx, gallery.id, 'Ada'));
    await seedItems(gallery.id, sessionId);
    for (let i = 0; i < 3; i++) {
      await prisma.mediaItem.create({
        data: {
          galleryId: gallery.id,
          album: 'GUEST',
          kind: 'PHOTO',
          state: 'PUBLISHED',
          originalKey: `g/${gallery.id}/o${i}.jpg`,
          sizeBytes: 10,
        },
      });
    }
    const viewer = { kind: 'gallery-session' as const, sessionId };
    const first = await listGalleryMedia(gallery.id, viewer, { album: 'GUEST', limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBeTruthy();
    expect(first.items.every((item) => item.album === 'GUEST')).toBe(true);
    const second = await listGalleryMedia(gallery.id, viewer, { album: 'GUEST', cursor: first.nextCursor!, limit: 2 });
    expect(second.items).toHaveLength(2);
    const mine = [...first.items, ...second.items].filter((item) => item.mine);
    expect(mine).toHaveLength(1);
    const official = await listGalleryMedia(gallery.id, { kind: 'anonymous' }, { album: 'OFFICIAL' });
    expect(official.items).toHaveLength(1);
    expect(official.nextCursor).toBeNull();
  });
});

describe('claimGallerySessionFromInvite', () => {
  it('mints a named session from a valid invite token', async () => {
    const { gallery, eventId } = await eventWithGallery('GUESTS_ONLY');
    const guest = await prisma.guest.create({
      data: {
        eventId,
        name: 'Adaeze',
        phone: '+2348012345678',
        inviteToken: `t-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      },
      select: { inviteToken: true },
    });
    const claimed = await claimGallerySessionFromInvite(guest.inviteToken!);
    expect(claimed.galleryId).toBe(gallery.id);
    const session = await prisma.guestSession.findUniqueOrThrow({ where: { id: claimed.sessionId } });
    expect(session.name).toBe('Adaeze');
    await expect(claimGallerySessionFromInvite('no-such-token')).rejects.toThrow(/not valid/i);
  });
});

describe('deleteOwnMedia + requestMediaRemoval', () => {
  it('lets owners delete their rows and anyone report, but not delete others', async () => {
    const { gallery } = await eventWithGallery('PUBLIC');
    const { sessionId } = await prisma.$transaction((tx) => createGuestSession(tx, gallery.id, 'Ada'));
    const { sessionId: other } = await prisma.$transaction((tx) => createGuestSession(tx, gallery.id, 'Bola'));
    const mine = await prisma.mediaItem.create({
      data: {
        galleryId: gallery.id,
        album: 'GUEST',
        kind: 'PHOTO',
        state: 'PUBLISHED',
        originalKey: `g/${gallery.id}/mine.jpg`,
        sizeBytes: 10,
        uploaderSessionId: sessionId,
      },
    });
    await expect(deleteOwnMedia({ kind: 'gallery-session', sessionId: other }, { mediaId: mine.id })).rejects.toThrow(
      /own uploads/i,
    );
    await expect(deleteOwnMedia({ kind: 'gallery-session', sessionId }, { mediaId: mine.id })).resolves.toEqual({
      deleted: true,
    });
    expect((await prisma.mediaItem.findUniqueOrThrow({ where: { id: mine.id } })).deletedAt).not.toBeNull();
    const reported = await prisma.mediaItem.create({
      data: {
        galleryId: gallery.id,
        album: 'GUEST',
        kind: 'PHOTO',
        state: 'PUBLISHED',
        originalKey: `g/${gallery.id}/theirs.jpg`,
        sizeBytes: 10,
        uploaderSessionId: other,
      },
    });
    const { reportId } = await requestMediaRemoval(
      { kind: 'gallery-session', sessionId },
      { mediaId: reported.id, reason: 'That is me, please take it down' },
    );
    const report = await prisma.report.findUniqueOrThrow({ where: { id: reportId } });
    expect(report).toMatchObject({ targetType: 'media', targetId: reported.id, reporterSessionId: sessionId });
    // Anonymous viewers without a session can still report.
    const anon = await requestMediaRemoval({ kind: 'anonymous' }, { mediaId: reported.id });
    const anonReport = await prisma.report.findUniqueOrThrow({ where: { id: anon.reportId } });
    expect(anonReport.reporterSessionId).toBeNull();
    expect(anonReport.reporterUserId).toBeNull();
  });
});
