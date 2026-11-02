// P14-T04: Moments photos join the portfolio only from verified events
// (COMPLETED bookings) and only show publicly after host approval.
import { prisma } from '@tiwa/db';
import { afterAll, describe, expect, it } from 'vitest';
import type { Actor } from '../auth/authorize.js';
import { vendorRating } from '../reviews/reviews.js';
import {
  addMomentsToPortfolio,
  approvePortfolioItem,
  declinePortfolioItem,
  listVendorPortfolio,
  removePortfolioItem,
} from './portfolio.js';
import { rollupVendorRatings } from './rollup.js';

type UserActor = Extract<Actor, { kind: 'user' }>;

const users: string[] = [];
const orgs: string[] = [];
const events: string[] = [];
const mediaIds: string[] = [];

async function makeUser(name: string): Promise<UserActor> {
  const user = await prisma.user.create({ data: { name, countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user', userId: user.id, isAdmin: false };
}

async function makeEvent(host: UserActor): Promise<string> {
  const event = await prisma.event.create({
    data: {
      slug: `port-${Date.now().toString(36)}-${events.length}`,
      type: 'birthday',
      format: 'PRIVATE_CELEBRATION',
      status: 'ACTIVE',
      name: 'Portfolio Event',
      countryCode: 'NG',
      currency: 'NGN',
      timezone: 'Africa/Lagos',
      createdById: host.userId,
    },
  });
  events.push(event.id);
  await prisma.eventParticipant.create({
    data: { eventId: event.id, userId: host.userId, role: 'HOST', permissions: '{}' },
  });
  return event.id;
}

async function makePhoto(eventId: string): Promise<string> {
  const gallery = await prisma.gallery.upsert({
    where: { eventId },
    create: { eventId, code: `P${Date.now().toString(36)}${events.length}${mediaIds.length}` },
    update: {},
  });
  const item = await prisma.mediaItem.create({
    data: {
      galleryId: gallery.id,
      album: 'GUEST',
      kind: 'PHOTO',
      state: 'PUBLISHED',
      originalKey: `test/${Date.now()}.jpg`,
      sizeBytes: 100,
    },
  });
  mediaIds.push(item.id);
  return item.id;
}

afterAll(async () => {
  await prisma.portfolioItem.deleteMany({ where: { orgId: { in: orgs } } }).catch(() => undefined);
  await prisma.mediaItem.deleteMany({ where: { id: { in: mediaIds } } }).catch(() => undefined);
  await prisma.booking.deleteMany({ where: { eventId: { in: events } } }).catch(() => undefined);
  await prisma.eventParticipant.deleteMany({ where: { eventId: { in: events } } }).catch(() => undefined);
  await prisma.event.deleteMany({ where: { id: { in: events } } }).catch(() => undefined);
  await prisma.membership.deleteMany({ where: { orgId: { in: orgs } } }).catch(() => undefined);
  await prisma.organization.deleteMany({ where: { id: { in: orgs } } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { id: { in: users } } }).catch(() => undefined);
  await prisma.businessProfile.deleteMany({ where: { orgId: { in: orgs } } }).catch(() => undefined);
});

describe('Moments portfolio (P14-T04)', () => {
  it('adds verified photos as pending, approves and declines them', async () => {
    const host = await makeUser('Port Host');
    const vendor = await makeUser('Port Vendor');
    const eventId = await makeEvent(host);
    const org = await prisma.organization.create({
      data: { kind: 'VENDOR', name: 'Port Catering', slug: `port-cat-${Date.now().toString(36)}`, countryCode: 'NG' },
    });
    orgs.push(org.id);
    await prisma.membership.create({ data: { orgId: org.id, userId: vendor.userId, role: 'OWNER' } });
    await prisma.booking.create({
      data: {
        eventId,
        vendorOrgId: org.id,
        category: 'catering',
        status: 'COMPLETED',
        paymentMode: 'OFFLINE',
        totalMinor: 100_000n,
        currency: 'NGN',
      },
    });
    const photo = await makePhoto(eventId);

    const added = await addMomentsToPortfolio(vendor, { orgId: org.id, mediaItemIds: [photo] });
    expect(added.itemIds).toHaveLength(1);
    const listed = await listVendorPortfolio(vendor, org.id);
    expect(listed.find((row) => row.id === added.itemIds[0])?.approvedAt).toBeNull();

    // Unverified events and strangers are rejected.
    const stranger = await makeUser('Port Stranger');
    const otherHost = await makeUser('Port Other');
    const otherEvent = await makeEvent(otherHost);
    const otherPhoto = await makePhoto(otherEvent);
    await expect(addMomentsToPortfolio(vendor, { orgId: org.id, mediaItemIds: [otherPhoto] })).rejects.toThrow(
      /completed events/i,
    );
    await expect(addMomentsToPortfolio(stranger, { orgId: org.id, mediaItemIds: [photo] })).rejects.toThrow();

    // Host approves one, declines another.
    await approvePortfolioItem(host, { itemId: added.itemIds[0]! });
    const photo2 = await makePhoto(eventId);
    const second = await addMomentsToPortfolio(vendor, { orgId: org.id, mediaItemIds: [photo2] });
    await declinePortfolioItem(host, { itemId: second.itemIds[0]! });
    // Declining keeps the shared gallery photo.
    expect(await prisma.mediaItem.findUnique({ where: { id: photo } })).toBeTruthy();
    expect(await prisma.portfolioItem.findMany({ where: { orgId: org.id } })).toHaveLength(1);
  });

  it('never deletes shared gallery storage on remove', async () => {
    const host = await makeUser('Port Host 2');
    const vendor = await makeUser('Port Vendor 2');
    const eventId = await makeEvent(host);
    const org = await prisma.organization.create({
      data: {
        kind: 'VENDOR',
        name: 'Port Catering 2',
        slug: `port2-cat-${Date.now().toString(36)}`,
        countryCode: 'NG',
      },
    });
    orgs.push(org.id);
    await prisma.membership.create({ data: { orgId: org.id, userId: vendor.userId, role: 'OWNER' } });
    await prisma.booking.create({
      data: {
        eventId,
        vendorOrgId: org.id,
        category: 'catering',
        status: 'COMPLETED',
        paymentMode: 'OFFLINE',
        totalMinor: 100_000n,
        currency: 'NGN',
      },
    });
    const { itemIds } = await addMomentsToPortfolio(vendor, {
      orgId: org.id,
      mediaItemIds: [await makePhoto(eventId)],
    });
    const { FakeStorage } = await import('@tiwa/storage');
    const storage = new FakeStorage();
    storage.objects.set('shared/gallery.jpg', { body: new Uint8Array(), contentType: 'image/jpeg' });
    await removePortfolioItem(storage, vendor, { orgId: org.id, itemId: itemIds[0]! });
    expect(storage.objects.has('shared/gallery.jpg')).toBe(true);
  });
});

describe('rating roll-up (P14-T04, corrected D-X39)', () => {
  it('writes cached columns the search and profile read', async () => {
    const host = await makeUser('Rollup Host');
    const eventId = await makeEvent(host);
    const org = await prisma.organization.create({
      data: { kind: 'VENDOR', name: 'Rollup Catering', slug: `roll-cat-${Date.now().toString(36)}`, countryCode: 'NG' },
    });
    orgs.push(org.id);
    await prisma.businessProfile.create({
      data: { orgId: org.id, categories: ['catering'], city: 'Lagos', currency: 'NGN', published: true },
    });
    for (let index = 0; index < 5; index++) {
      const booking = await prisma.booking.create({
        data: {
          eventId,
          vendorOrgId: org.id,
          category: 'catering',
          status: 'COMPLETED',
          paymentMode: 'OFFLINE',
          totalMinor: 100_000n,
          currency: 'NGN',
        },
      });
      await prisma.review.create({
        data: {
          bookingId: booking.id,
          vendorOrgId: org.id,
          authorId: host.userId,
          quality: 5,
          communication: 4,
          punctuality: 5,
          value: 4,
          scope: 5,
          overall: 4.4,
        },
      });
    }
    expect(await vendorRating(org.id)).toEqual({ count: 5, average: 4.4 });
    const result = await rollupVendorRatings(500);
    expect(result.orgs).toBeGreaterThanOrEqual(1);
    const profile = await prisma.businessProfile.findUniqueOrThrow({ where: { orgId: org.id } });
    expect(profile.ratingCount).toBe(5);
    expect(profile.ratingAvg).toBeCloseTo(4.4);
    expect(profile.completedBookings).toBe(5);
  });
});
