import { prisma } from '@tiwa/db';
import { z } from 'zod';
import type { Actor, EventAccess } from '../auth/authorize.js';
import { resolveEventAccess } from '../events/access.js';
import { ValidationError } from '../shared/errors.js';
import { audit } from '../shared/outbox.js';

type UserActor = Extract<Actor, { kind: 'user' }>;

// Simple seating (GST-19): named tables with capacity; guests assigned from
// a list (no drag-and-drop in the MVP). Capacity is advisory — hosts can
// over-seat, and the headcount report flags it.

export const createTableSchema = z.object({
  eventId: z.string().uuid(),
  name: z.string().trim().min(1).max(60),
  capacity: z.number().int().min(1).max(500),
});

export async function createTable(
  actor: UserActor,
  input: z.infer<typeof createTableSchema>,
  preloaded?: EventAccess,
): Promise<{ tableId: string }> {
  await resolveEventAccess(actor, input.eventId, 'guests.manage', preloaded);
  const table = await prisma.$transaction(async (tx) => {
    const created = await tx.seatingTable.create({
      data: { eventId: input.eventId, name: input.name, capacity: input.capacity },
    });
    await audit(tx, {
      actor,
      action: 'guests.createTable',
      targetType: 'SeatingTable',
      targetId: created.id,
      data: {},
    });
    return created;
  });
  return { tableId: table.id };
}

export const updateTableSchema = z.object({
  eventId: z.string().uuid(),
  tableId: z.string().uuid(),
  name: z.string().trim().min(1).max(60).optional(),
  capacity: z.number().int().min(1).max(500).optional(),
});

export async function updateTable(
  actor: UserActor,
  input: z.infer<typeof updateTableSchema>,
  preloaded?: EventAccess,
): Promise<void> {
  await resolveEventAccess(actor, input.eventId, 'guests.manage', preloaded);
  const table = await prisma.seatingTable.findFirst({
    where: { id: input.tableId, eventId: input.eventId },
    select: { id: true },
  });
  if (!table) throw new ValidationError('Table not found', { field: 'tableId', key: 'tableNotFound' });
  await prisma.seatingTable.update({
    where: { id: input.tableId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
    },
  });
}

export const deleteTableSchema = z.object({ eventId: z.string().uuid(), tableId: z.string().uuid() });

/** Delete a table; seated guests become unassigned (they stay on the list). */
export async function deleteTable(
  actor: UserActor,
  input: z.infer<typeof deleteTableSchema>,
  preloaded?: EventAccess,
): Promise<void> {
  await resolveEventAccess(actor, input.eventId, 'guests.manage', preloaded);
  const table = await prisma.seatingTable.findFirst({
    where: { id: input.tableId, eventId: input.eventId },
    select: { id: true },
  });
  if (!table) throw new ValidationError('Table not found', { field: 'tableId', key: 'tableNotFound' });
  await prisma.$transaction(async (tx) => {
    await tx.seatingTable.delete({ where: { id: input.tableId } });
    await tx.guest.updateMany({ where: { eventId: input.eventId, tableId: input.tableId }, data: { tableId: null } });
    await audit(tx, {
      actor,
      action: 'guests.deleteTable',
      targetType: 'SeatingTable',
      targetId: input.tableId,
      data: {},
    });
  });
}

export async function listTables(
  actor: UserActor,
  eventId: string,
  preloaded?: EventAccess,
): Promise<{ id: string; name: string; capacity: number; assigned: number }[]> {
  await resolveEventAccess(actor, eventId, 'event.view', preloaded);
  const tables = await prisma.seatingTable.findMany({ where: { eventId }, orderBy: { name: 'asc' } });
  if (tables.length === 0) return [];
  const counts = await prisma.guest.groupBy({
    by: ['tableId'],
    where: { eventId, deletedAt: null, tableId: { not: null } },
    _count: { _all: true },
  });
  return tables.map((table) => ({
    id: table.id,
    name: table.name,
    capacity: table.capacity,
    assigned: counts.find((row) => row.tableId === table.id)?._count._all ?? 0,
  }));
}

export const assignTablesSchema = z.object({
  eventId: z.string().uuid(),
  assignments: z
    .array(z.object({ guestId: z.string().uuid(), tableId: z.string().uuid().nullable() }))
    .min(1)
    .max(500),
});

/** Bulk seat/unseat. Capacity is advisory: over-seating succeeds and is flagged in the report. */
export async function assignTables(
  actor: UserActor,
  input: z.infer<typeof assignTablesSchema>,
  preloaded?: EventAccess,
): Promise<{ assigned: number }> {
  await resolveEventAccess(actor, input.eventId, 'guests.manage', preloaded);
  const tableIds = [...new Set(input.assignments.map((row) => row.tableId).filter((id): id is string => id !== null))];
  if (tableIds.length > 0) {
    const count = await prisma.seatingTable.count({ where: { eventId: input.eventId, id: { in: tableIds } } });
    if (count !== tableIds.length)
      throw new ValidationError('Table not found', { field: 'tableId', key: 'tableNotFound' });
  }
  const result = await prisma.$transaction(async (tx) => {
    let assigned = 0;
    for (const row of input.assignments) {
      const updated = await tx.guest.updateMany({
        where: { id: row.guestId, eventId: input.eventId, deletedAt: null },
        data: { tableId: row.tableId },
      });
      assigned += updated.count;
    }
    await audit(tx, {
      actor,
      action: 'guests.assignTables',
      targetType: 'Event',
      targetId: input.eventId,
      data: { count: assigned },
    });
    return { assigned };
  });
  return result;
}
