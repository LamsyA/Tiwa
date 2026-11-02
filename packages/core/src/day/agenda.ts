import { prisma } from '@tiwa/db';
import { NotFoundError } from '../shared/errors.js';
import { utcToZoned } from '../shared/zoned.js';

// Live guest agenda (/e/{slug}/agenda). Guests follow the run-of-show items
// the host marked public; if there are none, the public programme stands in.
// It opens on the event's first day (in the event's time zone) so backstage
// timings aren't shared weeks ahead. No owners, notes or contacts — titles
// and times only.

export type AgendaState = 'done' | 'now' | 'next' | 'later' | 'skipped';

export interface AgendaItem {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  lateByMin: number;
  state: AgendaState;
}

export interface PublicAgenda {
  event: {
    name: string;
    slug: string;
    timezone: string;
    themeColor: string | null;
    startsAt: Date | null;
    venue: string | null;
  };
  /** Event-local date the agenda opens (YYYY-MM-DD), or null when the event has no date yet. */
  opensOn: string | null;
  open: boolean;
  items: AgendaItem[];
}

interface Row {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  lateByMin: number;
  status: string | null;
}

/** Done / now / next / later from the clock and the backstage status (pure). */
export function agendaStates(rows: Row[], now: Date): AgendaItem[] {
  let nextGiven = false;
  return rows.map((row) => {
    const start = row.startsAt.getTime() + row.lateByMin * 60_000;
    const end = row.endsAt ? row.endsAt.getTime() + row.lateByMin * 60_000 : start + 15 * 60_000;
    let state: AgendaState;
    if (row.status === 'SKIPPED') state = 'skipped';
    else if (row.status === 'DONE' || (row.status !== 'STARTED' && end <= now.getTime())) state = 'done';
    else if (row.status === 'STARTED' || (start <= now.getTime() && now.getTime() < end)) state = 'now';
    else if (!nextGiven) {
      state = 'next';
      nextGiven = true;
    } else state = 'later';
    return {
      id: row.id,
      title: row.title,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      lateByMin: row.lateByMin,
      state,
    };
  });
}

export async function publicAgenda(slug: string, now = new Date()): Promise<PublicAgenda> {
  const event = await prisma.event.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      timezone: true,
      themeColor: true,
      startsAt: true,
      days: { orderBy: { date: 'asc' }, select: { date: true, venueName: true } },
    },
  });
  if (!event || event.status === 'DRAFT' || event.status === 'CANCELLED') throw new NotFoundError('Event not found');
  const firstDay = event.days[0]?.date.toISOString().slice(0, 10) ?? null;
  const opensOn = firstDay ?? (event.startsAt ? utcToZoned(event.startsAt, event.timezone).date : null);
  const today = utcToZoned(now, event.timezone).date;
  const open = opensOn !== null && today >= opensOn;
  const summary = {
    name: event.name,
    slug: event.slug,
    timezone: event.timezone,
    themeColor: event.themeColor,
    startsAt: event.startsAt,
    venue: event.days[0]?.venueName ?? null,
  };
  if (!open) return { event: summary, opensOn, open, items: [] };

  const run = await prisma.runItem.findMany({
    where: { eventId: event.id, isPublic: true },
    orderBy: [{ startsAt: 'asc' }, { sortOrder: 'asc' }],
    select: { id: true, title: true, startsAt: true, durationMin: true, lateByMin: true, status: true },
    take: 200,
  });
  const rows: Row[] =
    run.length > 0
      ? run.map((row) => ({
          id: row.id,
          title: row.title,
          startsAt: row.startsAt,
          endsAt: new Date(row.startsAt.getTime() + row.durationMin * 60_000),
          lateByMin: row.lateByMin,
          status: row.status,
        }))
      : (
          await prisma.programmeItem.findMany({
            where: { eventId: event.id, isPublic: true, startsAt: { not: null } },
            orderBy: [{ startsAt: 'asc' }, { sortOrder: 'asc' }],
            select: { id: true, title: true, startsAt: true, endsAt: true },
            take: 200,
          })
        ).map((row) => ({
          id: row.id,
          title: row.title,
          startsAt: row.startsAt!,
          endsAt: row.endsAt,
          lateByMin: 0,
          status: null,
        }));
  return { event: summary, opensOn, open, items: agendaStates(rows, now) };
}
