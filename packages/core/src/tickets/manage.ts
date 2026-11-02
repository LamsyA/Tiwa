// Ticket catalogue management (P11-T02; TKT-01–TKT-04, TKT-09 placeholders).
// Organiser creates ticket types, promo codes, registration questions and
// publishes the public page. All writes need `tickets.manage`; reads need
// `event.view` (sales) or are public (published page, in queries.ts).
import { prisma, type Prisma } from '@tiwa/db';
import { z } from 'zod';
import type { Actor } from '../auth/authorize.js';
import { requireEventAccess } from '../events/access.js';
import { ConflictError, ValidationError } from '../shared/errors.js';
import { uuidv7 } from '../shared/ids.js';
import { audit } from '../shared/outbox.js';

type UserActor = Extract<Actor, { kind: 'user' }>;

async function manageableEvent(actor: UserActor, eventId: string) {
  const access = await requireEventAccess(actor, eventId, 'tickets.manage');
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
  return { access, event };
}

const MINOR = z.string().regex(/^\d{1,15}$/, 'invalidAmount');

export const ticketTypeSchema = z.object({
  eventId: z.string().uuid(),
  name: z.string().trim().min(2, 'nameTooShort').max(80, 'nameTooLong'),
  description: z.string().trim().max(500, 'descriptionTooLong').nullable().optional(),
  priceMinor: MINOR,
  quantity: z.coerce.number().int('wholeNumber').min(1, 'quantityMin').max(100_000, 'quantityMax'),
  maxPerOrder: z.coerce.number().int('wholeNumber').min(1, 'maxPerOrderMin').max(100, 'maxPerOrderMax').default(10),
  salesStart: z.string().datetime('invalidDate').nullable().optional(),
  salesEnd: z.string().datetime('invalidDate').nullable().optional(),
});

export const updateTicketTypeSchema = ticketTypeSchema.partial().extend({
  ticketTypeId: z.string().uuid(),
});

export const deleteTicketTypeSchema = z.object({
  ticketTypeId: z.string().uuid(),
});

export const promoSchema = z.object({
  eventId: z.string().uuid(),
  code: z
    .string()
    .trim()
    .min(3, 'codeTooShort')
    .max(24, 'codeTooLong')
    .regex(/^[A-Za-z0-9-]+$/, 'codeInvalid'),
  percentOff: z.coerce.number().int().min(1).max(100).nullable().optional(),
  amountOffMinor: MINOR.nullable().optional(),
  maxUses: z.coerce.number().int().min(1).max(1_000_000).nullable().optional(),
  expiresAt: z.string().datetime('invalidDate').nullable().optional(),
});

export const deletePromoSchema = z.object({ promoId: z.string().uuid() });

export const ticketsSettingsSchema = z.object({
  eventId: z.string().uuid(),
  ticketsEnabled: z.boolean(),
  ticketsPublished: z.boolean(),
  registrationQuestions: z
    .array(
      z.object({
        key: z.string().trim().min(1).max(40),
        label: z.string().trim().min(1).max(120),
        required: z.boolean().default(false),
      }),
    )
    .max(20, 'tooManyQuestions')
    .default([]),
});

function normaliseCode(code: string): string {
  return code.trim().toUpperCase();
}

export async function createTicketType(actor: UserActor, raw: z.input<typeof ticketTypeSchema>) {
  const input = ticketTypeSchema.parse(raw);
  const { event } = await manageableEvent(actor, input.eventId);
  if (input.salesStart && input.salesEnd && new Date(input.salesStart) >= new Date(input.salesEnd)) {
    throw new ValidationError('Sales must end after they start', { field: 'salesEnd', key: 'salesWindow' });
  }
  const created = await prisma.ticketType.create({
    data: {
      id: uuidv7(),
      eventId: input.eventId,
      name: input.name,
      description: input.description ?? null,
      priceMinor: BigInt(input.priceMinor),
      currency: event.currency,
      quantity: input.quantity,
      maxPerOrder: input.maxPerOrder,
      salesStart: input.salesStart ? new Date(input.salesStart) : null,
      salesEnd: input.salesEnd ? new Date(input.salesEnd) : null,
      sortOrder: await prisma.ticketType.count({ where: { eventId: input.eventId } }),
    },
  });
  await audit(prisma, { actor, action: 'tickets.type.create', targetType: 'TicketType', targetId: created.id });
  return { ticketTypeId: created.id };
}

export async function updateTicketType(actor: UserActor, raw: z.input<typeof updateTicketTypeSchema>) {
  const input = updateTicketTypeSchema.parse(raw);
  const existing = await prisma.ticketType.findUniqueOrThrow({ where: { id: input.ticketTypeId } });
  await manageableEvent(actor, existing.eventId);
  if (
    (existing.sold > 0 || existing.reserved > 0) &&
    (input.quantity !== undefined || input.priceMinor !== undefined)
  ) {
    // Quantity/price edits after sales start would rewrite history: block
    // them once any seat is sold or held (organiser creates a new type instead).
    if (input.quantity !== undefined && input.quantity !== existing.quantity) {
      throw new ConflictError('Tickets already sold or reserved for this type', { key: 'salesStarted' });
    }
    if (input.priceMinor !== undefined && BigInt(input.priceMinor) !== existing.priceMinor) {
      throw new ConflictError('Tickets already sold or reserved for this type', { key: 'salesStarted' });
    }
  }
  const data: Prisma.TicketTypeUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.description !== undefined) data.description = input.description ?? null;
  if (input.priceMinor !== undefined) data.priceMinor = BigInt(input.priceMinor);
  if (input.quantity !== undefined) data.quantity = input.quantity;
  if (input.maxPerOrder !== undefined) data.maxPerOrder = input.maxPerOrder;
  if (input.salesStart !== undefined) data.salesStart = input.salesStart ? new Date(input.salesStart) : null;
  if (input.salesEnd !== undefined) data.salesEnd = input.salesEnd ? new Date(input.salesEnd) : null;
  const updated = await prisma.ticketType.update({ where: { id: existing.id }, data });
  await audit(prisma, { actor, action: 'tickets.type.update', targetType: 'TicketType', targetId: updated.id });
  return { ticketTypeId: updated.id };
}

export async function deleteTicketType(actor: UserActor, raw: z.input<typeof deleteTicketTypeSchema>) {
  const input = deleteTicketTypeSchema.parse(raw);
  const existing = await prisma.ticketType.findUniqueOrThrow({ where: { id: input.ticketTypeId } });
  await manageableEvent(actor, existing.eventId);
  if (existing.sold > 0 || existing.reserved > 0) {
    throw new ConflictError('Tickets already sold or reserved for this type', { key: 'salesStarted' });
  }
  await prisma.ticketType.delete({ where: { id: existing.id } });
  await audit(prisma, { actor, action: 'tickets.type.delete', targetType: 'TicketType', targetId: existing.id });
  return { deleted: true as const };
}

export async function createPromo(actor: UserActor, raw: z.input<typeof promoSchema>) {
  const input = promoSchema.parse(raw);
  await manageableEvent(actor, input.eventId);
  if (input.percentOff == null && input.amountOffMinor == null) {
    throw new ValidationError('A promo needs a percent or an amount off', { field: 'percentOff', key: 'promoEmpty' });
  }
  if (input.percentOff != null && input.amountOffMinor != null) {
    throw new ValidationError('Use either percent or amount off, not both', { field: 'percentOff', key: 'promoBoth' });
  }
  const code = normaliseCode(input.code);
  const existing = await prisma.promoCode.findUnique({ where: { eventId_code: { eventId: input.eventId, code } } });
  if (existing) throw new ConflictError('That code is already used for this event', { key: 'codeTaken' });
  const created = await prisma.promoCode.create({
    data: {
      id: uuidv7(),
      eventId: input.eventId,
      code,
      percentOff: input.percentOff ?? null,
      amountOffMinor: input.amountOffMinor != null ? BigInt(input.amountOffMinor) : null,
      maxUses: input.maxUses ?? null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    },
  });
  await audit(prisma, { actor, action: 'tickets.promo.create', targetType: 'PromoCode', targetId: created.id });
  return { promoId: created.id };
}

export async function deletePromo(actor: UserActor, raw: z.input<typeof deletePromoSchema>) {
  const input = deletePromoSchema.parse(raw);
  const existing = await prisma.promoCode.findUniqueOrThrow({ where: { id: input.promoId } });
  await manageableEvent(actor, existing.eventId);
  if (existing.used > 0) throw new ConflictError('That code has already been used', { key: 'promoUsed' });
  await prisma.promoCode.delete({ where: { id: existing.id } });
  await audit(prisma, { actor, action: 'tickets.promo.delete', targetType: 'PromoCode', targetId: existing.id });
  return { deleted: true as const };
}

export async function updateTicketsSettings(actor: UserActor, raw: z.input<typeof ticketsSettingsSchema>) {
  const input = ticketsSettingsSchema.parse(raw);
  const { event } = await manageableEvent(actor, input.eventId);
  if (input.ticketsPublished && !input.ticketsEnabled) {
    throw new ValidationError('Turn tickets on before publishing the page', {
      field: 'ticketsPublished',
      key: 'publishNeedsEnabled',
    });
  }
  if (input.ticketsEnabled && event.visibility !== 'PUBLIC') {
    // Tickets are a public-event feature (UF-03-4): keep the rule with the wizard.
    throw new ValidationError('Only public events can sell tickets', { field: 'ticketsEnabled', key: 'needsPublic' });
  }
  const keys = input.registrationQuestions.map((question) => question.key);
  if (new Set(keys).size !== keys.length) {
    throw new ValidationError('Question keys must be unique', { field: 'registrationQuestions', key: 'questionKeys' });
  }
  await prisma.event.update({
    where: { id: input.eventId },
    data: {
      ticketsEnabled: input.ticketsEnabled,
      ticketsPublished: input.ticketsPublished,
      registrationQuestions: input.registrationQuestions,
    },
  });
  await audit(prisma, { actor, action: 'tickets.settings', targetType: 'Event', targetId: input.eventId });
  return { updated: true as const };
}

export interface TicketSalesRow {
  typeId: string;
  name: string;
  priceMinor: string;
  quantity: number;
  sold: number;
  reserved: number;
  available: number;
}

/** Sales summary for the organiser (P11-T02): per-type sold/reserved/available. */
export async function ticketSales(actor: UserActor, eventId: string) {
  await requireEventAccess(actor, eventId, 'tickets.manage');
  const types = await prisma.ticketType.findMany({ where: { eventId }, orderBy: { sortOrder: 'asc' } });
  const rows: TicketSalesRow[] = types.map((type) => ({
    typeId: type.id,
    name: type.name,
    priceMinor: type.priceMinor.toString(),
    quantity: type.quantity,
    sold: type.sold,
    reserved: type.reserved,
    available: Math.max(0, type.quantity - type.sold - type.reserved),
  }));
  const paid = await prisma.ticketOrder.aggregate({
    where: { eventId, status: 'PAID' },
    _sum: { totalMinor: true },
    _count: true,
  });
  return {
    rows,
    revenueMinor: (paid._sum.totalMinor ?? 0n).toString(),
    paidOrders: paid._count,
    ticketsPublished: (
      await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { ticketsPublished: true } })
    ).ticketsPublished,
  };
}
