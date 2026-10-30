import { prisma } from '@tiwa/db';
import { afterAll, describe, expect, it } from 'vitest';
import { addParticipant } from '../events/members.js';
import { createEventDraft } from '../events/commands.js';
import {
  addGuests,
  createGroup,
  deleteGroup,
  deleteGuests,
  listGroups,
  listGuests,
  mergeGuests,
  updateGroup,
  updateGuest,
} from './guests.js';

const users: string[] = [];
const events: string[] = [];

async function makeHost() {
  const user = await prisma.user.create({ data: { name: 'Host', countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user' as const, userId: user.id, isAdmin: false };
}

afterAll(async () => {
  await prisma.guest.deleteMany({ where: { eventId: { in: events } } });
  await prisma.guestGroup.deleteMany({ where: { eventId: { in: events } } });
  await prisma.eventParticipant.deleteMany({ where: { eventId: { in: events } } });
  await prisma.auditLog.deleteMany({ where: { targetId: { in: events } } });
  await prisma.event.deleteMany({ where: { id: { in: events } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

describe('guests', () => {
  it('adds guests with E.164 phones, warns on invalid contacts, never drops rows', async () => {
    const host = await makeHost();
    const { eventId } = await createEventDraft(host, { type: 'birthday' });
    events.push(eventId);
    const { groupId } = await createGroup(host, { eventId, name: 'Family', color: null });

    const result = await addGuests(host, {
      eventId,
      source: 'PASTE',
      guests: [
        { name: 'Ada', phone: '08031234567', email: 'ada@example.com', groupIds: [groupId] },
        { name: '', phone: '08039876543', groupIds: [] },
        { name: 'Bad', phone: '123', email: 'nope', groupIds: [] },
      ],
    });
    expect(result.created).toHaveLength(3);
    expect(result.warnings).toContainEqual({ index: 1, field: 'name', key: 'nameFromContact' });
    expect(result.warnings).toContainEqual({ index: 2, field: 'phone', key: 'invalidPhone' });
    expect(result.warnings).toContainEqual({ index: 2, field: 'email', key: 'invalidEmail' });

    const { guests } = await listGuests(host, { eventId });
    expect(guests.map((guest) => guest.phone).sort()).toEqual(['+2348031234567', '+2348039876543', null].sort());
    expect(guests.find((guest) => guest.phone === '+2348039876543')?.name).toBe('+2348039876543');
  });

  it('rejects unknown groups and enforces guests.manage', async () => {
    const host = await makeHost();
    const { eventId } = await createEventDraft(host, { type: 'birthday' });
    events.push(eventId);
    await expect(
      addGuests(host, { eventId, guests: [{ name: 'x', groupIds: ['00000000-0000-0000-0000-000000000000'] }] }),
    ).rejects.toThrow();

    const viewerPhone = `+2348030000${String(Math.floor(Math.random() * 900) + 100)}`;
    const invite = await addParticipant(host, { eventId, phone: viewerPhone, role: 'CO_HOST', preset: 'view_only' });
    users.push(invite.userId);
    const viewerActor = { kind: 'user' as const, userId: invite.userId, isAdmin: false };
    await expect(addGuests(viewerActor, { eventId, guests: [{ name: 'x', groupIds: [] }] })).rejects.toThrow(
      /Not allowed/,
    );
    // …but viewing the list is allowed, with contacts redacted.
    const listed = await listGuests(viewerActor, { eventId });
    expect(listed.redacted).toBe(true);
    expect(listed.guests.every((guest) => guest.phone === null && guest.email === null)).toBe(true);
  });

  it('updates, merges and deletes guests', async () => {
    const host = await makeHost();
    const { eventId } = await createEventDraft(host, { type: 'birthday' });
    events.push(eventId);
    const added = await addGuests(host, {
      eventId,
      guests: [
        { name: 'Ada', phone: '08031234567', groupIds: [] },
        { name: 'Adaeze', email: 'ada@example.com', groupIds: [] },
      ],
    });
    const [keep, drop] = added.created as [string, string];

    await updateGuest(host, { eventId, guestId: keep!, meal: 'Jollof', plusOnesAllowed: 2 });
    await mergeGuests(host, { eventId, keepId: keep!, dropIds: [drop!] });
    const { guests, total } = await listGuests(host, { eventId });
    expect(total).toBe(1);
    expect(guests[0]).toMatchObject({ phone: '+2348031234567', email: 'ada@example.com' });

    await expect(mergeGuests(host, { eventId, keepId: keep!, dropIds: [keep!] })).rejects.toThrow();
    const deleted = await deleteGuests(host, { eventId, guestIds: [keep!] });
    expect(deleted).toEqual({ deleted: 1 });
    expect((await listGuests(host, { eventId })).total).toBe(0);
  });

  it('manages groups and strips deleted groups from guests', async () => {
    const host = await makeHost();
    const { eventId } = await createEventDraft(host, { type: 'birthday' });
    events.push(eventId);
    const { groupId } = await createGroup(host, { eventId, name: 'VIP', color: '#b83a17' });
    await updateGroup(host, { eventId, groupId, name: 'VVIP' });
    await addGuests(host, { eventId, guests: [{ name: 'Ada', groupIds: [groupId] }] });
    expect(await listGroups(host, eventId)).toEqual([{ id: groupId, name: 'VVIP', color: '#b83a17', memberCount: 1 }]);
    await deleteGroup(host, { eventId, groupId });
    expect(await listGroups(host, eventId)).toEqual([]);
    expect((await listGuests(host, { eventId })).guests[0]?.groupIds).toEqual([]);
  });

  it('filters by search, group, rsvp and checked-in', async () => {
    const host = await makeHost();
    const { eventId } = await createEventDraft(host, { type: 'birthday' });
    events.push(eventId);
    const { groupId } = await createGroup(host, { eventId, name: 'Family', color: null });
    await addGuests(host, {
      eventId,
      guests: [
        { name: 'Adaeze Okafor', phone: '08031234567', groupIds: [groupId] },
        { name: 'Bob Stone', email: 'bob@example.com', groupIds: [] },
      ],
    });
    expect((await listGuests(host, { eventId, search: 'okafor' })).total).toBe(1);
    expect((await listGuests(host, { eventId, search: '0803' })).total).toBe(1);
    expect((await listGuests(host, { eventId, groupId })).total).toBe(1);
    expect((await listGuests(host, { eventId, rsvp: 'NONE' })).total).toBe(2);
    expect((await listGuests(host, { eventId, checkedIn: true })).total).toBe(0);
    expect((await listGuests(host, { eventId, checkedIn: false })).total).toBe(2);
  });
});

describe('guests counts, duplicates and csv enqueue', () => {
  it('counts by rsvp, flags duplicates and enqueues csv imports', async () => {
    const { countGuests, requestCsvImport } = await import('./guests.js');
    const host = await makeHost();
    const { eventId } = await createEventDraft(host, { type: 'birthday' });
    events.push(eventId);
    await addGuests(host, { eventId, guests: [{ name: 'Ada', phone: '08031234567', groupIds: [] }] });
    const second = await addGuests(host, { eventId, guests: [{ name: 'Adaeze', phone: '08031234567', groupIds: [] }] });
    expect(second.duplicates.map((row) => row.name)).toEqual(['Ada']);

    const counts = await countGuests(host, eventId);
    expect(counts).toMatchObject({ total: 2, none: 2, checkedIn: 0 });

    const queued = await requestCsvImport(host, {
      eventId,
      fileKey: `events/${eventId}/imports/a.csv`,
      mapping: { name: 0 },
      totalRows: 10,
    });
    expect(queued).toEqual({ queued: true });
    const outbox = await prisma.outboxEvent.findFirst({
      where: { topic: 'guests.import' },
      orderBy: { createdAt: 'desc' },
    });
    expect(outbox?.payload).toMatchObject({ eventId, totalRows: 10 });
    await prisma.outboxEvent.delete({ where: { id: outbox!.id } });

    await expect(
      requestCsvImport(host, { eventId, fileKey: 'events/other/imports/a.csv', mapping: { name: 0 }, totalRows: 1 }),
    ).rejects.toThrow();
  });
});
