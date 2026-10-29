import { EVENT_TYPES, TIMEFRAME_DAYS_BEFORE, getEventType } from '@tiwa/config';
import { prisma } from '../src/index.js';

// P3-T12: one ACTIVE event per format for manual QA and the GATE P3 tour.
// Full demo universe (vendors, venues, gallery, load data) lands with Backend.md §14.
// Idempotent: wipes the demo host's events, then recreates them from the live templates
// (checklist, budget split and programme match what the wizard applies — UF-03-3).

const DEMO_EMAIL = 'demo@tiwa.test';

interface SeedEvent {
  slug: string;
  type: string;
  name: string;
  daysOut: number;
  startHourWAT: number;
  expectedGuests: number;
  budgetMinor: bigint;
  visibility: 'PRIVATE' | 'LINK_ONLY' | 'PUBLIC';
}

const EVENTS: SeedEvent[] = [
  {
    slug: 'seed-birthday',
    type: 'birthday',
    name: "Ada's 40th Birthday",
    daysOut: 75,
    startHourWAT: 16,
    expectedGuests: 80,
    budgetMinor: 2_500_000_00n,
    visibility: 'PRIVATE',
  },
  {
    slug: 'seed-end-of-year',
    type: 'end_of_year_party',
    name: 'Tiwa End-of-Year Party',
    daysOut: 90,
    startHourWAT: 18,
    expectedGuests: 150,
    budgetMinor: 10_000_000_00n,
    visibility: 'PRIVATE',
  },
  {
    slug: 'seed-concert',
    type: 'concert',
    name: 'Lagos Live Concert',
    daysOut: 120,
    startHourWAT: 19,
    expectedGuests: 2000,
    budgetMinor: 25_000_000_00n,
    visibility: 'PUBLIC',
  },
  {
    slug: 'seed-church',
    type: 'church_programme',
    name: 'Harvest Thanksgiving Service',
    daysOut: 45,
    startHourWAT: 10,
    expectedGuests: 500,
    budgetMinor: 1_000_000_00n,
    visibility: 'LINK_ONLY',
  },
];

function atWAT(daysOut: number, hourWAT: number, now: Date): Date {
  const day = new Date(now.getTime() + daysOut * 24 * 60 * 60 * 1000);
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hourWAT - 1, 0, 0));
}

async function wipeDemoEvents(userId: string) {
  const events = await prisma.event.findMany({ where: { createdById: userId }, select: { id: true } });
  const ids = events.map((event) => event.id);
  if (ids.length === 0) return;
  await prisma.task.deleteMany({ where: { eventId: { in: ids } } });
  await prisma.programmeItem.deleteMany({ where: { eventId: { in: ids } } });
  await prisma.eventDay.deleteMany({ where: { eventId: { in: ids } } });
  await prisma.budgetCategory.deleteMany({ where: { eventId: { in: ids } } });
  await prisma.document.deleteMany({ where: { eventId: { in: ids } } });
  await prisma.eventParticipant.deleteMany({ where: { eventId: { in: ids } } });
  await prisma.outboxEvent.deleteMany({
    where: { OR: ids.map((id) => ({ payload: { path: ['eventId'], equals: id } })) },
  });
  await prisma.auditLog.deleteMany({ where: { targetId: { in: ids } } });
  await prisma.event.deleteMany({ where: { id: { in: ids } } });
}

async function seedEvent(userId: string, spec: SeedEvent, now: Date) {
  const template = getEventType(spec.type);
  if (!template) throw new Error(`unknown template in seed: ${spec.type}`);
  void EVENT_TYPES.length;

  const startsAt = atWAT(spec.daysOut, spec.startHourWAT, now);
  const endsAt = new Date(startsAt.getTime() + 5 * 60 * 60 * 1000);

  const event = await prisma.event.create({
    data: {
      slug: spec.slug,
      type: template.key,
      format: template.format,
      status: 'ACTIVE',
      name: spec.name,
      countryCode: 'NG',
      currency: 'NGN',
      timezone: 'Africa/Lagos',
      startsAt,
      endsAt,
      expectedGuests: spec.expectedGuests,
      plannedBudgetMinor: spec.budgetMinor,
      visibility: spec.visibility,
      invitesEnabled: template.features.invites,
      momentsEnabled: template.features.moments,
      ticketsEnabled: template.features.tickets && spec.visibility === 'PUBLIC',
      createdById: userId,
    },
    select: { id: true },
  });

  await prisma.eventParticipant.create({
    data: { eventId: event.id, userId, role: 'HOST', acceptedAt: now },
  });

  const day = await prisma.eventDay.create({
    data: {
      eventId: event.id,
      date: new Date(Date.UTC(startsAt.getUTCFullYear(), startsAt.getUTCMonth(), startsAt.getUTCDate())),
      venueName: 'Venue not decided yet',
      sortOrder: 0,
    },
  });

  // Checklist with due dates like finalizeEvent's dueFor (past dues clamp to now).
  await prisma.task.createMany({
    data: template.checklist.map((item, index) => {
      const raw = new Date(startsAt.getTime() - TIMEFRAME_DAYS_BEFORE[item.timeframe] * 24 * 60 * 60 * 1000);
      const dueAt = raw < now && item.timeframe !== 'day' && item.timeframe !== 'after' ? now : raw;
      return {
        eventId: event.id,
        key: item.key,
        title: item.title,
        timeframe: item.timeframe,
        dueAt,
        priority: item.priority ?? 'NORMAL',
        sortOrder: index,
      };
    }),
  });

  // Budget split by template percentages (remainder to the last category).
  const percents = template.budget.map((split) => split.percent);
  const total = percents.reduce((sum, percent) => sum + percent, 0);
  let assigned = 0n;
  const planned = template.budget.map((split, index) => {
    if (index === template.budget.length - 1) return spec.budgetMinor - assigned;
    const share = (spec.budgetMinor * BigInt(split.percent)) / BigInt(total);
    assigned += share;
    return share;
  });
  await prisma.budgetCategory.createMany({
    data: template.budget.map((split, index) => ({
      eventId: event.id,
      key: split.key,
      label: split.label,
      plannedMinor: planned[index] ?? 0n,
      sortOrder: index,
    })),
  });

  await prisma.programmeItem.createMany({
    data: template.programme.map((item, index) => ({
      eventId: event.id,
      dayId: day.id,
      key: item.key,
      title: item.title,
      startsAt: item.offsetMinutes !== undefined ? new Date(startsAt.getTime() + item.offsetMinutes * 60_000) : null,
      endsAt:
        item.offsetMinutes !== undefined && item.durationMinutes
          ? new Date(startsAt.getTime() + (item.offsetMinutes + item.durationMinutes) * 60_000)
          : null,
      sortOrder: index,
    })),
  });

  return event.id;
}

async function main() {
  const now = new Date();
  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: { name: 'Demo Host', countryCode: 'NG' },
    create: { email: DEMO_EMAIL, name: 'Demo Host', countryCode: 'NG', emailVerified: true },
    select: { id: true },
  });

  await wipeDemoEvents(user.id);
  const ids: string[] = [];
  for (const spec of EVENTS) ids.push(await seedEvent(user.id, spec, now));
  console.log(`[seed] demo host ${DEMO_EMAIL} + ${ids.length} events (birthday, end-of-year, concert, church).`);
}

await main()
  .catch((error: unknown) => {
    console.error('[seed] failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
