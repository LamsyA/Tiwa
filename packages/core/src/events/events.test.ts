import { getEventType } from '@tiwa/config';
import { prisma } from '@tiwa/db';
import { afterAll, describe, expect, it } from 'vitest';
import type { Actor } from '../auth/authorize.js';
import { ForbiddenError, InvalidTransitionError, NotFoundError, ValidationError } from '../shared/errors.js';
import { utcToZoned, zonedTimeToUtc } from '../shared/zoned.js';
import { fromStoredPermissions, loadEventAccess, permissionsFor, toStoredPermissions } from './access.js';
import { cancelEvent, createEventDraft, duplicateEvent, finalizeEvent, saveEventStep } from './commands.js';
import { getEventOverview, listMyEvents } from './queries.js';

type UserActor = Extract<Actor, { kind: 'user' }>;
const users: string[] = [];

async function makeUser(name = 'Host'): Promise<UserActor> {
  const user = await prisma.user.create({ data: { name, countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user', userId: user.id, isAdmin: false };
}

/** A fully set-up birthday, through every wizard step. */
async function birthday(host: UserActor, budgetMinor = '50000000') {
  const { eventId } = await createEventDraft(host, { type: 'birthday' });
  await saveEventStep(host, {
    eventId,
    step: 'basics',
    data: { name: "Ada's 40th", date: '2030-12-12', startTime: '18:00', endTime: '23:00' },
  });
  await saveEventStep(host, {
    eventId,
    step: 'venue',
    data: { days: [{ date: '2030-12-12', venueName: 'Garden Hall', address: 'Lekki' }] },
  });
  await saveEventStep(host, {
    eventId,
    step: 'guests',
    data: { expectedGuests: 120, budgetMinor, visibility: 'PRIVATE' },
  });
  await saveEventStep(host, { eventId, step: 'features', data: { invites: true, moments: true, tickets: false } });
  return eventId;
}

afterAll(async () => {
  const events = await prisma.event.findMany({ where: { createdById: { in: users } }, select: { id: true } });
  const ids = events.map((event) => event.id);
  await prisma.programmeItem.deleteMany({ where: { eventId: { in: ids } } });
  await prisma.task.deleteMany({ where: { eventId: { in: ids } } });
  await prisma.budgetCategory.deleteMany({ where: { eventId: { in: ids } } });
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

describe('zoned time', () => {
  it('converts Lagos wall time to UTC and back', () => {
    const instant = zonedTimeToUtc('2030-12-12', '18:00', 'Africa/Lagos');
    expect(instant.toISOString()).toBe('2030-12-12T17:00:00.000Z');
    expect(utcToZoned(instant, 'Africa/Lagos')).toEqual({ date: '2030-12-12', time: '18:00' });
  });

  it('handles DST zones', () => {
    expect(zonedTimeToUtc('2030-07-01', '12:00', 'Europe/London').toISOString()).toBe('2030-07-01T11:00:00.000Z');
    expect(zonedTimeToUtc('2030-01-01', '12:00', 'Europe/London').toISOString()).toBe('2030-01-01T12:00:00.000Z');
  });
});

describe('permissions storage', () => {
  it('round-trips the bigint approval cap and fails closed on junk', () => {
    const stored = toStoredPermissions({ ...permissionsFor('CO_HOST', 'finance'), approveUpToMinor: 10_000_000n });
    expect(stored.approveUpToMinor).toBe('10000000');
    expect(fromStoredPermissions(JSON.parse(JSON.stringify(stored))).approveUpToMinor).toBe(10_000_000n);
    expect(fromStoredPermissions(null).eventEdit).toBe(false);
    expect(fromStoredPermissions({ approveUpToMinor: 'lots' }).approveUpToMinor).toBe(0n);
  });
});

describe('createEventDraft', () => {
  it('creates a DRAFT with template defaults and the creator as HOST', async () => {
    const host = await makeUser();
    const { eventId } = await createEventDraft(host, { type: 'conference' });
    const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    expect(event).toMatchObject({
      status: 'DRAFT',
      type: 'conference',
      format: 'PUBLIC_TICKETED',
      visibility: 'PUBLIC',
      currency: 'NGN',
      timezone: 'Africa/Lagos',
      ticketsEnabled: true,
      wizardStep: 'basics',
    });
    expect((await loadEventAccess(host.userId, eventId))?.role).toBe('HOST');
  });

  it('rejects unknown types', async () => {
    const host = await makeUser();
    await expect(createEventDraft(host, { type: 'not_a_type' })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('saveEventStep', () => {
  it('saves each step, stores times in UTC, and remembers the next step (UF-03-2)', async () => {
    const host = await makeUser();
    const { eventId } = await createEventDraft(host, { type: 'birthday' });
    const result = await saveEventStep(host, {
      eventId,
      step: 'basics',
      data: { name: "Ada's 40th", date: '2030-12-12', startTime: '22:00', endTime: '02:00' },
    });
    expect(result.next).toBe('venue');
    const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    expect(event.wizardStep).toBe('venue');
    expect(event.startsAt?.toISOString()).toBe('2030-12-12T21:00:00.000Z');
    expect(event.endsAt?.toISOString()).toBe('2030-12-13T01:00:00.000Z'); // after midnight rolls over
  });

  it('refuses PUBLIC for private formats and tickets without PUBLIC (UF-03-4)', async () => {
    const host = await makeUser();
    const { eventId } = await createEventDraft(host, { type: 'birthday' });
    await expect(
      saveEventStep(host, {
        eventId,
        step: 'guests',
        data: { expectedGuests: 10, budgetMinor: '0', visibility: 'PUBLIC' },
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      saveEventStep(host, { eventId, step: 'features', data: { invites: false, moments: true, tickets: true } }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('turns tickets off when a public event goes private', async () => {
    const host = await makeUser();
    const { eventId } = await createEventDraft(host, { type: 'concert' });
    await saveEventStep(host, {
      eventId,
      step: 'guests',
      data: { expectedGuests: 500, budgetMinor: '0', visibility: 'LINK_ONLY' },
    });
    expect((await prisma.event.findUniqueOrThrow({ where: { id: eventId } })).ticketsEnabled).toBe(false);
  });

  it('non-members get NOT_FOUND', async () => {
    const host = await makeUser();
    const stranger = await makeUser('Stranger');
    const { eventId } = await createEventDraft(host, { type: 'birthday' });
    await expect(
      saveEventStep(stranger, { eventId, step: 'features', data: { invites: false, moments: false, tickets: false } }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('finalizeEvent (UF-03-3)', () => {
  it('applies the template: tasks, budget split, programme; DRAFT → ACTIVE', async () => {
    const host = await makeUser();
    const eventId = await birthday(host, '50000000');
    await finalizeEvent(host, { eventId }, new Date('2030-01-01T00:00:00Z'));
    const template = getEventType('birthday')!;

    const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    expect(event.status).toBe('ACTIVE');
    expect(event.wizardStep).toBeNull();

    const tasks = await prisma.task.findMany({ where: { eventId } });
    expect(tasks.map((task) => task.key).sort()).toEqual(template.checklist.map((item) => item.key).sort());
    const book = tasks.find((task) => task.key === 'book_venue');
    expect(book?.dueAt?.toISOString()).toBe(new Date(Date.UTC(2030, 8, 19, 17)).toISOString()); // 84 days before

    const categories = await prisma.budgetCategory.findMany({ where: { eventId }, orderBy: { sortOrder: 'asc' } });
    expect(categories.map((category) => category.key)).toEqual(template.budget.map((split) => split.key));
    expect(categories.reduce((sum, category) => sum + category.plannedMinor, 0n)).toBe(50_000_000n);
    expect(categories[0]?.plannedMinor).toBe(12_500_000n); // venue 25%

    const programme = await prisma.programmeItem.findMany({ where: { eventId } });
    expect(programme).toHaveLength(template.programme.length);
    expect(programme.every((item) => item.dayId !== null)).toBe(true);
  });

  it('runs once; only the host may finalize', async () => {
    const host = await makeUser();
    const eventId = await birthday(host);
    const cohost = await makeUser('Co');
    await prisma.eventParticipant.create({
      data: {
        eventId,
        userId: cohost.userId,
        role: 'CO_HOST',
        permissions: toStoredPermissions(permissionsFor('CO_HOST', 'full')),
      },
    });
    await expect(finalizeEvent(cohost, { eventId })).rejects.toBeInstanceOf(ForbiddenError);
    await finalizeEvent(host, { eventId });
    await expect(finalizeEvent(host, { eventId })).rejects.toBeInstanceOf(InvalidTransitionError);
  });

  it('needs a date', async () => {
    const host = await makeUser();
    const { eventId } = await createEventDraft(host, { type: 'birthday' });
    await expect(finalizeEvent(host, { eventId })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('duplicate and cancel', () => {
  it('duplicates setup into a new draft without tasks', async () => {
    const host = await makeUser();
    const eventId = await birthday(host);
    await finalizeEvent(host, { eventId });
    const { eventId: copyId } = await duplicateEvent(host, { eventId });
    const copy = await prisma.event.findUniqueOrThrow({ where: { id: copyId }, include: { days: true } });
    expect(copy).toMatchObject({ status: 'DRAFT', name: "Ada's 40th", wizardStep: 'basics', expectedGuests: 120 });
    expect(copy.days).toHaveLength(1);
    expect(await prisma.task.count({ where: { eventId: copyId } })).toBe(0);
  });

  it('host cancels DRAFT or ACTIVE once; co-hosts cannot (EVT-10)', async () => {
    const host = await makeUser();
    const eventId = await birthday(host);
    const cohost = await makeUser('Co');
    await prisma.eventParticipant.create({
      data: {
        eventId,
        userId: cohost.userId,
        role: 'CO_HOST',
        permissions: toStoredPermissions(permissionsFor('CO_HOST', 'full')),
      },
    });
    await expect(cancelEvent(cohost, { eventId })).rejects.toBeInstanceOf(ForbiddenError);
    await cancelEvent(host, { eventId });
    expect((await prisma.event.findUniqueOrThrow({ where: { id: eventId } })).status).toBe('CANCELLED');
    await expect(cancelEvent(host, { eventId })).rejects.toBeInstanceOf(InvalidTransitionError);
  });
});

describe('queries', () => {
  it('lists drafts, upcoming and past separately with progress', async () => {
    const host = await makeUser();
    const upcoming = await birthday(host);
    await finalizeEvent(host, { eventId: upcoming });
    const { eventId: draft } = await createEventDraft(host, { type: 'naming' });
    const past = await birthday(host);
    await finalizeEvent(host, { eventId: past });
    await prisma.event.update({ where: { id: past }, data: { startsAt: new Date('2020-01-01T10:00:00Z') } });

    const ids = async (tab: 'upcoming' | 'past' | 'drafts') => (await listMyEvents(host.userId, tab)).map((e) => e.id);
    expect(await ids('upcoming')).toEqual([upcoming]);
    expect(await ids('drafts')).toEqual([draft]);
    expect(await ids('past')).toEqual([past]);
    const [card] = await listMyEvents(host.userId, 'upcoming');
    expect(card?.progress.total).toBe(getEventType('birthday')!.checklist.length);
    expect(card?.role).toBe('HOST');
  });

  it('overview: progress counts, next 5 deadlines, team; strangers refused', async () => {
    const host = await makeUser('Ada');
    const eventId = await birthday(host);
    await finalizeEvent(host, { eventId });
    const firstTask = await prisma.task.findFirstOrThrow({ where: { eventId } });
    await prisma.task.update({ where: { id: firstTask.id }, data: { status: 'DONE', completedAt: new Date() } });
    const blocked = await prisma.task.findFirstOrThrow({ where: { eventId, status: 'TODO' } });
    await prisma.task.update({ where: { id: blocked.id }, data: { status: 'BLOCKED' } });

    const overview = await getEventOverview(host, eventId, new Date('2030-01-01T00:00:00Z'));
    expect(overview.myRole).toBe('HOST');
    expect(overview.progress).toMatchObject({ done: 1, blocked: 1, overdue: 0 });
    expect(overview.progress.outstanding).toBe(overview.progress.total - 1);
    expect(overview.deadlines).toHaveLength(5);
    expect(overview.team).toEqual([{ userId: host.userId, name: 'Ada', image: null, role: 'HOST', joined: true }]);

    const later = await getEventOverview(host, eventId, new Date('2031-01-01T00:00:00Z'));
    expect(later.progress.overdue).toBe(later.progress.outstanding);

    await expect(getEventOverview(await makeUser('X'), eventId)).rejects.toBeInstanceOf(NotFoundError);
  });
});
