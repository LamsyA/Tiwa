// P12 run-of-show: items, dependencies (cycles rejected), transitive
// dependants, owner status updates, vendor isolation (DAY-01–DAY-02, UF-24-2).
// Follows the repo's integration-test pattern (real Postgres, per-file cleanup).
import { prisma } from '@tiwa/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Actor } from '../auth/authorize.js';
import { permissionsFor, toStoredPermissions } from '../events/access.js';
import { uuidv7 } from '../shared/ids.js';
import {
  addDependency,
  createFromProgramme,
  createRunItem,
  dependants,
  markLate,
  removeDependency,
  runOfShow,
  vendorCheckIn,
  vendorDayTasks,
} from './day.js';
import { updateRunStatus } from './day.js';

type UserActor = Extract<Actor, { kind: 'user' }>;

const users: string[] = [];
const events: string[] = [];

async function makeUser(name: string): Promise<UserActor> {
  const user = await prisma.user.create({ data: { name, countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user', userId: user.id, isAdmin: false };
}

let host: UserActor;
let vendor: UserActor;
let outsider: UserActor;
let eventId = '';
let vendorOrgId = '';

beforeAll(async () => {
  host = await makeUser('P12 Host');
  vendor = await makeUser('P12 Vendor Staff');
  outsider = await makeUser('P12 Outsider');
  const org = await prisma.organization.create({
    data: { kind: 'VENDOR', name: 'P12 Catering', slug: `p12-catering-${Date.now().toString(36)}`, countryCode: 'NG' },
  });
  vendorOrgId = org.id;
  const event = await prisma.event.create({
    data: {
      id: uuidv7(),
      slug: `p12-day-${Date.now().toString(36)}`,
      type: 'conference',
      format: 'CORPORATE',
      status: 'ACTIVE',
      name: 'P12 Run-of-show Event',
      visibility: 'PRIVATE',
      countryCode: 'NG',
      currency: 'NGN',
      timezone: 'Africa/Lagos',
      createdById: host.userId,
      participants: {
        create: [
          {
            id: uuidv7(),
            userId: host.userId,
            role: 'HOST',
            permissions: toStoredPermissions(permissionsFor('HOST', 'full')),
            acceptedAt: new Date(),
          },
          {
            id: uuidv7(),
            userId: vendor.userId,
            role: 'VENDOR',
            orgId: vendorOrgId,
            permissions: toStoredPermissions(permissionsFor('VENDOR', 'full')),
            acceptedAt: new Date(),
          },
        ],
      },
    },
  });
  eventId = event.id;
  events.push(eventId);
  await prisma.programmeItem.createMany({
    data: [
      { eventId, title: 'Doors open', startsAt: new Date('2031-06-01T17:00:00Z'), sortOrder: 0 },
      { eventId, title: 'Keynote', startsAt: new Date('2031-06-01T18:00:00Z'), sortOrder: 1 },
    ],
  });
});

afterAll(async () => {
  await prisma.runDependency.deleteMany({ where: { item: { eventId: { in: events } } } }).catch(() => undefined);
  await prisma.runItem.deleteMany({ where: { eventId: { in: events } } }).catch(() => undefined);
  await prisma.programmeItem.deleteMany({ where: { eventId: { in: events } } }).catch(() => undefined);
  await prisma.eventParticipant.deleteMany({ where: { eventId: { in: events } } }).catch(() => undefined);
  await prisma.event.deleteMany({ where: { id: { in: events } } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { id: { in: users } } }).catch(() => undefined);
  if (vendorOrgId) await prisma.organization.deleteMany({ where: { id: vendorOrgId } }).catch(() => undefined);
});

describe('run items (P12-T02)', () => {
  it('creates items from the programme, idempotently', async () => {
    const first = await createFromProgramme(host, eventId);
    expect(first.created).toBe(2);
    const second = await createFromProgramme(host, eventId);
    expect(second.created).toBe(0);
    const items = await runOfShow(host, eventId);
    expect(items.items.map((row) => row.title)).toEqual(['Doors open', 'Keynote']);
  });

  it('creates items with owners and durations', async () => {
    const row = await createRunItem(host, {
      eventId,
      title: 'Sound check',
      startsAt: '2031-06-01T15:00:00Z',
      durationMin: 60,
      ownerOrgId: vendorOrgId,
    });
    expect(row.itemId).toBeTruthy();
    const day = await runOfShow(host, eventId);
    expect(day.items.find((item) => item.id === row.itemId)?.ownerName).toBe('P12 Catering');
  });

  it('rejects owners who are not on the event', async () => {
    await expect(
      createRunItem(host, { eventId, title: 'X', startsAt: '2031-06-01T15:00:00Z', ownerUserId: outsider.userId }),
    ).rejects.toThrow();
  });
});

describe('dependencies (DAY-02, UF-24-2)', () => {
  it('links items, resolves transitive dependants, and rejects cycles', async () => {
    const day = await runOfShow(host, eventId);
    const byTitle = new Map(day.items.map((row) => [row.title, row]));
    const doors = byTitle.get('Doors open')!;
    const keynote = byTitle.get('Keynote')!;
    const sound = byTitle.get('Sound check')!;
    // Sound check → doors → keynote: keynote transitively waits on sound.
    await addDependency(host, { eventId, itemId: doors!.id, dependsOnId: sound.id });
    await addDependency(host, { eventId, itemId: keynote!.id, dependsOnId: doors!.id });
    expect(await dependants(sound.id)).toEqual(expect.arrayContaining([doors!.id, keynote!.id]));
    expect(await dependants(doors!.id)).toEqual([keynote!.id]);
    // Keynote → sound would close the loop.
    await expect(addDependency(host, { eventId, itemId: sound.id, dependsOnId: keynote!.id })).rejects.toThrow();
    await expect(addDependency(host, { eventId, itemId: doors!.id, dependsOnId: sound.id })).rejects.toThrow();
    await removeDependency(host, { eventId, itemId: keynote!.id, dependsOnId: doors!.id });
    expect(await dependants(sound.id)).toEqual([doors!.id]);
  });
});

describe('mark late (DAY-02, UF-24-2)', () => {
  it('flags the item LATE, returns transitive dependants, and queues owner alerts', async () => {
    const day = await runOfShow(host, eventId);
    const byTitle = new Map(day.items.map((row) => [row.title, row]));
    const sound = byTitle.get('Sound check')!;
    const result = await markLate(host, { eventId, itemId: sound.id, lateByMin: 20 });
    expect(result.lateByMin).toBe(20);
    expect(result.dependantIds).toEqual(expect.arrayContaining([byTitle.get('Doors open')!.id]));
    const after = await runOfShow(host, eventId);
    expect(after.items.find((row) => row.id === sound.id)?.status).toBe('LATE');
    const queued = await prisma.outboxEvent.findFirst({
      where: { topic: 'day.item_late' },
      orderBy: { createdAt: 'desc' },
    });
    expect(queued).toBeTruthy();
    expect((queued!.payload as { itemId: string }).itemId).toBe(sound.id);
  });
});

describe('vendor arrival (DAY-03)', () => {
  it('lets the vendor team tap arrival on their own booking only', async () => {
    const booking = await prisma.booking.create({
      data: {
        id: uuidv7(),
        eventId,
        vendorOrgId,
        category: 'catering',
        status: 'CONFIRMED',
        paymentMode: 'OFFLINE',
        totalMinor: 100_000n,
        currency: 'NGN',
      },
    });
    const tapped = await vendorCheckIn(vendor, { bookingId: booking.id, lat: 6.45, lng: 3.39 });
    expect(tapped.eventId).toBe(eventId);
    await expect(vendorCheckIn(outsider, { bookingId: booking.id })).rejects.toThrow();
    const otherOrg = await prisma.organization.create({
      data: {
        kind: 'VENDOR',
        name: 'P12 Other Catering',
        slug: `p12-other-${Date.now().toString(36)}`,
        countryCode: 'NG',
      },
    });
    const otherBooking = await prisma.booking.create({
      data: {
        id: uuidv7(),
        eventId,
        vendorOrgId: otherOrg.id,
        category: 'catering',
        status: 'CONFIRMED',
        paymentMode: 'OFFLINE',
        totalMinor: 50_000n,
        currency: 'NGN',
      },
    });
    await expect(vendorCheckIn(vendor, { bookingId: otherBooking.id })).rejects.toThrow();
    const tasks = await vendorDayTasks(vendor, vendorOrgId);
    const mine = tasks.bookings.find((row) => row.bookingId === booking.id)!;
    expect(mine.arrivedAt).toBeTruthy();
    expect(mine.items.map((row) => row.title)).toContain('Sound check');
    await expect(vendorDayTasks(outsider, vendorOrgId)).rejects.toThrow();
    await prisma.vendorCheckIn.deleteMany({ where: { eventId } });
    await prisma.booking.deleteMany({ where: { eventId } });
    await prisma.organization.deleteMany({ where: { id: otherOrg.id } }).catch(() => undefined);
  });
});

describe('status updates', () => {
  it('lets the owning vendor move their own item, nobody elses', async () => {
    const day = await runOfShow(host, eventId);
    const sound = day.items.find((row) => row.title === 'Sound check')!;
    const doors = day.items.find((row) => row.title === 'Doors open')!;
    await expect(updateRunStatus(vendor, { eventId, itemId: sound.id, status: 'DONE' })).resolves.toMatchObject({
      status: 'DONE',
    });
    await expect(updateRunStatus(vendor, { eventId, itemId: doors.id, status: 'DONE' })).rejects.toThrow();
  });
});
