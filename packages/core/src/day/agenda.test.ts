// Live guest agenda: state machine and the "opens on the day" gate.
import { prisma } from '@tiwa/db';
import { afterAll, describe, expect, it } from 'vitest';
import { uuidv7 } from '../shared/ids.js';
import { agendaStates, publicAgenda } from './agenda.js';

const at = (iso: string) => new Date(iso);
const users: string[] = [];
const events: string[] = [];

afterAll(async () => {
  await prisma.runItem.deleteMany({ where: { eventId: { in: events } } });
  await prisma.eventDay.deleteMany({ where: { eventId: { in: events } } });
  await prisma.event.deleteMany({ where: { id: { in: events } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

describe('agendaStates', () => {
  const rows = [
    {
      id: 'a',
      title: 'Arrivals',
      startsAt: at('2026-11-14T15:00:00Z'),
      endsAt: at('2026-11-14T16:00:00Z'),
      lateByMin: 0,
      status: 'PLANNED',
    },
    {
      id: 'b',
      title: 'Speeches',
      startsAt: at('2026-11-14T16:00:00Z'),
      endsAt: at('2026-11-14T16:30:00Z'),
      lateByMin: 0,
      status: 'PLANNED',
    },
    {
      id: 'c',
      title: 'Dinner',
      startsAt: at('2026-11-14T16:30:00Z'),
      endsAt: at('2026-11-14T17:30:00Z'),
      lateByMin: 0,
      status: 'PLANNED',
    },
    { id: 'd', title: 'Dance', startsAt: at('2026-11-14T17:30:00Z'), endsAt: null, lateByMin: 0, status: 'PLANNED' },
  ];

  it('marks past items done, the running one now, and only one next', () => {
    const states = agendaStates(rows, at('2026-11-14T16:10:00Z')).map((row) => row.state);
    expect(states).toEqual(['done', 'now', 'next', 'later']);
  });

  it('follows the backstage status and lateness over the clock', () => {
    const late = rows.map((row) => (row.id === 'b' ? { ...row, lateByMin: 20 } : row));
    expect(agendaStates(late, at('2026-11-14T16:10:00Z')).map((row) => row.state)).toEqual([
      'done',
      'next',
      'later',
      'later',
    ]);
    const started = rows.map((row) => (row.id === 'a' ? { ...row, status: 'STARTED' } : row));
    expect(agendaStates(started, at('2026-11-14T16:10:00Z'))[0]!.state).toBe('now');
    const skipped = rows.map((row) => (row.id === 'c' ? { ...row, status: 'SKIPPED' } : row));
    expect(agendaStates(skipped, at('2026-11-14T16:10:00Z'))[2]!.state).toBe('skipped');
  });
});

describe('publicAgenda', () => {
  it('stays closed before the day, then shows public items only', async () => {
    const user = await prisma.user.create({ data: { name: 'Agenda host', countryCode: 'NG' } });
    users.push(user.id);
    const slug = `agenda-${Date.now().toString(36)}`;
    const event = await prisma.event.create({
      data: {
        id: uuidv7(),
        slug,
        type: 'birthday',
        format: 'PRIVATE_CELEBRATION',
        status: 'ACTIVE',
        name: 'Agenda party',
        visibility: 'PRIVATE',
        countryCode: 'NG',
        currency: 'NGN',
        timezone: 'Africa/Lagos',
        startsAt: at('2026-11-14T15:00:00Z'),
        createdById: user.id,
        days: { create: [{ id: uuidv7(), date: at('2026-11-14T00:00:00Z'), venueName: 'The Hall' }] },
      },
    });
    events.push(event.id);
    await prisma.runItem.createMany({
      data: [
        {
          id: uuidv7(),
          eventId: event.id,
          title: 'Doors open',
          startsAt: at('2026-11-14T15:00:00Z'),
          durationMin: 60,
          isPublic: true,
        },
        {
          id: uuidv7(),
          eventId: event.id,
          title: 'Caterer setup',
          startsAt: at('2026-11-14T13:00:00Z'),
          durationMin: 60,
        },
      ],
    });

    const before = await publicAgenda(slug, at('2026-11-13T20:00:00Z'));
    expect(before).toMatchObject({ open: false, opensOn: '2026-11-14', items: [] });

    const during = await publicAgenda(slug, at('2026-11-14T15:30:00Z'));
    expect(during.open).toBe(true);
    expect(during.items.map((row) => [row.title, row.state])).toEqual([['Doors open', 'now']]);
    expect(during.event.venue).toBe('The Hall');

    await expect(publicAgenda('no-such-event-slug')).rejects.toThrow();
  });
});
