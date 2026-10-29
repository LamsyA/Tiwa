import { FORMAT_RULES } from '@tiwa/config';
import { prisma } from '@tiwa/db';
import { sniffMime, type Storage } from '@tiwa/storage';
import { z } from 'zod';
import type { Actor } from '../auth/authorize.js';
import { InvalidTransitionError, ValidationError } from '../shared/errors.js';
import { uuidv7 } from '../shared/ids.js';
import { audit } from '../shared/outbox.js';
import { addDays } from '../shared/time.js';
import { zonedTimeToUtc } from '../shared/zoned.js';
import { requireEventAccess } from './access.js';

// Event settings (P3-T10, Frontend.md §6.3): details, features, visibility,
// cover image and theme colour (EVT-13). Cancel lives in commands.ts (EVT-10).

type UserActor = Extract<Actor, { kind: 'user' }>;

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'invalidDate');
const TIME = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'invalidTime');

export const updateEventDetailsSchema = z.object({
  eventId: z.string().uuid(),
  name: z.string().trim().min(2, 'nameTooShort').max(120, 'nameTooLong'),
  description: z.string().trim().max(2000, 'descriptionTooLong').nullable(),
  date: DATE,
  startTime: TIME,
  endTime: TIME.nullable(),
  expectedGuests: z.coerce.number().int('wholeNumber').min(1, 'guestsMin').max(100_000, 'guestsMax').nullable(),
});

export const updateEventFeaturesSchema = z.object({
  eventId: z.string().uuid(),
  visibility: z.enum(['PRIVATE', 'LINK_ONLY', 'PUBLIC']),
  invites: z.boolean(),
  moments: z.boolean(),
  tickets: z.boolean(),
});

export const updateEventAppearanceSchema = z.object({
  eventId: z.string().uuid(),
  /** `#rrggbb`; null resets to the brand colour. */
  themeColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'invalidColour')
    .nullable(),
});

async function editableEvent(actor: UserActor, eventId: string) {
  await requireEventAccess(actor, eventId, 'event.edit');
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
  if (event.status === 'CANCELLED' || event.status === 'COMPLETED') {
    throw new InvalidTransitionError('Event is closed', { status: event.status });
  }
  return event;
}

export async function updateEventDetails(actor: UserActor, input: z.infer<typeof updateEventDetailsSchema>) {
  const event = await editableEvent(actor, input.eventId);
  const startsAt = zonedTimeToUtc(input.date, input.startTime, event.timezone);
  let endsAt = input.endTime ? zonedTimeToUtc(input.date, input.endTime, event.timezone) : null;
  if (endsAt && endsAt <= startsAt) endsAt = addDays(endsAt, 1);
  await prisma.$transaction(async (tx) => {
    await tx.event.update({
      where: { id: event.id },
      data: {
        name: input.name,
        description: input.description || null,
        startsAt,
        endsAt,
        expectedGuests: input.expectedGuests,
      },
    });
    await audit(tx, {
      actor,
      action: 'event.update',
      targetType: 'Event',
      targetId: event.id,
      data: { section: 'details' },
    });
  });
}

/** Features + visibility together, because Tickets depend on Public (UF-03-4). */
export async function updateEventFeatures(actor: UserActor, input: z.infer<typeof updateEventFeaturesSchema>) {
  const event = await editableEvent(actor, input.eventId);
  const rules = FORMAT_RULES[event.format];
  if (!rules.visibilities.includes(input.visibility)) {
    throw new ValidationError('Visibility not allowed', { field: 'visibility', key: 'visibilityNotAllowed' });
  }
  if (input.tickets && (input.visibility !== 'PUBLIC' || !rules.ticketsAllowed)) {
    throw new ValidationError('Tickets need a public event', { field: 'tickets', key: 'ticketsNeedPublic' });
  }
  await prisma.$transaction(async (tx) => {
    await tx.event.update({
      where: { id: event.id },
      data: {
        visibility: input.visibility,
        invitesEnabled: input.invites,
        momentsEnabled: input.moments,
        ticketsEnabled: input.tickets,
      },
    });
    await audit(tx, {
      actor,
      action: 'event.update',
      targetType: 'Event',
      targetId: event.id,
      data: { section: 'features', visibility: input.visibility },
    });
  });
}

export async function updateEventAppearance(actor: UserActor, input: z.infer<typeof updateEventAppearanceSchema>) {
  const event = await editableEvent(actor, input.eventId);
  await prisma.$transaction(async (tx) => {
    await tx.event.update({
      where: { id: event.id },
      data: { themeColor: input.themeColor?.toLowerCase() ?? null },
    });
    await audit(tx, {
      actor,
      action: 'event.update',
      targetType: 'Event',
      targetId: event.id,
      data: { section: 'appearance' },
    });
  });
}

// ── Cover image (EVT-13): public bucket, used on guest pages ──

export const MAX_COVER_BYTES = 5 * 1024 * 1024;
const COVER_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const startCoverSchema = z.object({
  eventId: z.string().uuid(),
  mime: z.enum(COVER_TYPES, { message: 'coverType' }),
  sizeBytes: z.number().int().min(1, 'emptyFile').max(MAX_COVER_BYTES, 'coverTooLarge'),
});

export const completeCoverSchema = z.object({
  eventId: z.string().uuid(),
  key: z.string().min(1).max(200),
  mime: z.enum(COVER_TYPES),
  sizeBytes: z.number().int().min(1).max(MAX_COVER_BYTES),
});

/** A fresh key per upload: the CDN can cache covers forever. */
export async function startCoverUpload(storage: Storage, actor: UserActor, input: z.infer<typeof startCoverSchema>) {
  await editableEvent(actor, input.eventId);
  const key = `events/${input.eventId}/cover/${uuidv7()}`;
  return { key, uploadUrl: await storage.signPut(key, input.mime, input.sizeBytes) };
}

export async function completeCoverUpload(
  storage: Storage,
  actor: UserActor,
  input: z.infer<typeof completeCoverSchema>,
) {
  const event = await editableEvent(actor, input.eventId);
  // Only keys this event's start step could have issued.
  if (!input.key.startsWith(`events/${event.id}/cover/`)) {
    throw new ValidationError('Unknown upload', { field: 'cover', key: 'coverMismatch' });
  }
  const stored = await storage.head(input.key);
  const sniffed = stored ? sniffMime(await storage.readStart(input.key, 16)) : null;
  if (!stored || stored.sizeBytes !== input.sizeBytes || sniffed !== input.mime) {
    await storage.delete(input.key).catch(() => undefined);
    throw new ValidationError('Not a valid image', { field: 'cover', key: 'coverMismatch' });
  }
  const previous = event.coverKey;
  await prisma.event.update({ where: { id: event.id }, data: { coverKey: input.key } });
  if (previous && previous !== input.key) await storage.delete(previous).catch(() => undefined);
  return { coverKey: input.key };
}

export async function removeCover(storage: Storage, actor: UserActor, input: { eventId: string }) {
  const event = await editableEvent(actor, input.eventId);
  if (!event.coverKey) return;
  await prisma.event.update({ where: { id: event.id }, data: { coverKey: null } });
  await storage.delete(event.coverKey).catch(() => undefined);
}
