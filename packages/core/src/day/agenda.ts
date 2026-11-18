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
  /** D-X92: programme details guests read (empty for run-of-show rows). */
  kind: string | null;
  who: string[];
  description: string | null;
  room: string | null;
  /** Event-local date, for multi-day programmes. */
  date: string;
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
    /** D-X93: the host's heading ("Order of Service"), or null for the default. */
    programmeTitle: string | null;
  };
  /** Event-local date the agenda opens (YYYY-MM-DD), or null when the event has no date yet. */
  opensOn: string | null;
  /** True on/after the event day: items show now / next / done (D-X92: the programme itself shows any time). */
  open: boolean;
  items: AgendaItem[];
}

interface Row {
  id: string;
  title: string;
  kind?: string | null;
  who?: string[];
  description?: string | null;
  room?: string | null;
  date?: string;
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
      kind: row.kind ?? null,
      who: row.who ?? [],
      description: row.description ?? null,
      room: row.room ?? null,
      date: row.date ?? '',
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      lateByMin: row.lateByMin,
      state,
    };
  });
}

export async function publicAgenda(
  slug: string,
  now = new Date(),
  opts: { allowDraft?: boolean } = {},
): Promise<PublicAgenda> {
  const event = await prisma.event.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      timezone: true,
      themeColor: true,
      programmeTitle: true,
      startsAt: true,
      days: { orderBy: { date: 'asc' }, select: { date: true, venueName: true } },
    },
  });
  if (!event || event.status === 'CANCELLED' || (event.status === 'DRAFT' && !opts.allowDraft)) {
    throw new NotFoundError('Event not found');
  }
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
    programmeTitle: event.programmeTitle,
  };
  // D-X92: the host's programme is what guests read, any time before or on the
  // day; public run-of-show items stand in only when there is no programme.
  const local = (at: Date) => utcToZoned(at, event.timezone).date;
  const programme = await prisma.programmeItem.findMany({
    where: { eventId: event.id, isPublic: true, startsAt: { not: null } },
    orderBy: [{ startsAt: 'asc' }, { sortOrder: 'asc' }],
    select: {
      id: true,
      title: true,
      startsAt: true,
      endsAt: true,
      kind: true,
      speakers: true,
      description: true,
      room: true,
    },
    take: 300,
  });
  let rows: Row[] = programme.map((row) => ({
    id: row.id,
    title: row.title,
    startsAt: row.startsAt!,
    endsAt: row.endsAt,
    lateByMin: 0,
    status: null,
    kind: row.kind,
    who: row.speakers,
    description: row.description,
    room: row.room,
    date: local(row.startsAt!),
  }));
  if (rows.length === 0 && open) {
    const run = await prisma.runItem.findMany({
      where: { eventId: event.id, isPublic: true },
      orderBy: [{ startsAt: 'asc' }, { sortOrder: 'asc' }],
      select: { id: true, title: true, startsAt: true, durationMin: true, lateByMin: true, status: true },
      take: 200,
    });
    rows = run.map((row) => ({
      id: row.id,
      title: row.title,
      startsAt: row.startsAt,
      endsAt: new Date(row.startsAt.getTime() + row.durationMin * 60_000),
      lateByMin: row.lateByMin,
      status: row.status,
      date: local(row.startsAt),
    }));
  }
  if (!open) {
    // Before the day: the full programme, nothing marked live yet.
    return {
      event: summary,
      opensOn,
      open,
      items: agendaStates(rows, new Date(0)).map((item) => ({ ...item, state: 'later' as const })),
    };
  }
  return { event: summary, opensOn, open, items: agendaStates(rows, now) };
}
