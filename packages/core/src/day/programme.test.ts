import { prisma } from '@tiwa/db';
import { afterAll, describe, expect, it } from 'vitest';
import { createEventDraft } from '../events/commands.js';
import { publicAgenda } from './agenda.js';
import { deleteProgrammeItem, getProgramme, saveProgrammeItem } from './programme.js';

const users: string[] = [];
const events: string[] = [];

async function makeUser() {
  const user = await prisma.user.create({ data: { name: 'Host', countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user' as const, userId: user.id, isAdmin: false };
}

afterAll(async () => {
  await prisma.programmeItem.deleteMany({ where: { eventId: { in: events } } });
  await prisma.auditLog.deleteMany({ where: { targetId: { in: events } } });
  await prisma.outboxEvent.deleteMany({
    where: { OR: events.map((id) => ({ payload: { path: ['eventId'], equals: id } })) },
  });
  await prisma.eventParticipant.deleteMany({ where: { eventId: { in: events } } });
  await prisma.event.deleteMany({ where: { id: { in: events } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

describe('guest programme (D-X92)', () => {
  it('saves items in the event time zone, shows them to guests before the day, and deletes them', async () => {
    const host = await makeUser();
    const { eventId } = await createEventDraft(host, { type: 'birthday' });
    events.push(eventId);
    const event = await prisma.event.update({
      where: { id: eventId },
      data: { startsAt: new Date('2031-03-14T15:00:00Z'), timezone: 'Africa/Lagos', status: 'ACTIVE' },
      select: { slug: true },
    });

    const { itemId } = await saveProgrammeItem(host, {
      eventId,
      title: 'Welcome speech',
      kind: 'speech',
      startTime: '16:30',
      endTime: '16:45',
      who: 'Uncle Tunde, MC Bolu',
      description: 'A short welcome from the family.',
    });
    await saveProgrammeItem(host, { eventId, title: 'Opening prayer', kind: 'prayer', startTime: '16:15' });

    const view = await getProgramme(host, eventId);
    expect(view.items.map((row) => row.title)).toEqual(['Opening prayer', 'Welcome speech']);
    const speech = view.items.find((row) => row.id === itemId);
    expect(speech).toMatchObject({ startTime: '16:30', endTime: '16:45', kind: 'speech', date: '2031-03-14' });
    expect(speech?.who).toBe('Uncle Tunde, MC Bolu');

    // Guests see the whole programme weeks ahead, nothing marked live yet.
    const agenda = await publicAgenda(event.slug, new Date('2031-02-01T12:00:00Z'));
    expect(agenda.open).toBe(false);
    expect(agenda.items.map((row) => row.title)).toEqual(['Opening prayer', 'Welcome speech']);
    expect(agenda.items.every((row) => row.state === 'later')).toBe(true);
    expect(agenda.items[1]).toMatchObject({ kind: 'speech', who: ['Uncle Tunde', 'MC Bolu'] });

    // On the day, the clock drives now / next.
    const live = await publicAgenda(event.slug, new Date('2031-03-14T15:20:00Z'));
    expect(live.items.map((row) => row.state)).toEqual(['now', 'next']);

    await deleteProgrammeItem(host, { eventId, itemId });
    expect((await getProgramme(host, eventId)).items).toHaveLength(1);
  });

  it('only the event team can edit it', async () => {
    const host = await makeUser();
    const stranger = await makeUser();
    const { eventId } = await createEventDraft(host, { type: 'birthday' });
    events.push(eventId);
    await expect(
      saveProgrammeItem(stranger, { eventId, title: 'Crash', kind: 'other', startTime: '10:00' }),
    ).rejects.toThrow();
  });
});
