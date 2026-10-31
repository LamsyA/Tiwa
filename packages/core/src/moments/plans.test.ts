import { prisma } from '@tiwa/db';
import { afterAll, describe, expect, it } from 'vitest';
import { createEventDraft } from '../events/commands.js';
import { ensureGallery } from './galleries.js';
import { updateGallerySettings } from './manage.js';
import { expiryFor, getGalleryExpiry, PLAN_LIMITS, planLimits, syncGalleryPlanTx } from './plans.js';

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
  await prisma.event.update({
    where: { id: eventId },
    data: { startsAt: new Date('2031-03-01T15:00:00Z'), endsAt: new Date('2031-03-02T15:00:00Z') },
  });
  await prisma.$transaction((tx) => ensureGallery(tx, eventId));
  const gallery = await prisma.gallery.findUniqueOrThrow({ where: { eventId } });
  return { host, eventId, gallery };
}

afterAll(async () => {
  const galleryIds = (await prisma.gallery.findMany({ where: { eventId: { in: events } }, select: { id: true } })).map(
    (row) => row.id,
  );
  await prisma.mediaItem.deleteMany({ where: { galleryId: { in: galleryIds } } });
  await prisma.guestbookMessage.deleteMany({ where: { galleryId: { in: galleryIds } } });
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

describe('plan limits + expiry math', () => {
  it('caps free at 500 items / 30 s / 90 days and plus higher', () => {
    expect(planLimits('FREE')).toMatchObject({ items: 500, videoSec: 30, retentionDays: 90 });
    expect(planLimits('PLUS')).toMatchObject({ items: 5000, videoSec: 180, retentionDays: 365 });
    expect(planLimits('WHATEVER')).toMatchObject({ items: 500 });
    expect(PLAN_LIMITS.FREE.items).toBe(500);
  });

  it('runs retention from the event end', () => {
    const end = new Date('2031-03-02T15:00:00Z');
    expect(expiryFor({ endsAt: end, startsAt: null }, 'FREE')).toEqual(new Date(end.getTime() + 90 * 86400000));
    expect(expiryFor({ endsAt: null, startsAt: end }, 'PLUS')).toEqual(new Date(end.getTime() + 365 * 86400000));
  });

  it('syncs itemLimit and expiry on finalize-shaped galleries', async () => {
    const { eventId } = await eventWithGallery();
    const synced = await prisma.$transaction((tx) => syncGalleryPlanTx(tx, eventId));
    expect(synced).toMatchObject({ plan: 'FREE', itemLimit: 500 });
    expect(synced.expiresAt.getTime()).toBe(new Date('2031-03-02T15:00:00Z').getTime() + 90 * 86400000);
    // Never downgrades an explicit higher limit.
    const { gallery } = await eventWithGallery();
    await prisma.gallery.update({ where: { id: gallery.id }, data: { itemLimit: 5000 } });
    const kept = await prisma.$transaction((tx) => syncGalleryPlanTx(tx, gallery.eventId));
    expect(kept.itemLimit).toBe(5000);
  });

  it('reports usage, days left and footer state', async () => {
    const { eventId, gallery } = await eventWithGallery();
    await prisma.mediaItem.create({
      data: {
        galleryId: gallery.id,
        album: 'GUEST',
        kind: 'PHOTO',
        state: 'PUBLISHED',
        originalKey: `g/${gallery.id}/e.jpg`,
        sizeBytes: 10,
      },
    });
    await prisma.$transaction((tx) => syncGalleryPlanTx(tx, eventId));
    const status = await getGalleryExpiry(eventId, new Date('2031-03-01T12:00:00Z'));
    expect(status).toMatchObject({ plan: 'FREE', itemLimit: 500, itemCount: 1 });
    expect(status.expiresAt?.toISOString()).toBe(new Date('2031-05-31T15:00:00Z').toISOString());
    expect(status.daysLeft).toBe(92);
  });
});

describe('footer gating', () => {
  it('keeps the footer forced on for free galleries', async () => {
    const { host, eventId } = await eventWithGallery();
    await expect(updateGallerySettings(host, { eventId, showFooter: false })).rejects.toThrow(/Plus/i);
    await expect(updateGallerySettings(host, { eventId, showFooter: true })).resolves.toMatchObject({});
    await prisma.gallery.update({ where: { eventId }, data: { plan: 'PLUS' } });
    await expect(updateGallerySettings(host, { eventId, showFooter: false })).resolves.toMatchObject({});
    await prisma.gallery.update({ where: { eventId }, data: { plan: 'FREE', showFooter: true } });
  });
});
