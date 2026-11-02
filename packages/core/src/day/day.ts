import { prisma } from '@tiwa/db';
import { z } from 'zod';
import { authorize, type Actor } from '../auth/authorize.js';
import { loadEventAccess, requireEventAccess } from '../events/access.js';
import { userIdSchema } from '../shared/schemas.js';
import { ConflictError, NotFoundError, ValidationError } from '../shared/errors.js';
import { uuidv7 } from '../shared/ids.js';
import { audit } from '../shared/outbox.js';

// Run-of-show (P12-T02; DAY-01–DAY-02, UF-24). Backstage timeline items with
// owners and dependencies. The public agenda is ProgrammeItem (D-D04); items
// can be created from it or from scratch. Editors (`runofshow.edit`) manage
// everything; vendors/staff with `runofshow.updateOwn` move only their own
// items' status (matrix OWN).

type UserActor = Extract<Actor, { kind: 'user' }>;

const DATETIME = z.string().datetime({ offset: true });

export const createRunItemSchema = z.object({
  eventId: z.string().uuid(),
  dayId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1, 'titleRequired').max(200, 'titleTooLong'),
  startsAt: DATETIME,
  durationMin: z.number().int().min(5).max(1440).optional(),
  ownerUserId: userIdSchema.nullable().optional(),
  ownerOrgId: z.string().uuid().nullable().optional(),
});

async function checkOwner(eventId: string, ownerUserId?: string | null, ownerOrgId?: string | null): Promise<void> {
  if (ownerUserId) {
    const member = await prisma.eventParticipant.findFirst({
      where: { eventId, userId: ownerUserId, removedAt: null },
      select: { id: true },
    });
    if (!member) throw new ValidationError('Owner must be on the event', { field: 'ownerUserId' });
  }
  if (ownerOrgId) {
    const org = await prisma.organization.findUnique({ where: { id: ownerOrgId }, select: { id: true } });
    if (!org) throw new ValidationError('Unknown organisation', { field: 'ownerOrgId' });
  }
}

export async function createRunItem(actor: UserActor, raw: z.input<typeof createRunItemSchema>) {
  const input = createRunItemSchema.parse(raw);
  await requireEventAccess(actor, input.eventId, 'runofshow.edit');
  await checkOwner(input.eventId, input.ownerUserId, input.ownerOrgId);
  const last = await prisma.runItem.findFirst({
    where: { eventId: input.eventId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });
  const item = await prisma.$transaction(async (tx) => {
    const row = await tx.runItem.create({
      data: {
        id: uuidv7(),
        eventId: input.eventId,
        dayId: input.dayId ?? null,
        title: input.title,
        startsAt: new Date(input.startsAt),
        durationMin: input.durationMin ?? 15,
        ownerUserId: input.ownerUserId ?? null,
        ownerOrgId: input.ownerOrgId ?? null,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
      select: { id: true },
    });
    await audit(tx, {
      actor,
      action: 'day.item.create',
      targetType: 'RunItem',
      targetId: row.id,
      data: { eventId: input.eventId, title: input.title },
    });
    return row;
  });
  return { itemId: item.id };
}

export const updateRunItemSchema = z.object({
  eventId: z.string().uuid(),
  itemId: z.string().uuid(),
  title: z.string().trim().min(1, 'titleRequired').max(200, 'titleTooLong').optional(),
  startsAt: DATETIME.optional(),
  durationMin: z.number().int().min(5).max(1440).optional(),
  ownerUserId: userIdSchema.nullable().optional(),
  ownerOrgId: z.string().uuid().nullable().optional(),
});

export async function updateRunItem(actor: UserActor, raw: z.input<typeof updateRunItemSchema>) {
  const input = updateRunItemSchema.parse(raw);
  await requireEventAccess(actor, input.eventId, 'runofshow.edit');
  const item = await prisma.runItem.findFirst({ where: { id: input.itemId, eventId: input.eventId } });
  if (!item) throw new NotFoundError('Run item not found');
  await checkOwner(input.eventId, input.ownerUserId, input.ownerOrgId);
  await prisma.$transaction(async (tx) => {
    await tx.runItem.update({
      where: { id: item.id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.startsAt !== undefined ? { startsAt: new Date(input.startsAt) } : {}),
        ...(input.durationMin !== undefined ? { durationMin: input.durationMin } : {}),
        ...(input.ownerUserId !== undefined ? { ownerUserId: input.ownerUserId } : {}),
        ...(input.ownerOrgId !== undefined ? { ownerOrgId: input.ownerOrgId } : {}),
      },
    });
    await audit(tx, {
      actor,
      action: 'day.item.update',
      targetType: 'RunItem',
      targetId: item.id,
      data: { eventId: input.eventId, title: input.title ?? item.title },
    });
  });
  return { itemId: item.id };
}

export const deleteRunItemSchema = z.object({ eventId: z.string().uuid(), itemId: z.string().uuid() });

export async function deleteRunItem(actor: UserActor, raw: z.input<typeof deleteRunItemSchema>) {
  const input = deleteRunItemSchema.parse(raw);
  await requireEventAccess(actor, input.eventId, 'runofshow.edit');
  const item = await prisma.runItem.findFirst({ where: { id: input.itemId, eventId: input.eventId } });
  if (!item) throw new NotFoundError('Run item not found');
  await prisma.$transaction(async (tx) => {
    // Dependency rows cascade via FK; the audit keeps what was removed.
    await tx.runItem.delete({ where: { id: item.id } });
    await audit(tx, {
      actor,
      action: 'day.item.delete',
      targetType: 'RunItem',
      targetId: item.id,
      data: { eventId: input.eventId, title: item.title },
    });
  });
  return { ok: true as const };
}

/** Create run items from the event's programme (P12-T02). Idempotent: items
 * with the same day + title are skipped, so re-running is safe. */
export async function createFromProgramme(actor: UserActor, eventId: string) {
  await requireEventAccess(actor, eventId, 'runofshow.edit');
  const [programme, existing] = await Promise.all([
    prisma.programmeItem.findMany({
      where: { eventId, startsAt: { not: null } },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.runItem.findMany({ where: { eventId }, select: { dayId: true, title: true } }),
  ]);
  const seen = new Set(existing.map((row) => `${row.dayId ?? ''}::${row.title}`));
  const fresh = programme.filter((item) => item.startsAt && !seen.has(`${item.dayId ?? ''}::${item.title}`));
  if (fresh.length === 0) return { created: 0 };
  const last = await prisma.runItem.findFirst({
    where: { eventId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });
  let order = (last?.sortOrder ?? -1) + 1;
  await prisma.$transaction(async (tx) => {
    for (const item of fresh) {
      const row = await tx.runItem.create({
        data: {
          id: uuidv7(),
          eventId,
          dayId: item.dayId,
          title: item.title,
          startsAt: item.startsAt!,
          durationMin:
            item.endsAt && item.startsAt
              ? Math.max(5, Math.round((item.endsAt.getTime() - item.startsAt.getTime()) / 60_000))
              : 15,
          sortOrder: order++,
        },
        select: { id: true },
      });
      await audit(tx, {
        actor,
        action: 'day.item.create',
        targetType: 'RunItem',
        targetId: row.id,
        data: { eventId, title: item.title, fromProgramme: true },
      });
    }
  });
  return { created: fresh.length };
}

export const dependencySchema = z.object({
  eventId: z.string().uuid(),
  itemId: z.string().uuid(),
  dependsOnId: z.string().uuid(),
});

/** Would linking item → dependsOn create a cycle? Walk the dependsOn edges
 * from dependsOnId; reaching itemId means item already precedes it. */
async function wouldCycle(itemId: string, dependsOnId: string, eventId: string): Promise<boolean> {
  const edges = await prisma.runDependency.findMany({
    where: { item: { eventId } },
    select: { itemId: true, dependsOnId: true },
  });
  const parents = new Map<string, string[]>();
  for (const edge of edges) {
    const list = parents.get(edge.itemId) ?? [];
    list.push(edge.dependsOnId);
    parents.set(edge.itemId, list);
  }
  const stack = [dependsOnId];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === itemId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const parent of parents.get(current) ?? []) stack.push(parent);
  }
  return false;
}

export async function addDependency(actor: UserActor, raw: z.input<typeof dependencySchema>) {
  const input = dependencySchema.parse(raw);
  await requireEventAccess(actor, input.eventId, 'runofshow.edit');
  if (input.itemId === input.dependsOnId) throw new ValidationError('An item cannot depend on itself', {});
  const [item, parent] = await Promise.all([
    prisma.runItem.findFirst({ where: { id: input.itemId, eventId: input.eventId } }),
    prisma.runItem.findFirst({ where: { id: input.dependsOnId, eventId: input.eventId } }),
  ]);
  if (!item || !parent) throw new NotFoundError('Run item not found');
  const existing = await prisma.runDependency.findUnique({
    where: { itemId_dependsOnId: { itemId: input.itemId, dependsOnId: input.dependsOnId } },
  });
  if (existing) throw new ConflictError('Dependency already exists');
  if (await wouldCycle(input.itemId, input.dependsOnId, input.eventId)) {
    throw new ValidationError('This link would create a circular dependency', {});
  }
  await prisma.$transaction(async (tx) => {
    await tx.runDependency.create({ data: { itemId: input.itemId, dependsOnId: input.dependsOnId } });
    await audit(tx, {
      actor,
      action: 'day.dependency.add',
      targetType: 'RunItem',
      targetId: input.itemId,
      data: { eventId: input.eventId, dependsOnId: input.dependsOnId },
    });
  });
  return { ok: true as const };
}

export async function removeDependency(actor: UserActor, raw: z.input<typeof dependencySchema>) {
  const input = dependencySchema.parse(raw);
  await requireEventAccess(actor, input.eventId, 'runofshow.edit');
  const existing = await prisma.runDependency.findUnique({
    where: { itemId_dependsOnId: { itemId: input.itemId, dependsOnId: input.dependsOnId } },
    include: { item: { select: { eventId: true } } },
  });
  if (!existing || existing.item.eventId !== input.eventId) throw new NotFoundError('Dependency not found');
  await prisma.$transaction(async (tx) => {
    await tx.runDependency.delete({
      where: { itemId_dependsOnId: { itemId: input.itemId, dependsOnId: input.dependsOnId } },
    });
    await audit(tx, {
      actor,
      action: 'day.dependency.remove',
      targetType: 'RunItem',
      targetId: input.itemId,
      data: { eventId: input.eventId, dependsOnId: input.dependsOnId },
    });
  });
  return { ok: true as const };
}

export const updateRunStatusSchema = z.object({
  eventId: z.string().uuid(),
  itemId: z.string().uuid(),
  status: z.enum(['PLANNED', 'STARTED', 'DONE', 'SKIPPED']),
});

/** Move an item's status. Editors move anything; vendors/staff with
 * `runofshow.updateOwn` move only items owned by them or their org.
 * LATE is set through `markLate` (P12-T03) so lateness is always counted. */
export async function updateRunStatus(actor: UserActor, raw: z.input<typeof updateRunStatusSchema>) {
  const input = updateRunStatusSchema.parse(raw);
  const access = await loadEventAccess(actor.userId, input.eventId);
  if (!access) throw new NotFoundError('Event not found');
  const item = await prisma.runItem.findFirst({ where: { id: input.itemId, eventId: input.eventId } });
  if (!item) throw new NotFoundError('Run item not found');
  try {
    authorize(actor, 'runofshow.edit', { eventId: input.eventId, access });
  } catch (error) {
    const orgIds = (
      await prisma.eventParticipant.findMany({
        where: { eventId: input.eventId, userId: actor.userId, removedAt: null, orgId: { not: null } },
        select: { orgId: true },
      })
    ).map((row) => row.orgId as string);
    const own = item.ownerUserId === actor.userId || (item.ownerOrgId !== null && orgIds.includes(item.ownerOrgId));
    if (!own) throw error;
    authorize(actor, 'runofshow.updateOwn', { eventId: input.eventId, access, isOwnBooking: true });
  }
  await prisma.$transaction(async (tx) => {
    await tx.runItem.update({
      where: { id: item.id },
      data: { status: input.status, ...(input.status === 'PLANNED' ? { lateByMin: 0 } : {}) },
    });
    await audit(tx, {
      actor,
      action: 'day.status',
      targetType: 'RunItem',
      targetId: item.id,
      data: { eventId: input.eventId, from: item.status, to: input.status },
    });
  });
  return { itemId: item.id, status: input.status };
}

/** Transitive dependants of an item: everything that (directly or through
 * others) waits on it. Used to highlight the blast radius of lateness. */
export async function dependants(itemId: string): Promise<string[]> {
  const item = await prisma.runItem.findUniqueOrThrow({ where: { id: itemId } });
  const edges = await prisma.runDependency.findMany({
    where: { item: { eventId: item.eventId } },
    select: { itemId: true, dependsOnId: true },
  });
  const children = new Map<string, string[]>();
  for (const edge of edges) {
    const list = children.get(edge.dependsOnId) ?? [];
    list.push(edge.itemId);
    children.set(edge.dependsOnId, list);
  }
  const out: string[] = [];
  const queue = [...(children.get(itemId) ?? [])];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);
    out.push(current);
    for (const child of children.get(current) ?? []) queue.push(child);
  }
  return out;
}

export interface RunOfShow {
  items: {
    id: string;
    dayId: string | null;
    title: string;
    startsAt: Date;
    durationMin: number;
    status: string;
    lateByMin: number;
    ownerUserId: string | null;
    ownerOrgId: string | null;
    ownerName: string | null;
    sortOrder: number;
  }[];
  dependencies: { itemId: string; dependsOnId: string }[];
  checkins: { id: string; bookingId: string; userName: string; orgName: string | null; at: Date }[];
}

/** Day timeline payload (P12-T03/T04): items in time order with resolved
 * owner names, dependency links, and today's vendor arrivals. */
export async function runOfShow(actor: UserActor, eventId: string): Promise<RunOfShow> {
  await requireEventAccess(actor, eventId, 'event.view');
  const [items, deps, checkins] = await Promise.all([
    prisma.runItem.findMany({
      where: { eventId },
      orderBy: [{ startsAt: 'asc' }, { sortOrder: 'asc' }],
    }),
    prisma.runDependency.findMany({
      where: { item: { eventId } },
      select: { itemId: true, dependsOnId: true },
    }),
    prisma.vendorCheckIn.findMany({
      where: { eventId },
      orderBy: { at: 'desc' },
      take: 100,
    }),
  ]);
  const userIds = [...new Set(items.map((row) => row.ownerUserId).filter((id): id is string => id !== null))];
  const orgIds = [...new Set(items.map((row) => row.ownerOrgId).filter((id): id is string => id !== null))];
  const [users, orgs, checkinUsers, bookings] = await Promise.all([
    userIds.length > 0
      ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    orgIds.length > 0
      ? prisma.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    checkins.length > 0
      ? prisma.user.findMany({
          where: { id: { in: [...new Set(checkins.map((row) => row.userId))] } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    checkins.length > 0
      ? prisma.booking.findMany({
          where: { id: { in: [...new Set(checkins.map((row) => row.bookingId))] } },
          select: { id: true, vendorOrgId: true },
        })
      : Promise.resolve([]),
  ]);
  const userNames = new Map(users.map((row) => [row.id, row.name]));
  const orgNames = new Map(orgs.map((row) => [row.id, row.name]));
  const checkinUserNames = new Map(checkinUsers.map((row) => [row.id, row.name]));
  const bookingOrgs = new Map(bookings.map((row) => [row.id, row.vendorOrgId]));
  const vendorOrgIds = [...new Set([...bookingOrgs.values()].filter((id): id is string => id !== null))];
  const vendorOrgs =
    vendorOrgIds.length > 0
      ? await prisma.organization.findMany({ where: { id: { in: vendorOrgIds } }, select: { id: true, name: true } })
      : [];
  const vendorOrgNames = new Map(vendorOrgs.map((row) => [row.id, row.name]));
  return {
    items: items.map((row) => ({
      id: row.id,
      dayId: row.dayId,
      title: row.title,
      startsAt: row.startsAt,
      durationMin: row.durationMin,
      status: row.status,
      lateByMin: row.lateByMin,
      ownerUserId: row.ownerUserId,
      ownerOrgId: row.ownerOrgId,
      ownerName:
        (row.ownerUserId ? userNames.get(row.ownerUserId) : undefined) ??
        (row.ownerOrgId ? orgNames.get(row.ownerOrgId) : undefined) ??
        null,
      sortOrder: row.sortOrder,
    })),
    dependencies: deps,
    checkins: checkins.map((row) => ({
      id: row.id,
      bookingId: row.bookingId,
      userName: checkinUserNames.get(row.userId) ?? '?',
      orgName: vendorOrgNames.get(bookingOrgs.get(row.bookingId) ?? '') ?? null,
      at: row.at,
    })),
  };
}
