import { prisma } from '@tiwa/db';
import { FakeStorage } from '@tiwa/storage';
import { afterAll, describe, expect, it } from 'vitest';
import type { Actor } from '../auth/authorize.js';
import { PRESETS } from '../auth/presets.js';
import { ForbiddenError, InvalidTransitionError, ValidationError } from '../shared/errors.js';
import { toStoredPermissions } from './access.js';
import { cancelEvent, createEventDraft } from './commands.js';
import {
  completeCoverUpload,
  removeCover,
  startCoverUpload,
  updateEventAppearance,
  updateEventDetails,
  updateEventFeatures,
  updateEventFeaturesSchema,
} from './settings.js';

type UserActor = Extract<Actor, { kind: 'user' }>;
const users: string[] = [];
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

async function makeUser(name = 'Host'): Promise<UserActor> {
  const user = await prisma.user.create({ data: { name, countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user', userId: user.id, isAdmin: false };
}

afterAll(async () => {
  const events = await prisma.event.findMany({ where: { createdById: { in: users } }, select: { id: true } });
  const ids = events.map((event) => event.id);
  await prisma.eventDay.deleteMany({ where: { eventId: { in: ids } } });
  await prisma.eventParticipant.deleteMany({ where: { eventId: { in: ids } } });
  await prisma.outboxEvent.deleteMany({
    where: { OR: ids.map((id) => ({ payload: { path: ['eventId'], equals: id } })) },
  });
  await prisma.auditLog.deleteMany({ where: { targetId: { in: ids } } });
  await prisma.event.deleteMany({ where: { id: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

describe('event settings (P3-T10)', () => {
  it('updates details in the event timezone', async () => {
    const host = await makeUser();
    const { eventId } = await createEventDraft(host, { type: 'birthday' });
    await updateEventDetails(host, {
      eventId,
      name: 'Ada at 40',
      description: 'Garden party',
      date: '2031-03-01',
      startTime: '16:00',
      endTime: '20:00',
      expectedGuests: 90,
    });
    const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    expect(event).toMatchObject({ name: 'Ada at 40', description: 'Garden party', expectedGuests: 90 });
    expect(event.startsAt?.toISOString()).toBe('2031-03-01T15:00:00.000Z');
  });

  it('features follow format rules: tickets only when public', async () => {
    const host = await makeUser();
    const { eventId: concert } = await createEventDraft(host, { type: 'concert' });
    await updateEventFeatures(host, {
      eventId: concert,
      visibility: 'PUBLIC',
      invites: false,
      moments: true,
      tickets: true,
    });
    await expect(
      updateEventFeatures(host, {
        eventId: concert,
        visibility: 'LINK_ONLY',
        invites: false,
        moments: true,
        tickets: true,
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    const { eventId: party } = await createEventDraft(host, { type: 'birthday' });
    await expect(
      updateEventFeatures(host, { eventId: party, visibility: 'PUBLIC', invites: true, moments: true, tickets: false }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(
      updateEventFeaturesSchema.safeParse({
        eventId: party,
        visibility: 'SECRET',
        invites: true,
        moments: true,
        tickets: false,
      }).success,
    ).toBe(false);
  });

  it('theme colour must be #rrggbb; members without event.edit are refused; cancelled events are frozen', async () => {
    const host = await makeUser();
    const viewer = await makeUser('Viewer');
    const { eventId } = await createEventDraft(host, { type: 'birthday' });
    await prisma.eventParticipant.create({
      data: { eventId, userId: viewer.userId, role: 'CO_HOST', permissions: toStoredPermissions(PRESETS.view_only) },
    });
    await updateEventAppearance(host, { eventId, themeColor: '#C2410C' });
    expect((await prisma.event.findUniqueOrThrow({ where: { id: eventId } })).themeColor).toBe('#c2410c');
    await expect(updateEventAppearance(viewer, { eventId, themeColor: '#000000' })).rejects.toBeInstanceOf(
      ForbiddenError,
    );

    await cancelEvent(host, { eventId });
    await expect(updateEventAppearance(host, { eventId, themeColor: null })).rejects.toBeInstanceOf(
      InvalidTransitionError,
    );
  });

  it('cover: signed upload, verified as an image, replaces and removes the old file', async () => {
    const storage = new FakeStorage();
    const host = await makeUser();
    const { eventId } = await createEventDraft(host, { type: 'birthday' });

    const first = await startCoverUpload(storage, host, { eventId, mime: 'image/png', sizeBytes: png.byteLength });
    await storage.put(first.key, png, 'image/png');
    await completeCoverUpload(storage, host, { eventId, key: first.key, mime: 'image/png', sizeBytes: png.byteLength });
    expect((await prisma.event.findUniqueOrThrow({ where: { id: eventId } })).coverKey).toBe(first.key);

    const second = await startCoverUpload(storage, host, { eventId, mime: 'image/png', sizeBytes: png.byteLength });
    await storage.put(second.key, png, 'image/png');
    await completeCoverUpload(storage, host, {
      eventId,
      key: second.key,
      mime: 'image/png',
      sizeBytes: png.byteLength,
    });
    expect(await storage.head(first.key)).toBeNull();

    // A non-image, or a key from another event, is refused.
    const fake = await startCoverUpload(storage, host, { eventId, mime: 'image/jpeg', sizeBytes: 4 });
    await storage.put(fake.key, new TextEncoder().encode('text'), 'image/jpeg');
    await expect(
      completeCoverUpload(storage, host, { eventId, key: fake.key, mime: 'image/jpeg', sizeBytes: 4 }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      completeCoverUpload(storage, host, { eventId, key: 'events/other/cover/x', mime: 'image/png', sizeBytes: 12 }),
    ).rejects.toBeInstanceOf(ValidationError);

    await removeCover(storage, host, { eventId });
    expect((await prisma.event.findUniqueOrThrow({ where: { id: eventId } })).coverKey).toBeNull();
    expect(await storage.head(second.key)).toBeNull();
  });
});
