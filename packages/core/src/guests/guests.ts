import { prisma } from '@tiwa/db';
import { z } from 'zod';
import { authorize, type Actor, type EventAccess } from '../auth/authorize.js';
import { resolveEventAccess } from '../events/access.js';
import { normaliseEmail, toE164 } from '../shared/contact.js';
import { ForbiddenError, ValidationError } from '../shared/errors.js';
import { audit, enqueue } from '../shared/outbox.js';
import { csvMappingSchema } from './csv.js';

type UserActor = Extract<Actor, { kind: 'user' }>;

export const MAX_GUESTS_PER_CALL = 500;

const guestInputSchema = z.object({
  name: z.string().trim().max(120),
  phone: z.string().trim().max(32).optional(),
  email: z.string().trim().max(254).optional(),
  groupIds: z.array(z.string()).max(20).default([]),
  plusOnesAllowed: z.number().int().min(0).max(20).optional(),
  meal: z.string().trim().max(60).optional(),
  dietary: z.string().trim().max(280).optional(),
});

export const addGuestsSchema = z.object({
  eventId: z.string().uuid(),
  guests: z.array(guestInputSchema).min(1).max(MAX_GUESTS_PER_CALL),
  source: z.enum(['MANUAL', 'PASTE', 'CSV', 'CONTACTS']).optional(),
});

export interface AddGuestsWarning {
  index: number;
  field: 'name' | 'phone' | 'email';
  key: string;
}

async function eventCountry(eventId: string): Promise<string> {
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { countryCode: true } });
  return event.countryCode;
}

async function assertGroupsBelong(eventId: string, groupIds: string[]): Promise<void> {
  if (groupIds.length === 0) return;
  const count = await prisma.guestGroup.count({ where: { eventId, id: { in: [...new Set(groupIds)] } } });
  if (count !== new Set(groupIds).size)
    throw new ValidationError('Unknown group', { field: 'groupIds', key: 'unknownGroup' });
}

/**
 * Add guests (UF-06). Phones normalise to E.164; invalid contacts become
 * warnings (the row still imports without them). Empty names fall back to
 * the contact, so pasted lines never silently drop (UF-06-1).
 */
export async function addGuests(
  actor: UserActor,
  input: z.infer<typeof addGuestsSchema>,
  preloaded?: EventAccess,
): Promise<{
  created: string[];
  warnings: AddGuestsWarning[];
  duplicates: { id: string; name: string; phone: string | null; email: string | null }[];
}> {
  await resolveEventAccess(actor, input.eventId, 'guests.manage', preloaded);
  const source = input.source ?? 'MANUAL';
  const country = await eventCountry(input.eventId);
  await assertGroupsBelong(
    input.eventId,
    input.guests.flatMap((guest) => guest.groupIds),
  );
  const warnings: AddGuestsWarning[] = [];
  const rows = input.guests.map((guest, index) => {
    let phone: string | null = null;
    if (guest.phone) {
      try {
        phone = toE164(guest.phone, country);
      } catch {
        warnings.push({ index, field: 'phone', key: 'invalidPhone' });
      }
    }
    let email: string | null = null;
    if (guest.email) {
      try {
        email = normaliseEmail(guest.email);
      } catch {
        warnings.push({ index, field: 'email', key: 'invalidEmail' });
      }
    }
    const name = guest.name || phone || email || `Guest ${index + 1}`;
    if (!guest.name) warnings.push({ index, field: 'name', key: 'nameFromContact' });
    return {
      eventId: input.eventId,
      name,
      phone,
      email,
      groupIds: guest.groupIds,
      source,
      ...(guest.plusOnesAllowed !== undefined ? { plusOnesAllowed: guest.plusOnesAllowed } : {}),
      ...(guest.meal ? { meal: guest.meal } : {}),
      ...(guest.dietary ? { dietary: guest.dietary } : {}),
    };
  });
  const created = await prisma.$transaction(async (tx) => {
    const guests = await Promise.all(rows.map((row) => tx.guest.create({ data: row, select: { id: true } })));
    await audit(tx, {
      actor,
      action: 'guests.addGuests',
      targetType: 'Event',
      targetId: input.eventId,
      data: { count: guests.length, source },
    });
    return guests.map((guest) => guest.id);
  });
  // Duplicate phones/emails elsewhere on the list → merge prompt (UF-06 edge).
  const phones = [...new Set(rows.map((row) => row.phone).filter((phone): phone is string => Boolean(phone)))];
  const emails = [...new Set(rows.map((row) => row.email).filter((email): email is string => Boolean(email)))];
  const duplicates =
    phones.length + emails.length === 0
      ? []
      : await prisma.guest.findMany({
          where: {
            eventId: input.eventId,
            deletedAt: null,
            id: { notIn: created },
            OR: [
              ...phones.map((phone) => ({ phone })),
              ...emails.map((email) => ({ email: { equals: email, mode: 'insensitive' as const } })),
            ],
          },
          select: { id: true, name: true, phone: true, email: true },
          take: 10,
        });
  return { created, warnings, duplicates };
}

export const updateGuestSchema = z.object({
  eventId: z.string().uuid(),
  guestId: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  email: z.string().trim().max(254).nullable().optional(),
  groupIds: z.array(z.string()).max(20).optional(),
  plusOnesAllowed: z.number().int().min(0).max(20).optional(),
  meal: z.string().trim().max(60).nullable().optional(),
  dietary: z.string().trim().max(280).nullable().optional(),
});

/** Single-guest edit: strict validation (unlike bulk add, which warns). */
export async function updateGuest(
  actor: UserActor,
  input: z.infer<typeof updateGuestSchema>,
  preloaded?: EventAccess,
): Promise<void> {
  await resolveEventAccess(actor, input.eventId, 'guests.manage', preloaded);
  const guest = await prisma.guest.findFirst({
    where: { id: input.guestId, eventId: input.eventId, deletedAt: null },
    select: { id: true },
  });
  if (!guest) throw new ValidationError('Guest not found', { field: 'guestId', key: 'guestNotFound' });
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.groupIds !== undefined) {
    await assertGroupsBelong(input.eventId, input.groupIds);
    data.groupIds = input.groupIds;
  }
  if (input.phone !== undefined) {
    data.phone =
      input.phone === null || input.phone === '' ? null : toE164(input.phone, await eventCountry(input.eventId));
  }
  if (input.email !== undefined) {
    data.email = input.email === null || input.email === '' ? null : normaliseEmail(input.email);
  }
  if (input.plusOnesAllowed !== undefined) data.plusOnesAllowed = input.plusOnesAllowed;
  if (input.meal !== undefined) data.meal = input.meal === '' ? null : input.meal;
  if (input.dietary !== undefined) data.dietary = input.dietary === '' ? null : input.dietary;
  await prisma.$transaction(async (tx) => {
    await tx.guest.update({ where: { id: input.guestId }, data });
    await audit(tx, { actor, action: 'guests.updateGuest', targetType: 'Guest', targetId: input.guestId, data: {} });
  });
}

export const deleteGuestsSchema = z.object({
  eventId: z.string().uuid(),
  guestIds: z.array(z.string().uuid()).min(1).max(MAX_GUESTS_PER_CALL),
});

/** Soft delete (deliveries stay for history; P4-T06+ invite flows skip deleted). */
export async function deleteGuests(
  actor: UserActor,
  input: z.infer<typeof deleteGuestsSchema>,
  preloaded?: EventAccess,
): Promise<{ deleted: number }> {
  await resolveEventAccess(actor, input.eventId, 'guests.manage', preloaded);
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.guest.updateMany({
      where: { eventId: input.eventId, id: { in: input.guestIds }, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    await audit(tx, {
      actor,
      action: 'guests.deleteGuests',
      targetType: 'Event',
      targetId: input.eventId,
      data: { count: updated.count },
    });
    return updated;
  });
  return { deleted: result.count };
}

export const mergeGuestsSchema = z.object({
  eventId: z.string().uuid(),
  keepId: z.string().uuid(),
  dropIds: z.array(z.string().uuid()).min(1).max(10),
});

/** UF-06 edge: fold duplicate contacts into one guest. Groups union; empty fields fill from dropped rows; deliveries move. */
export async function mergeGuests(
  actor: UserActor,
  input: z.infer<typeof mergeGuestsSchema>,
  preloaded?: EventAccess,
): Promise<void> {
  await resolveEventAccess(actor, input.eventId, 'guests.manage', preloaded);
  if (input.dropIds.includes(input.keepId))
    throw new ValidationError('Cannot merge a guest into itself', { key: 'mergeSelf' });
  const rows = await prisma.guest.findMany({
    where: { eventId: input.eventId, id: { in: [input.keepId, ...input.dropIds] }, deletedAt: null },
  });
  const keep = rows.find((row) => row.id === input.keepId);
  if (!keep || rows.length !== input.dropIds.length + 1) {
    throw new ValidationError('Guest not found', { field: 'guestId', key: 'guestNotFound' });
  }
  const dropped = rows.filter((row) => row.id !== input.keepId);
  const groupIds = [...new Set([...keep.groupIds, ...dropped.flatMap((row) => row.groupIds)])];
  await prisma.$transaction(async (tx) => {
    await tx.guest.update({
      where: { id: input.keepId },
      data: {
        groupIds,
        phone: keep.phone ?? dropped.find((row) => row.phone)?.phone ?? null,
        email: keep.email ?? dropped.find((row) => row.email)?.email ?? null,
        meal: keep.meal ?? dropped.find((row) => row.meal)?.meal ?? null,
        dietary: keep.dietary ?? dropped.find((row) => row.dietary)?.dietary ?? null,
        plusOnesAllowed: Math.max(keep.plusOnesAllowed, ...dropped.map((row) => row.plusOnesAllowed)),
      },
    });
    await tx.inviteDelivery.updateMany({ where: { guestId: { in: input.dropIds } }, data: { guestId: input.keepId } });
    await tx.guest.updateMany({ where: { id: { in: input.dropIds } }, data: { deletedAt: new Date() } });
    await audit(tx, {
      actor,
      action: 'guests.mergeGuests',
      targetType: 'Guest',
      targetId: input.keepId,
      data: { dropped: input.dropIds.length },
    });
  });
}

export const listGuestsSchema = z.object({
  eventId: z.string().uuid(),
  search: z.string().trim().max(120).optional(),
  groupId: z.string().uuid().optional(),
  rsvp: z.enum(['NONE', 'YES', 'NO', 'MAYBE']).optional(),
  checkedIn: z.boolean().optional(),
  take: z.number().int().min(1).max(500).optional(),
  cursor: z.string().uuid().optional(),
});

export interface GuestRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  groupIds: string[];
  rsvp: string;
  checkedIn: boolean;
  source: string;
}

/**
 * Guest list with contacts redacted unless `guests.contacts.view` (Backend
 * §4: enforced with data in P4). Members with guests:'view' see names and
 * RSVP; phones/emails come back null with `redacted: true`.
 */
export async function listGuests(
  actor: UserActor,
  input: z.infer<typeof listGuestsSchema>,
  preloaded?: EventAccess,
): Promise<{ guests: GuestRow[]; total: number; redacted: boolean; nextCursor: string | null }> {
  const access = await resolveEventAccess(actor, input.eventId, 'event.view', preloaded);
  let redacted = false;
  try {
    authorize(actor, 'guests.contacts.view', { eventId: input.eventId, access });
  } catch (error) {
    if (!(error instanceof ForbiddenError)) throw error;
    redacted = true;
  }
  const where = {
    eventId: input.eventId,
    deletedAt: null,
    ...(input.search
      ? {
          OR: [
            { name: { contains: input.search, mode: 'insensitive' as const } },
            { phone: { contains: input.search } },
            // Phones store as E.164 (+234803…) but hosts type national form (0803…).
            ...(input.search.startsWith('0') ? [{ phone: { contains: input.search.replace(/^0+/, '') } }] : []),
            { email: { contains: input.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
    ...(input.groupId ? { groupIds: { has: input.groupId } } : {}),
    ...(input.rsvp ? { rsvp: input.rsvp as 'NONE' | 'YES' | 'NO' | 'MAYBE' } : {}),
    ...(input.checkedIn !== undefined
      ? input.checkedIn
        ? { checkedInAt: { not: null } }
        : { checkedInAt: null }
      : {}),
  };
  const take = input.take ?? 200;
  const [rows, total] = await Promise.all([
    prisma.guest.findMany({
      where,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: take + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        groupIds: true,
        rsvp: true,
        checkedInAt: true,
        source: true,
      },
    }),
    prisma.guest.count({ where }),
  ]);
  const page = rows.slice(0, take);
  return {
    guests: page.map((row) => ({
      id: row.id,
      name: row.name,
      phone: redacted ? null : row.phone,
      email: redacted ? null : row.email,
      groupIds: row.groupIds,
      rsvp: row.rsvp,
      checkedIn: row.checkedInAt !== null,
      source: row.source,
    })),
    total,
    redacted,
    nextCursor: rows.length > take ? (page[page.length - 1]?.id ?? null) : null,
  };
}

export const createGroupSchema = z.object({
  eventId: z.string().uuid(),
  name: z.string().trim().min(1).max(60),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .default(null),
});

export async function createGroup(
  actor: UserActor,
  input: z.infer<typeof createGroupSchema>,
  preloaded?: EventAccess,
): Promise<{ groupId: string }> {
  await resolveEventAccess(actor, input.eventId, 'guests.manage', preloaded);
  const group = await prisma.$transaction(async (tx) => {
    const created = await tx.guestGroup.create({
      data: { eventId: input.eventId, name: input.name, color: input.color },
    });
    await audit(tx, { actor, action: 'guests.createGroup', targetType: 'GuestGroup', targetId: created.id, data: {} });
    return created;
  });
  return { groupId: group.id };
}

export const updateGroupSchema = z.object({
  eventId: z.string().uuid(),
  groupId: z.string().uuid(),
  name: z.string().trim().min(1).max(60).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
});

export async function updateGroup(
  actor: UserActor,
  input: z.infer<typeof updateGroupSchema>,
  preloaded?: EventAccess,
): Promise<void> {
  await resolveEventAccess(actor, input.eventId, 'guests.manage', preloaded);
  const group = await prisma.guestGroup.findFirst({
    where: { id: input.groupId, eventId: input.eventId },
    select: { id: true },
  });
  if (!group) throw new ValidationError('Group not found', { field: 'groupId', key: 'groupNotFound' });
  await prisma.guestGroup.update({
    where: { id: input.groupId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
    },
  });
}

export const deleteGroupSchema = z.object({ eventId: z.string().uuid(), groupId: z.string().uuid() });

/** Delete a group and strip it from every guest (guests stay). */
export async function deleteGroup(
  actor: UserActor,
  input: z.infer<typeof deleteGroupSchema>,
  preloaded?: EventAccess,
): Promise<void> {
  await resolveEventAccess(actor, input.eventId, 'guests.manage', preloaded);
  const group = await prisma.guestGroup.findFirst({
    where: { id: input.groupId, eventId: input.eventId },
    select: { id: true },
  });
  if (!group) throw new ValidationError('Group not found', { field: 'groupId', key: 'groupNotFound' });
  await prisma.$transaction(async (tx) => {
    await tx.guestGroup.delete({ where: { id: input.groupId } });
    const members = await tx.guest.findMany({
      where: { eventId: input.eventId, deletedAt: null, groupIds: { has: input.groupId } },
      select: { id: true, groupIds: true },
    });
    for (const member of members) {
      await tx.guest.update({
        where: { id: member.id },
        data: { groupIds: member.groupIds.filter((id) => id !== input.groupId) },
      });
    }
    await audit(tx, {
      actor,
      action: 'guests.deleteGroup',
      targetType: 'GuestGroup',
      targetId: input.groupId,
      data: {},
    });
  });
}

export async function listGroups(
  actor: UserActor,
  eventId: string,
  preloaded?: EventAccess,
): Promise<{ id: string; name: string; color: string | null; memberCount: number }[]> {
  await resolveEventAccess(actor, eventId, 'event.view', preloaded);
  const groups = await prisma.guestGroup.findMany({ where: { eventId }, orderBy: { name: 'asc' } });
  if (groups.length === 0) return [];
  const guests = await prisma.guest.findMany({ where: { eventId, deletedAt: null }, select: { groupIds: true } });
  const counts = new Map<string, number>();
  for (const guest of guests) for (const id of guest.groupIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    color: group.color,
    memberCount: counts.get(group.id) ?? 0,
  }));
}

export async function countGuests(
  actor: UserActor,
  eventId: string,
  preloaded?: EventAccess,
): Promise<{ total: number; yes: number; no: number; maybe: number; none: number; checkedIn: number }> {
  await resolveEventAccess(actor, eventId, 'event.view', preloaded);
  const [byRsvp, checkedIn, total] = await Promise.all([
    prisma.guest.groupBy({ by: ['rsvp'], where: { eventId, deletedAt: null }, _count: { _all: true } }),
    prisma.guest.count({ where: { eventId, deletedAt: null, checkedInAt: { not: null } } }),
    prisma.guest.count({ where: { eventId, deletedAt: null } }),
  ]);
  const count = (rsvp: string) => byRsvp.find((row) => row.rsvp === rsvp)?._count._all ?? 0;
  return { total, yes: count('YES'), no: count('NO'), maybe: count('MAYBE'), none: count('NONE'), checkedIn };
}

export const requestCsvImportSchema = z.object({
  eventId: z.string().uuid(),
  fileKey: z.string().min(1).max(300),
  mapping: csvMappingSchema,
  totalRows: z.number().int().min(1).max(5000),
});

export const importCsvUploadSchema = z.object({
  eventId: z.string().uuid(),
  sizeBytes: z
    .number()
    .int()
    .min(1)
    .max(5 * 1024 * 1024),
});

/** Enqueue the worker CSV import (the file was uploaded to private storage first). */
export async function requestCsvImport(
  actor: UserActor,
  input: z.infer<typeof requestCsvImportSchema>,
  preloaded?: EventAccess,
): Promise<{ queued: true }> {
  await resolveEventAccess(actor, input.eventId, 'guests.manage', preloaded);
  if (!input.fileKey.startsWith(`events/${input.eventId}/imports/`)) {
    throw new ValidationError('Invalid file', { field: 'fileKey', key: 'invalidFileKey' });
  }
  await prisma.$transaction(async (tx) => {
    await enqueue(tx, 'guests.import', {
      eventId: input.eventId,
      fileKey: input.fileKey,
      mapping: JSON.parse(JSON.stringify(input.mapping)) as { [key: string]: string | number | boolean | null },
      userId: actor.userId,
      totalRows: input.totalRows,
    });
    await audit(tx, {
      actor,
      action: 'guests.requestCsvImport',
      targetType: 'Event',
      targetId: input.eventId,
      data: { totalRows: input.totalRows },
    });
  });
  return { queued: true };
}
