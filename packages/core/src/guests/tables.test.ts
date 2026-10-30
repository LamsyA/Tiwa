import { prisma } from '@tiwa/db';
import { afterAll, describe, expect, it } from 'vitest';
import { createEventDraft } from '../events/commands.js';
import { addGuests } from './guests.js';
import { assignTables, createTable, deleteTable, listTables, updateTable } from './tables.js';

const users: string[] = [];
const events: string[] = [];

async function makeHost() {
  const user = await prisma.user.create({ data: { name: 'Host', countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user' as const, userId: user.id, isAdmin: false };
}

afterAll(async () => {
  await prisma.guest.deleteMany({ where: { eventId: { in: events } } });
  await prisma.seatingTable.deleteMany({ where: { eventId: { in: events } } });
  await prisma.eventParticipant.deleteMany({ where: { eventId: { in: events } } });
  await prisma.auditLog.deleteMany({ where: { targetId: { in: events } } });
  await prisma.event.deleteMany({ where: { id: { in: events } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

describe('tables', () => {
  it('creates, renames, seats, over-seats and deletes tables', async () => {
    const host = await makeHost();
    const { eventId } = await createEventDraft(host, { type: 'birthday' });
    events.push(eventId);
    const { tableId } = await createTable(host, { eventId, name: 'Table 1', capacity: 1 });
    await updateTable(host, { eventId, tableId, name: 'Head Table' });

    const added = await addGuests(host, {
      eventId,
      guests: [
        { name: 'Ada', groupIds: [] },
        { name: 'Bob', groupIds: [] },
      ],
    });
    // Capacity is advisory: seating two at a table of one succeeds.
    const assigned = await assignTables(host, {
      eventId,
      assignments: added.created.map((guestId) => ({ guestId, tableId })),
    });
    expect(assigned).toEqual({ assigned: 2 });
    expect(await listTables(host, eventId)).toEqual([{ id: tableId, name: 'Head Table', capacity: 1, assigned: 2 }]);

    await expect(
      assignTables(host, {
        eventId,
        assignments: [{ guestId: added.created[0] as string, tableId: '00000000-0000-0000-0000-000000000000' }],
      }),
    ).rejects.toThrow();
    await deleteTable(host, { eventId, tableId });
    expect(await listTables(host, eventId)).toEqual([]);
    const guests = await prisma.guest.findMany({ where: { eventId }, select: { tableId: true } });
    expect(guests.every((guest) => guest.tableId === null)).toBe(true);
  });
});
