import { prisma } from '@tiwa/db';
import { z } from 'zod';
import type { Actor } from '../auth/authorize.js';
import { requireEventAccess } from '../events/access.js';
import { NotFoundError, ValidationError } from '../shared/errors.js';
import { audit } from '../shared/outbox.js';
import { utcToZoned, zonedTimeToUtc } from '../shared/zoned.js';

// D-X92: the guest programme — the order of the day guests read on their
// phones instead of a printed programme. The host (or their planner) adds
// anything: speeches, prayers, music, the meal, dances. Times are entered in
// the event's own time zone on one of its days.

type UserActor = Extract<Actor, { kind: 'user' }>;

export const PROGRAMME_KINDS = [
  'arrival',
  'speech',
  'prayer',
  'music',
  'dance',
  'meal',
  'toast',
  'ceremony',
  'entertainment',
  'photos',
  'break',
  'other',
] as const;
export type ProgrammeKind = (typeof PROGRAMME_KINDS)[number];

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'invalidTime');

export const programmeItemSchema = z.object({
  eventId: z.string().uuid(),
  itemId: z.string().uuid().optional(),
  title: z.string().trim().min(1, 'titleRequired').max(140, 'titleTooLong'),
  kind: z.enum(PROGRAMME_KINDS).default('other'),
  /** Event-local date (YYYY-MM-DD); defaults to the event's first day. */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  startTime: time,
  endTime: time.optional().or(z.literal('')),
  /** Who leads it: a speaker, the choir, the MC… */
  who: z.string().trim().max(120).optional().or(z.literal('')),
  description: z.string().trim().max(500, 'notesTooLong').optional().or(z.literal('')),
  room: z.string().trim().max(80).optional().or(z.literal('')),
});

export interface ProgrammeRow {
  id: string;
  title: string;
  kind: ProgrammeKind;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  startsAt: string | null;
  who: string;
  description: string;
  room: string;
}

export interface ProgrammeView {
  event: { id: string; name: string; slug: string; timezone: string; status: string };
  days: string[];
  items: ProgrammeRow[];
}

function asKind(value: string | null): ProgrammeKind {
  return (PROGRAMME_KINDS as readonly string[]).includes(value ?? '') ? (value as ProgrammeKind) : 'other';
}

async function eventFor(eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      name: true,
      slug: true,
      timezone: true,
      status: true,
      startsAt: true,
      days: { orderBy: { date: 'asc' }, select: { id: true, date: true } },
    },
  });
  if (!event) throw new NotFoundError('Event not found');
  return event;
}

function eventDays(event: Awaited<ReturnType<typeof eventFor>>): string[] {
  if (event.days.length > 0) return event.days.map((day) => day.date.toISOString().slice(0, 10));
  return event.startsAt ? [utcToZoned(event.startsAt, event.timezone).date] : [];
}

/** The host's programme editor view (anyone on the event can read it). */
export async function getProgramme(actor: UserActor, eventId: string): Promise<ProgrammeView> {
  await requireEventAccess(actor, eventId, 'event.view');
  const event = await eventFor(eventId);
  const rows = await prisma.programmeItem.findMany({
    where: { eventId },
    orderBy: [{ startsAt: 'asc' }, { sortOrder: 'asc' }],
    take: 300,
  });
  return {
    event: { id: event.id, name: event.name, slug: event.slug, timezone: event.timezone, status: event.status },
    days: eventDays(event),
    items: rows.map((row) => {
      const start = row.startsAt ? utcToZoned(row.startsAt, event.timezone) : null;
      const end = row.endsAt ? utcToZoned(row.endsAt, event.timezone) : null;
      return {
        id: row.id,
        title: row.title,
        kind: asKind(row.kind),
        date: start?.date ?? null,
        startTime: start?.time ?? null,
        endTime: end?.time ?? null,
        startsAt: row.startsAt?.toISOString() ?? null,
        who: row.speakers.join(', '),
        description: row.description ?? '',
        room: row.room ?? '',
      };
    }),
  };
}

/** Add or edit one item (event.edit: the host, co-hosts with edit, the planner). */
export async function saveProgrammeItem(
  actor: UserActor,
  raw: z.input<typeof programmeItemSchema>,
): Promise<{ itemId: string }> {
  const input = programmeItemSchema.parse(raw);
  await requireEventAccess(actor, input.eventId, 'event.edit');
  const event = await eventFor(input.eventId);
  const days = eventDays(event);
  const date = input.date ?? days[0];
  if (!date) {
    throw new ValidationError('Set the event date first', { field: 'startTime', key: 'noEventDate' });
  }
  const startsAt = zonedTimeToUtc(date, input.startTime, event.timezone);
  let endsAt = input.endTime ? zonedTimeToUtc(date, input.endTime, event.timezone) : null;
  // An end before the start runs past midnight.
  if (endsAt && endsAt <= startsAt) endsAt = new Date(endsAt.getTime() + 24 * 60 * 60 * 1000);
  const dayId = event.days.find((day) => day.date.toISOString().slice(0, 10) === date)?.id ?? null;
  const data = {
    title: input.title,
    kind: input.kind,
    startsAt,
    endsAt,
    dayId,
    speakers: input.who
      ? input.who
          .split(',')
          .map((name) => name.trim())
          .filter(Boolean)
          .slice(0, 6)
      : [],
    description: input.description || null,
    room: input.room || null,
    isPublic: true,
  };
  if (input.itemId) {
    const existing = await prisma.programmeItem.findFirst({ where: { id: input.itemId, eventId: input.eventId } });
    if (!existing) throw new NotFoundError('Programme item not found');
    await prisma.programmeItem.update({ where: { id: existing.id }, data });
    await audit(prisma, {
      actor,
      action: 'programme.update',
      targetType: 'Event',
      targetId: input.eventId,
      data: { itemId: existing.id },
    });
    return { itemId: existing.id };
  }
  const created = await prisma.programmeItem.create({ data: { ...data, eventId: input.eventId } });
  await audit(prisma, {
    actor,
    action: 'programme.add',
    targetType: 'Event',
    targetId: input.eventId,
    data: { itemId: created.id },
  });
  return { itemId: created.id };
}

export const deleteProgrammeItemSchema = z.object({ eventId: z.string().uuid(), itemId: z.string().uuid() });

export async function deleteProgrammeItem(
  actor: UserActor,
  raw: z.input<typeof deleteProgrammeItemSchema>,
): Promise<void> {
  const input = deleteProgrammeItemSchema.parse(raw);
  await requireEventAccess(actor, input.eventId, 'event.edit');
  const deleted = await prisma.programmeItem.deleteMany({ where: { id: input.itemId, eventId: input.eventId } });
  if (deleted.count === 0) throw new NotFoundError('Programme item not found');
  await audit(prisma, {
    actor,
    action: 'programme.delete',
    targetType: 'Event',
    targetId: input.eventId,
    data: { itemId: input.itemId },
  });
}
