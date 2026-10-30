import { prisma } from '@tiwa/db';
import { afterAll, describe, expect, it } from 'vitest';
import { createEventDraft } from '../events/commands.js';
import { addGuests, createGroup } from './guests.js';
import { headcount, issueHeadcountToken, verifyHeadcountToken } from './headcount.js';
import { createTable } from './tables.js';

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
  await prisma.seatingTable.deleteMany({ where: { eventId: { in: events } } });
  await prisma.eventParticipant.deleteMany({ where: { eventId: { in: events } } });
  await prisma.auditLog.deleteMany({ where: { targetId: { in: events } } });
  await prisma.event.deleteMany({ where: { id: { in: events } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

describe('headcount', () => {
  it('aggregates without any guest PII (UF-06-3)', async () => {
    const host = await makeHost();
    const { eventId } = await createEventDraft(host, { type: 'birthday' });
    events.push(eventId);
    const { groupId } = await createGroup(host, { eventId, name: 'Family', color: null });
    const { tableId } = await createTable(host, { eventId, name: 'Table 1', capacity: 8 });
    const added = await addGuests(host, {
      eventId,
      guests: [
        {
          name: 'Adaeze Okafor',
          phone: '08031234567',
          email: 'ada@example.com',
          groupIds: [groupId],
          meal: 'Jollof',
          dietary: 'No nuts',
        },
        { name: 'Bob Stone', groupIds: [], meal: 'jollof' },
      ],
    });
    await prisma.guest.updateMany({
      where: { id: { in: added.created }, eventId },
      data: { rsvp: 'YES', plusOnes: 1, tableId },
    });

    const report = await headcount(host, eventId);
    expect(report.rsvp).toMatchObject({ yes: 2, total: 2 });
    expect(report.expectedAttendance).toBe(4);
    expect(report.meals).toEqual([{ meal: 'Jollof', count: 2 }]);
    expect(report.dietary).toEqual([{ need: 'No nuts', count: 1 }]);
    expect(report.groups).toEqual([{ name: 'Family', total: 1, yes: 1 }]);
    expect(report.tables).toEqual([{ name: 'Table 1', capacity: 8, assigned: 2, overCapacity: false }]);
    // The serialised report must not contain guest PII anywhere.
    const blob = JSON.stringify(report);
    expect(blob).not.toContain('Adaeze');
    expect(blob).not.toContain('0803');
    expect(blob).not.toContain('234803');
    expect(blob).not.toContain('ada@example.com');
    expect(blob).not.toContain('Bob Stone');
  });
});

describe('headcount share token', () => {
  const secret = 'test-secret-0123456789abcdef';

  it('issues and verifies, and rejects forgeries and expired tokens', () => {
    const eventId = '00000000-0000-0000-0000-000000000001';
    const { token } = issueHeadcountToken(eventId, secret, new Date('2031-01-01T00:00:00Z'));
    expect(verifyHeadcountToken(token, secret, new Date('2031-02-01T00:00:00Z'))).toBe(eventId);
    // Tampered signature.
    expect(verifyHeadcountToken(`${token.slice(0, -2)}xx`, secret, new Date('2031-02-01T00:00:00Z'))).toBeNull();
    // Wrong secret.
    expect(verifyHeadcountToken(token, 'other-secret', new Date('2031-02-01T00:00:00Z'))).toBeNull();
    // Expired (90-day TTL).
    expect(verifyHeadcountToken(token, secret, new Date('2031-06-01T00:00:00Z'))).toBeNull();
    // Malformed.
    expect(verifyHeadcountToken('not-a-token', secret)).toBeNull();
    expect(verifyHeadcountToken('', secret)).toBeNull();
  });
});
