import { prisma } from '@tiwa/db';
import { afterAll, describe, expect, it } from 'vitest';
import { finalizeEvent } from '../events/commands.js';
import { shortCode } from '../shared/ids.js';
import { ensureGallery } from './galleries.js';

const users: string[] = [];
const events: string[] = [];

async function makeHost() {
  const user = await prisma.user.create({ data: { name: 'Host', countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user' as const, userId: user.id, isAdmin: false };
}

async function makeDraft() {
  const host = await makeHost();
  const draft = await prisma.event.create({
    data: {
      slug: `g-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      type: 'birthday',
      format: 'PRIVATE_CELEBRATION',
      status: 'DRAFT',
      name: 'Gallery Party',
      countryCode: 'NG',
      currency: 'NGN',
      timezone: 'Africa/Lagos',
      createdById: host.userId,
    },
    select: { id: true },
  });
  events.push(draft.id);
  await prisma.eventParticipant.create({
    data: { eventId: draft.id, userId: host.userId, role: 'HOST', acceptedAt: new Date() },
  });
  await prisma.event.update({ where: { id: draft.id }, data: { startsAt: new Date('2031-03-01T15:00:00Z') } });
  return { host, eventId: draft.id };
}

afterAll(async () => {
  const galleryIds = (await prisma.gallery.findMany({ where: { eventId: { in: events } }, select: { id: true } })).map(
    (row) => row.id,
  );
  await prisma.mediaItem.deleteMany({ where: { galleryId: { in: galleryIds } } });
  await prisma.guestbookMessage.deleteMany({ where: { galleryId: { in: galleryIds } } });
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

describe('shortCode', () => {
  it('emits typable codes without confusables', () => {
    const code = shortCode(8);
    expect(code).toMatch(/^[A-Z2-9]{8}$/);
    expect(code).not.toMatch(/[01ILO]/);
  });

  it('rejects short lengths', () => {
    expect(() => shortCode(3)).toThrow();
  });
});

describe('ensureGallery', () => {
  it('creates one gallery per event and returns the same row twice', async () => {
    const { eventId } = await makeDraft();
    const first = await prisma.$transaction((tx) => ensureGallery(tx, eventId));
    expect(first.code).toMatch(/^[A-Z2-9]{8}$/);
    const second = await prisma.$transaction((tx) => ensureGallery(tx, eventId));
    expect(second).toEqual(first);
    expect(await prisma.gallery.count({ where: { eventId } })).toBe(1);
  });
});

describe('finalizeEvent', () => {
  it('creates the gallery on finalize', async () => {
    const { host, eventId } = await makeDraft();
    await finalizeEvent(host, { eventId });
    const gallery = await prisma.gallery.findUniqueOrThrow({ where: { eventId } });
    expect(gallery.code).toHaveLength(8);
    expect(gallery.accessCode).toHaveLength(6);
  });
});
