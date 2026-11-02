import { prisma } from '@tiwa/db';
import { z } from 'zod';
import { authorize, type Actor } from '../auth/authorize.js';
import { loadEventAccess, requireEventAccess } from '../events/access.js';
import { userIdSchema } from '../shared/schemas.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../shared/errors.js';
import { uuidv7 } from '../shared/ids.js';
import { audit, enqueue } from '../shared/outbox.js';

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
  isPublic: z.boolean().optional(),
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
        isPublic: input.isPublic ?? false,
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
  isPublic: z.boolean().optional(),
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
        ...(input.isPublic !== undefined ? { isPublic: input.isPublic } : {}),
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
          // The programme is the public agenda already, so its items stay public.
          isPublic: item.isPublic,
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

export const vendorCheckInSchema = z.object({
  bookingId: z.string().uuid(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

/** One-tap vendor arrival (P12-T04, DAY-03): the vendor's own team taps when
 * they reach the venue. Editors may record it too. The web action fans out
 * on the day channel so it lands on the planner's screen (UF-24-3). */
export async function vendorCheckIn(actor: UserActor, raw: z.input<typeof vendorCheckInSchema>) {
  const input = vendorCheckInSchema.parse(raw);
  const booking = await prisma.booking.findUnique({
    where: { id: input.bookingId },
    select: { id: true, eventId: true, vendorOrgId: true, status: true },
  });
  if (!booking || booking.status === 'CANCELLED') throw new NotFoundError('Booking not found');
  const [access, membership, participantOrgIds] = await Promise.all([
    loadEventAccess(actor.userId, booking.eventId),
    prisma.membership.findFirst({
      where: { userId: actor.userId, orgId: booking.vendorOrgId },
      select: { role: true },
    }),
    prisma.eventParticipant.findMany({
      where: { eventId: booking.eventId, userId: actor.userId, removedAt: null, orgId: { not: null } },
      select: { orgId: true },
    }),
  ]);
  // Editors pass the matrix; the vendor's own team passes on org membership
  // or a participant row carrying the vendor org (same pattern as
  // listVendorBookingMoney — quote-accepted vendors are not necessarily
  // event participants).
  let allowed = !!membership || participantOrgIds.some((row) => row.orgId === booking.vendorOrgId);
  if (access) {
    try {
      authorize(actor, 'runofshow.edit', { eventId: booking.eventId, access });
      allowed = true;
    } catch {
      // fall through to the team check
    }
  }
  if (!allowed) throw new ForbiddenError('Only the vendor team checks in arrivals');
  const row = await prisma.vendorCheckIn.create({
    data: {
      id: uuidv7(),
      eventId: booking.eventId,
      bookingId: booking.id,
      userId: actor.userId,
      ...(input.lat !== undefined ? { lat: input.lat } : {}),
      ...(input.lng !== undefined ? { lng: input.lng } : {}),
    },
    select: { id: true, at: true },
  });
  await prisma.$transaction(async (tx) => {
    await audit(tx, {
      actor,
      action: 'day.vendor.checkin',
      targetType: 'Booking',
      targetId: booking.id,
      data: { eventId: booking.eventId },
    });
  });
  return { checkinId: row.id, eventId: booking.eventId, at: row.at };
}

export interface VendorDayTasks {
  bookings: {
    bookingId: string;
    eventId: string;
    eventName: string;
    startsAt: Date | null;
    status: string;
    arrivedAt: Date | null;
    items: { id: string; title: string; startsAt: Date; durationMin: number; status: string }[];
  }[];
}

/** Everything one vendor org has on today-and-beyond (P12-T04): their
 * bookings with arrival state plus the run items assigned to them. */
export async function vendorDayTasks(actor: UserActor, vendorOrgId: string): Promise<VendorDayTasks> {
  const [membership, teamRow] = await Promise.all([
    prisma.membership.findFirst({
      where: { userId: actor.userId, orgId: vendorOrgId },
      select: { role: true },
    }),
    prisma.eventParticipant.findFirst({
      where: { userId: actor.userId, orgId: vendorOrgId, removedAt: null },
      select: { id: true },
    }),
  ]);
  if (!membership && !teamRow) throw new ForbiddenError('Only the vendor team views these tasks');
  const bookings = await prisma.booking.findMany({
    where: { vendorOrgId, status: { not: 'CANCELLED' } },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      eventId: true,
      status: true,
      event: { select: { name: true, startsAt: true } },
    },
  });
  const eventIds = [...new Set(bookings.map((row) => row.eventId))];
  const [items, checkins] = await Promise.all([
    eventIds.length > 0
      ? prisma.runItem.findMany({
          where: { eventId: { in: eventIds }, ownerOrgId: vendorOrgId },
          orderBy: [{ startsAt: 'asc' }, { sortOrder: 'asc' }],
          select: { id: true, eventId: true, title: true, startsAt: true, durationMin: true, status: true },
        })
      : Promise.resolve([]),
    bookings.length > 0
      ? prisma.vendorCheckIn.findMany({
          where: { bookingId: { in: bookings.map((row) => row.id) } },
          orderBy: { at: 'desc' },
          select: { bookingId: true, at: true },
        })
      : Promise.resolve([]),
  ]);
  const firstArrival = new Map<string, Date>();
  for (const row of [...checkins].reverse()) firstArrival.set(row.bookingId, row.at);
  const itemsByEvent = new Map<string, typeof items>();
  for (const row of items) {
    const list = itemsByEvent.get(row.eventId) ?? [];
    list.push(row);
    itemsByEvent.set(row.eventId, list);
  }
  return {
    bookings: bookings.map((row) => ({
      bookingId: row.id,
      eventId: row.eventId,
      eventName: row.event.name,
      startsAt: row.event.startsAt,
      status: row.status,
      arrivedAt: firstArrival.get(row.id) ?? null,
      items: (itemsByEvent.get(row.eventId) ?? []).map(({ eventId: _eventId, ...item }) => item),
    })),
  };
}

const SEVERITY = z.enum(['low', 'normal', 'high']);

export const logIncidentSchema = z.object({
  eventId: z.string().uuid(),
  title: z.string().trim().min(1, 'titleRequired').max(200, 'titleTooLong'),
  details: z.string().trim().max(2000, 'notesTooLong').optional(),
  severity: SEVERITY.optional(),
  ownerUserId: userIdSchema.nullable().optional(),
});

/** Log a day-of incident (P12-T05, DAY-04). High severity also pages the
 * owner through the `day.incident_raised` outbox stub (P13 `notify()`). */
export async function logIncident(actor: UserActor, raw: z.input<typeof logIncidentSchema>) {
  const input = logIncidentSchema.parse(raw);
  await requireEventAccess(actor, input.eventId, 'runofshow.edit');
  await checkOwner(input.eventId, input.ownerUserId, null);
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.incident.create({
      data: {
        id: uuidv7(),
        eventId: input.eventId,
        title: input.title,
        details: input.details || null,
        severity: input.severity ?? 'normal',
        ownerUserId: input.ownerUserId ?? null,
      },
      select: { id: true },
    });
    if ((input.severity ?? 'normal') === 'high') {
      await enqueue(tx, 'day.incident_raised', {
        eventId: input.eventId,
        incidentId: created.id,
        ownerUserIds: input.ownerUserId ? [input.ownerUserId] : [],
      });
    }
    await audit(tx, {
      actor,
      action: 'day.incident.log',
      targetType: 'Incident',
      targetId: created.id,
      data: { eventId: input.eventId, severity: input.severity ?? 'normal' },
    });
    return created;
  });
  return { incidentId: row.id };
}

export const resolveIncidentSchema = z.object({
  eventId: z.string().uuid(),
  incidentId: z.string().uuid(),
  resolution: z.string().trim().max(2000, 'notesTooLong').optional(),
});

export async function resolveIncident(actor: UserActor, raw: z.input<typeof resolveIncidentSchema>) {
  const input = resolveIncidentSchema.parse(raw);
  await requireEventAccess(actor, input.eventId, 'runofshow.edit');
  const incident = await prisma.incident.findFirst({ where: { id: input.incidentId, eventId: input.eventId } });
  if (!incident) throw new NotFoundError('Incident not found');
  await prisma.$transaction(async (tx) => {
    await tx.incident.update({
      where: { id: incident.id },
      data: { resolvedAt: new Date(), resolution: input.resolution || null },
    });
    await audit(tx, {
      actor,
      action: 'day.incident.resolve',
      targetType: 'Incident',
      targetId: incident.id,
      data: { eventId: input.eventId },
    });
  });
  return { incidentId: incident.id };
}

export interface DayIncidents {
  incidents: {
    id: string;
    title: string;
    details: string | null;
    severity: string;
    ownerUserId: string | null;
    ownerName: string | null;
    resolvedAt: Date | null;
    resolution: string | null;
    createdAt: Date;
  }[];
}

export async function dayIncidents(actor: UserActor, eventId: string): Promise<DayIncidents> {
  await requireEventAccess(actor, eventId, 'event.view');
  const rows = await prisma.incident.findMany({
    where: { eventId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  const ownerIds = [...new Set(rows.map((row) => row.ownerUserId).filter((id): id is string => id !== null))];
  const owners =
    ownerIds.length > 0
      ? await prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true } })
      : [];
  const names = new Map(owners.map((row) => [row.id, row.name]));
  return {
    incidents: rows.map((row) => ({ ...row, ownerName: row.ownerUserId ? (names.get(row.ownerUserId) ?? '?') : null })),
  };
}

export const createContactSchema = z.object({
  eventId: z.string().uuid(),
  name: z.string().trim().min(1, 'titleRequired').max(200, 'titleTooLong'),
  role: z.string().trim().min(1, 'titleRequired').max(200, 'titleTooLong'),
  phone: z.string().trim().min(5).max(30),
  isBackupVendor: z.boolean().optional(),
});

export async function createContact(actor: UserActor, raw: z.input<typeof createContactSchema>) {
  const input = createContactSchema.parse(raw);
  await requireEventAccess(actor, input.eventId, 'runofshow.edit');
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.emergencyContact.create({
      data: {
        id: uuidv7(),
        eventId: input.eventId,
        name: input.name,
        role: input.role,
        phone: input.phone,
        isBackupVendor: input.isBackupVendor ?? false,
      },
      select: { id: true },
    });
    await audit(tx, {
      actor,
      action: 'day.contact.create',
      targetType: 'EmergencyContact',
      targetId: created.id,
      data: { eventId: input.eventId, name: input.name },
    });
    return created;
  });
  return { contactId: row.id };
}

export const deleteContactSchema = z.object({ eventId: z.string().uuid(), contactId: z.string().uuid() });

export async function deleteContact(actor: UserActor, raw: z.input<typeof deleteContactSchema>) {
  const input = deleteContactSchema.parse(raw);
  await requireEventAccess(actor, input.eventId, 'runofshow.edit');
  const contact = await prisma.emergencyContact.findFirst({
    where: { id: input.contactId, eventId: input.eventId },
  });
  if (!contact) throw new NotFoundError('Contact not found');
  await prisma.$transaction(async (tx) => {
    await tx.emergencyContact.delete({ where: { id: contact.id } });
    await audit(tx, {
      actor,
      action: 'day.contact.delete',
      targetType: 'EmergencyContact',
      targetId: contact.id,
      data: { eventId: input.eventId, name: contact.name },
    });
  });
  return { ok: true as const };
}

export interface DayContacts {
  contacts: {
    id: string;
    name: string;
    role: string;
    phone: string;
    isBackupVendor: boolean;
  }[];
  onsiteVendors: { orgId: string; name: string }[];
}

/** Emergency contacts + backup vendors (P12-T05, DAY-05), plus the
 * on-site vendors derived from live bookings. */
export async function dayContacts(actor: UserActor, eventId: string): Promise<DayContacts> {
  await requireEventAccess(actor, eventId, 'event.view');
  const [contacts, bookings] = await Promise.all([
    prisma.emergencyContact.findMany({ where: { eventId }, orderBy: { name: 'asc' } }),
    prisma.booking.findMany({
      where: { eventId, status: { not: 'CANCELLED' } },
      select: { vendorOrgId: true },
    }),
  ]);
  const orgIds = [...new Set(bookings.map((row) => row.vendorOrgId))];
  const orgs =
    orgIds.length > 0
      ? await prisma.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } })
      : [];
  return {
    contacts: contacts.map((row) => ({
      id: row.id,
      name: row.name,
      role: row.role,
      phone: row.phone,
      isBackupVendor: row.isBackupVendor,
    })),
    onsiteVendors: orgs.map((row) => ({ orgId: row.id, name: row.name })),
  };
}

export const markLateSchema = z.object({
  eventId: z.string().uuid(),
  itemId: z.string().uuid(),
  lateByMin: z.number().int().min(1).max(1440),
});

/** Mark an item late (P12-T03, DAY-02): status LATE with the delay, and the
 * transitive dependants come back for highlighting. Owner alerting rides the
 * outbox stub `day.item_late` — P13 `notify()` delivers it (push/SMS). */
export async function markLate(actor: UserActor, raw: z.input<typeof markLateSchema>) {
  const input = markLateSchema.parse(raw);
  await requireEventAccess(actor, input.eventId, 'runofshow.edit');
  const item = await prisma.runItem.findFirst({ where: { id: input.itemId, eventId: input.eventId } });
  if (!item) throw new NotFoundError('Run item not found');
  const dependantIds = await dependants(item.id);
  const dependantItems =
    dependantIds.length > 0
      ? await prisma.runItem.findMany({
          where: { id: { in: dependantIds } },
          select: { ownerUserId: true, ownerOrgId: true },
        })
      : [];
  const ownerUserIds = [
    ...new Set(dependantItems.map((row) => row.ownerUserId).filter((id): id is string => id !== null)),
  ];
  const ownerOrgIds = [
    ...new Set(dependantItems.map((row) => row.ownerOrgId).filter((id): id is string => id !== null)),
  ];
  await prisma.$transaction(async (tx) => {
    await tx.runItem.update({ where: { id: item.id }, data: { status: 'LATE', lateByMin: input.lateByMin } });
    await enqueue(tx, 'day.item_late', {
      eventId: input.eventId,
      itemId: item.id,
      lateByMin: input.lateByMin,
      dependantIds,
      ownerUserIds,
      ownerOrgIds,
    });
    await audit(tx, {
      actor,
      action: 'day.item.late',
      targetType: 'RunItem',
      targetId: item.id,
      data: { eventId: input.eventId, lateByMin: input.lateByMin, dependants: dependantIds.length },
    });
  });
  return { itemId: item.id, lateByMin: input.lateByMin, dependantIds };
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
    isPublic: boolean;
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
      isPublic: row.isPublic,
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
