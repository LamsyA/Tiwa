import {
  EVENT_FORMATS,
  FORMAT_RULES,
  TIMEFRAME_DAYS_BEFORE,
  currencyForCountry,
  customEventType,
  getEventType,
  timezoneForCountry,
  type Timeframe,
} from '@tiwa/config';
import { prisma, type Prisma } from '@tiwa/db';
import { z } from 'zod';
import type { Actor } from '../auth/authorize.js';
import { InvalidTransitionError, ValidationError } from '../shared/errors.js';
import { uniqueSlug } from '../shared/ids.js';
import { allocate } from '../shared/money.js';
import { audit, enqueue } from '../shared/outbox.js';
import { addDays } from '../shared/time.js';
import { ensureGallery } from '../moments/galleries.js';
import { zonedTimeToUtc } from '../shared/zoned.js';
import { permissionsFor, requireEventAccess, requireHost, toStoredPermissions } from './access.js';

// Events module commands (Backend.md §2, §5.10; UF-03). Validation messages
// are message keys (`events.errors.*`), never English.

type UserActor = Extract<Actor, { kind: 'user' }>;

export const WIZARD_STEPS = ['type', 'basics', 'venue', 'guests', 'features'] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'invalidDate');
const TIME = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'invalidTime');

export const createEventDraftSchema = z.object({
  type: z.string().min(1).max(64),
  /** A type the host names themselves when theirs isn't listed (type = a `custom_*` template). */
  customLabel: z.string().trim().min(2, 'typeTooShort').max(60, 'typeTooLong').optional(),
  format: z.enum(EVENT_FORMATS).optional(),
});

export const stepSchemas = {
  basics: z.object({
    name: z.string().trim().min(2, 'nameTooShort').max(120, 'nameTooLong'),
    date: DATE,
    startTime: TIME,
    endTime: TIME.optional(),
  }),
  venue: z.object({
    days: z
      .array(
        z.object({
          date: DATE,
          title: z.string().trim().max(80).optional(),
          venueName: z.string().trim().max(160).optional(),
          address: z.string().trim().max(240).optional(),
        }),
      )
      .min(1, 'atLeastOneDay')
      .max(14, 'tooManyDays'),
  }),
  guests: z.object({
    expectedGuests: z.coerce.number().int('wholeNumber').min(1, 'guestsMin').max(100_000, 'guestsMax'),
    budgetMinor: z.string().regex(/^\d{1,15}$/, 'invalidBudget'),
    visibility: z.enum(['PRIVATE', 'LINK_ONLY', 'PUBLIC']),
  }),
  features: z.object({
    invites: z.boolean(),
    moments: z.boolean(),
    tickets: z.boolean(),
  }),
} as const;

export type StepData = { [K in keyof typeof stepSchemas]: z.infer<(typeof stepSchemas)[K]> };

export const saveEventStepSchema = z.discriminatedUnion('step', [
  z.object({ eventId: z.string().uuid(), step: z.literal('basics'), data: stepSchemas.basics }),
  z.object({ eventId: z.string().uuid(), step: z.literal('venue'), data: stepSchemas.venue }),
  z.object({ eventId: z.string().uuid(), step: z.literal('guests'), data: stepSchemas.guests }),
  z.object({ eventId: z.string().uuid(), step: z.literal('features'), data: stepSchemas.features }),
]);

const NEXT_STEP: Record<Exclude<WizardStep, 'type'>, WizardStep | 'done'> = {
  basics: 'venue',
  venue: 'guests',
  guests: 'features',
  features: 'done',
};

function templateOrThrow(type: string) {
  const template = getEventType(type);
  if (!template) throw new ValidationError('Unknown event type', { field: 'type', key: 'unknownType' });
  return template;
}

/** Step 1 of the wizard: a DRAFT with template defaults and the creator as HOST. */
export async function createEventDraft(actor: UserActor, input: z.infer<typeof createEventDraftSchema>) {
  const custom = input.customLabel ? customEventType(input.format ?? 'PRIVATE_CELEBRATION') : null;
  const template = custom ?? templateOrThrow(input.type);
  if (template.custom && !custom)
    throw new ValidationError('Name your event type', { field: 'customLabel', key: 'typeTooShort' });
  const label = input.customLabel ?? template.label;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { countryCode: true } });
  const rules = FORMAT_RULES[template.format];
  return prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: {
        slug: uniqueSlug(label),
        type: template.key,
        typeLabel: custom ? label : null,
        format: template.format,
        name: label,
        visibility: rules.defaultVisibility,
        countryCode: user.countryCode,
        currency: currencyForCountry(user.countryCode),
        timezone: timezoneForCountry(user.countryCode),
        invitesEnabled: template.features.invites,
        momentsEnabled: template.features.moments,
        ticketsEnabled: template.features.tickets && rules.defaultVisibility === 'PUBLIC',
        wizardStep: 'basics',
        createdById: actor.userId,
      },
      select: { id: true },
    });
    await tx.eventParticipant.create({
      data: {
        eventId: event.id,
        userId: actor.userId,
        role: 'HOST',
        permissions: toStoredPermissions(permissionsFor('HOST')),
        acceptedAt: new Date(),
      },
    });
    await audit(tx, {
      actor,
      action: 'event.create',
      targetType: 'Event',
      targetId: event.id,
      data: { type: template.key },
    });
    return { eventId: event.id };
  });
}

/** Save one wizard step (autosave on Next). The draft remembers the next step so a reload resumes there (UF-03-2). */
export async function saveEventStep(actor: UserActor, input: z.infer<typeof saveEventStepSchema>) {
  await requireEventAccess(actor, input.eventId, 'event.edit');
  const event = await prisma.event.findUniqueOrThrow({ where: { id: input.eventId } });
  if (event.status === 'CANCELLED' || event.status === 'COMPLETED') {
    throw new InvalidTransitionError('Event is closed', { status: event.status });
  }
  const rules = FORMAT_RULES[event.format];
  const advance = event.status === 'DRAFT' ? { wizardStep: NEXT_STEP[input.step] } : {};

  await prisma.$transaction(async (tx) => {
    switch (input.step) {
      case 'basics': {
        const { name, date, startTime, endTime } = input.data;
        const startsAt = zonedTimeToUtc(date, startTime, event.timezone);
        let endsAt = endTime ? zonedTimeToUtc(date, endTime, event.timezone) : null;
        if (endsAt && endsAt <= startsAt) endsAt = addDays(endsAt, 1); // ends after midnight
        await tx.event.update({ where: { id: event.id }, data: { name, startsAt, endsAt, ...advance } });
        // Keep day 1 in step with the start date when the schedule step hasn't set days yet.
        // One findFirst instead of count + findFirst: absent row means create.
        const first = await tx.eventDay.findFirst({ where: { eventId: event.id }, orderBy: { sortOrder: 'asc' } });
        if (!first) await tx.eventDay.create({ data: { eventId: event.id, date: new Date(`${date}T00:00:00Z`) } });
        else {
          await tx.eventDay.update({ where: { id: first.id }, data: { date: new Date(`${date}T00:00:00Z`) } });
        }
        break;
      }
      case 'venue': {
        // Replace the schedule; programme items keep their rows (day link cleared) until finalize places them.
        await tx.programmeItem.updateMany({ where: { eventId: event.id }, data: { dayId: null } });
        await tx.eventDay.deleteMany({ where: { eventId: event.id } });
        await tx.eventDay.createMany({
          data: input.data.days.map((day, index) => ({
            eventId: event.id,
            date: new Date(`${day.date}T00:00:00Z`),
            title: day.title || null,
            venueName: day.venueName || null,
            address: day.address || null,
            sortOrder: index,
          })),
        });
        await tx.event.update({ where: { id: event.id }, data: advance });
        break;
      }
      case 'guests': {
        if (!rules.visibilities.includes(input.data.visibility)) {
          throw new ValidationError('Visibility not allowed', { field: 'visibility', key: 'visibilityNotAllowed' });
        }
        await tx.event.update({
          where: { id: event.id },
          data: {
            expectedGuests: input.data.expectedGuests,
            plannedBudgetMinor: BigInt(input.data.budgetMinor),
            visibility: input.data.visibility,
            // Tickets need a public event (UF-03-4).
            ...(input.data.visibility !== 'PUBLIC' ? { ticketsEnabled: false } : {}),
            ...advance,
          },
        });
        break;
      }
      case 'features': {
        if (input.data.tickets && (event.visibility !== 'PUBLIC' || !rules.ticketsAllowed)) {
          throw new ValidationError('Tickets need a public event', { field: 'tickets', key: 'ticketsNeedPublic' });
        }
        await tx.event.update({
          where: { id: event.id },
          data: {
            invitesEnabled: input.data.invites,
            momentsEnabled: input.data.moments,
            ticketsEnabled: input.data.tickets,
            ...advance,
          },
        });
        break;
      }
    }
  });
  return { next: NEXT_STEP[input.step] };
}

/** Due date for a checklist bucket: N days before the start, at 09:00 UTC-equivalent of that day. */
function dueFor(startsAt: Date | null, timeframe: Timeframe, now: Date): Date | null {
  if (!startsAt) return null;
  const due = addDays(startsAt, -TIMEFRAME_DAYS_BEFORE[timeframe]);
  // Planning late: anything already past is due today rather than in the past.
  return due < now && timeframe !== 'day' && timeframe !== 'after' ? now : due;
}

export const eventIdSchema = z.object({ eventId: z.string().uuid() });

/**
 * DRAFT → ACTIVE (HOST). Creates day 1 if none was set and the template's
 * programme outline. The checklist and the budget split are NOT applied any
 * more (D-X30): the host builds their own plan and allocations, or opts in to
 * the template's suggestions with `applySuggestedTasks` / `applySuggestedBudget`.
 */
export async function finalizeEvent(actor: UserActor, input: z.infer<typeof eventIdSchema>, _now = new Date()) {
  const access = await requireEventAccess(actor, input.eventId, 'event.edit');
  requireHost(access);
  return prisma.$transaction(async (tx) => {
    const event = await tx.event.findUniqueOrThrow({ where: { id: input.eventId } });
    if (event.status !== 'DRAFT') throw new InvalidTransitionError('Event is not a draft', { status: event.status });
    if (!event.startsAt) throw new ValidationError('Pick a date first', { field: 'date', key: 'dateRequired' });
    const template = templateOrThrow(event.type);
    let days = await tx.eventDay.findMany({ where: { eventId: event.id }, orderBy: { sortOrder: 'asc' } });
    if (days.length === 0) {
      const day = await tx.eventDay.create({ data: { eventId: event.id, date: startOfDate(event.startsAt) } });
      days = [day];
    }

    const firstDay = days[0];
    await Promise.all([
      tx.programmeItem.createMany({
        data: template.programme.map((item, index) => {
          const startsAt =
            item.offsetMinutes !== undefined && event.startsAt
              ? new Date(event.startsAt.getTime() + item.offsetMinutes * 60_000)
              : null;
          const endsAt =
            startsAt && item.durationMinutes ? new Date(startsAt.getTime() + item.durationMinutes * 60_000) : null;
          return {
            eventId: event.id,
            dayId: firstDay?.id ?? null,
            key: item.key,
            title: item.title,
            startsAt,
            endsAt,
            sortOrder: index,
          };
        }),
      }),
    ]);

    await tx.event.update({ where: { id: event.id }, data: { status: 'ACTIVE', wizardStep: null } });
    await ensureGallery(tx, event.id);
    await audit(tx, { actor, action: 'event.finalize', targetType: 'Event', targetId: event.id });
    await enqueue(tx, 'event.finalized', { eventId: event.id });
    return { eventId: event.id };
  });
}

export const applySuggestedTasksSchema = z.object({
  eventId: z.string().uuid(),
  /** Template checklist keys to add; omitted = all of them. */
  keys: z.array(z.string().min(1).max(60)).max(100).optional(),
});

/**
 * Opt-in (D-X30): add the event type's suggested checklist tasks (all, or the
 * keys the host ticked). Tasks already on the plan are skipped, so applying
 * twice is harmless. Every task stays editable and deletable afterwards.
 */
export async function applySuggestedTasks(
  actor: UserActor,
  input: z.input<typeof applySuggestedTasksSchema>,
  now = new Date(),
) {
  const { eventId, keys } = applySuggestedTasksSchema.parse(input);
  await requireEventAccess(actor, eventId, 'event.edit');
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    select: { type: true, startsAt: true },
  });
  const template = templateOrThrow(event.type);
  const existing = new Set(
    (await prisma.task.findMany({ where: { eventId }, select: { key: true } })).map((row) => row.key),
  );
  const wanted = keys ? new Set(keys) : null;
  const offset = await prisma.task.count({ where: { eventId } });
  const rows = template.checklist
    .filter((item) => (!wanted || wanted.has(item.key)) && !existing.has(item.key))
    .map((item, index) => ({
      eventId,
      key: item.key,
      title: item.title,
      timeframe: item.timeframe,
      dueAt: dueFor(event.startsAt, item.timeframe, now),
      priority: item.priority ?? ('NORMAL' as const),
      sortOrder: offset + index,
    }));
  if (rows.length > 0) {
    await prisma.$transaction(async (tx) => {
      await tx.task.createMany({ data: rows });
      await audit(tx, {
        actor,
        action: 'event.tasks.suggested',
        targetType: 'Event',
        targetId: eventId,
        data: { added: rows.length },
      });
    });
  }
  return { added: rows.length };
}

/** The template's suggested checklist, for the "pick suggestions" sheet. */
export async function suggestedTasks(actor: UserActor, input: z.infer<typeof eventIdSchema>) {
  await requireEventAccess(actor, input.eventId, 'event.view');
  const event = await prisma.event.findUniqueOrThrow({ where: { id: input.eventId }, select: { type: true } });
  const existing = new Set(
    (await prisma.task.findMany({ where: { eventId: input.eventId }, select: { key: true } })).map((row) => row.key),
  );
  return templateOrThrow(event.type).checklist.map((item) => ({
    key: item.key,
    title: item.title,
    timeframe: item.timeframe,
    added: existing.has(item.key),
  }));
}

/**
 * Opt-in (D-X30): create budget categories from the event type's suggested
 * split of the host's total budget. Only when the event has no categories yet,
 * so it never overwrites the host's own allocations.
 */
export async function applySuggestedBudget(actor: UserActor, input: z.infer<typeof eventIdSchema>) {
  await requireEventAccess(actor, input.eventId, 'money.edit');
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: input.eventId },
    select: { type: true, plannedBudgetMinor: true },
  });
  if ((await prisma.budgetCategory.count({ where: { eventId: input.eventId } })) > 0) {
    throw new ValidationError('This budget already has categories', { key: 'budgetNotEmpty' });
  }
  const template = templateOrThrow(event.type);
  const splits = allocate(
    event.plannedBudgetMinor,
    template.budget.map((split) => split.percent),
  );
  await prisma.$transaction(async (tx) => {
    await tx.budgetCategory.createMany({
      data: template.budget.map((split, index) => ({
        eventId: input.eventId,
        key: split.key,
        label: split.label,
        plannedMinor: splits[index] ?? 0n,
        sortOrder: index,
      })),
    });
    await audit(tx, {
      actor,
      action: 'budget.suggested',
      targetType: 'Event',
      targetId: input.eventId,
      data: { categories: template.budget.length },
    });
  });
  return { categories: template.budget.length };
}

function startOfDate(instant: Date): Date {
  return new Date(Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate()));
}

/** EVT-09: copy an event's setup into a new DRAFT owned by the caller (no tasks, guests or money). */
export async function duplicateEvent(actor: UserActor, input: z.infer<typeof eventIdSchema>) {
  await requireEventAccess(actor, input.eventId, 'event.edit');
  const source = await prisma.event.findUniqueOrThrow({
    where: { id: input.eventId },
    include: { days: { orderBy: { sortOrder: 'asc' } } },
  });
  return prisma.$transaction(async (tx) => {
    const copy = await tx.event.create({
      data: {
        slug: uniqueSlug(source.name),
        type: source.type,
        format: source.format,
        name: source.name,
        description: source.description,
        themeColor: source.themeColor,
        visibility: source.visibility,
        countryCode: source.countryCode,
        currency: source.currency,
        timezone: source.timezone,
        expectedGuests: source.expectedGuests,
        plannedBudgetMinor: source.plannedBudgetMinor,
        invitesEnabled: source.invitesEnabled,
        ticketsEnabled: source.ticketsEnabled,
        momentsEnabled: source.momentsEnabled,
        // Dates are left for the host to choose: the copy starts at the basics step.
        wizardStep: 'basics',
        createdById: actor.userId,
      },
      select: { id: true },
    });
    await tx.eventParticipant.create({
      data: {
        eventId: copy.id,
        userId: actor.userId,
        role: 'HOST',
        permissions: toStoredPermissions(permissionsFor('HOST')),
        acceptedAt: new Date(),
      },
    });
    if (source.days.length) {
      await tx.eventDay.createMany({
        data: source.days.map((day) => ({
          eventId: copy.id,
          date: day.date,
          title: day.title,
          venueName: day.venueName,
          address: day.address,
          sortOrder: day.sortOrder,
        })),
      });
    }
    await audit(tx, {
      actor,
      action: 'event.duplicate',
      targetType: 'Event',
      targetId: copy.id,
      data: { from: source.id },
    });
    return { eventId: copy.id };
  });
}

/**
 * Bookings and payments arrive in P7/P8; until then nothing blocks a cancel.
 * Those phases replace this check (EVT-10: cancel is blocked while money moved).
 */
async function hasMoneyActivity(_tx: Prisma.TransactionClient, _eventId: string): Promise<boolean> {
  return false;
}

/** DRAFT | ACTIVE → CANCELLED (HOST only, EVT-10). */
export async function cancelEvent(actor: UserActor, input: z.infer<typeof eventIdSchema>) {
  const access = await requireEventAccess(actor, input.eventId, 'event.close');
  requireHost(access);
  await prisma.$transaction(async (tx) => {
    const event = await tx.event.findUniqueOrThrow({ where: { id: input.eventId }, select: { status: true } });
    if (event.status !== 'DRAFT' && event.status !== 'ACTIVE') {
      throw new InvalidTransitionError('Cannot cancel', { status: event.status });
    }
    if (await hasMoneyActivity(tx, input.eventId)) {
      throw new InvalidTransitionError('Bookings or payments exist', { reason: 'money-activity' });
    }
    await tx.event.update({ where: { id: input.eventId }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
    // Free every vendor date this event was holding (D-X43).
    const held = await tx.booking.findMany({ where: { eventId: input.eventId }, select: { id: true } });
    await tx.availabilityBlock.deleteMany({ where: { bookingId: { in: held.map((row) => row.id) } } });
    await audit(tx, { actor, action: 'event.cancel', targetType: 'Event', targetId: input.eventId });
    await enqueue(tx, 'event.cancelled', { eventId: input.eventId });
  });
}
