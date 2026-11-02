// Ticket reservations and issue (P11-T04/T05; TKT-05–TKT-08, UF-22).
// The seat count is the source of truth: every reserve/confirm/expire runs
// inside one transaction that locks the TicketType rows (`SELECT … FOR
// UPDATE`, ordered by id against deadlocks) and maintains the `sold` /
// `reserved` caches, so 200 parallel checkouts for 100 seats can never
// issue more than 100 tickets (UF-22-1, Backend.md §15).
//
// Lean P8 (D-X27): no provider checkout. Free orders (total 0) are issued
// instantly. Paid orders stay RESERVED until the organiser confirms them
// (money collected outside Tiwa, like offline booking milestones); the
// online `startCheckout` path arrives with the deferred provider tasks.
import { Prisma, prisma } from '@tiwa/db';
import { z } from 'zod';
import type { Actor } from '../auth/authorize.js';
import { requireEventAccess } from '../events/access.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../shared/errors.js';
import { uuidv7 } from '../shared/ids.js';
import { mulBps } from '../shared/money.js';
import { audit } from '../shared/outbox.js';
import { ticketQrValue } from './tokens.js';

type UserActor = Extract<Actor, { kind: 'user' }>;

export const RESERVATION_MINUTES = 10;

const itemSchema = z.object({
  ticketTypeId: z.string().uuid(),
  qty: z.coerce.number().int('wholeNumber').min(1, 'qtyMin').max(100, 'qtyMax'),
});

export const reserveTicketsSchema = z.object({
  eventSlug: z.string().min(1).max(64),
  items: z.array(itemSchema).min(1, 'atLeastOneTicket').max(10, 'tooManyLines'),
  buyerName: z.string().trim().min(2, 'nameTooShort').max(120, 'nameTooLong'),
  buyerEmail: z.string().trim().email('invalidEmail').max(160),
  buyerPhone: z.string().trim().max(32).optional(),
  promoCode: z.string().trim().max(24).optional(),
  answers: z.record(z.string(), z.unknown()).default({}),
});

export const orderIdSchema = z.object({ orderId: z.string().uuid() });

export const waitlistSchema = z.object({
  eventSlug: z.string().min(1).max(64),
  email: z.string().trim().email('invalidEmail').max(160),
  name: z.string().trim().max(120).optional(),
  qty: z.coerce.number().int().min(1).max(100).default(1),
});

interface ReservationItem {
  ticketTypeId: string;
  qty: number;
  unitMinor: bigint;
}

async function loadSaleableEvent(slug: string) {
  const event = await prisma.event.findUnique({ where: { slug } });
  if (!event || event.deletedAt) throw new NotFoundError('Event not found');
  if (!event.ticketsEnabled || !event.ticketsPublished) throw new NotFoundError('Tickets not available');
  if (event.status !== 'ACTIVE') throw new ConflictError('This event is not on sale', { key: 'notActive' });
  return event;
}

/** Reserve seats for 10 minutes (public). Throws CONFLICT when sold out so the UI can offer the waitlist. */
export async function reserveTickets(raw: z.input<typeof reserveTicketsSchema>) {
  const input = reserveTicketsSchema.parse(raw);
  const event = await loadSaleableEvent(input.eventSlug);
  const now = new Date();

  const typeIds = [...new Set(input.items.map((item) => item.ticketTypeId))].sort();
  const types = await prisma.ticketType.findMany({ where: { id: { in: typeIds }, eventId: event.id } });
  if (types.length !== typeIds.length) throw new NotFoundError('Ticket type not found');
  const byId = new Map(types.map((type) => [type.id, type]));

  const windowed = input.items.map((item) => ({ ...item, type: byId.get(item.ticketTypeId)! }));
  for (const { type, qty } of windowed) {
    if (type.salesStart && type.salesStart > now)
      throw new ConflictError(`${type.name} is not on sale yet`, { key: 'notOnSale' });
    if (type.salesEnd && type.salesEnd <= now)
      throw new ConflictError(`${type.name} is no longer on sale`, { key: 'saleEnded' });
    if (qty > type.maxPerOrder) {
      throw new ValidationError(`At most ${type.maxPerOrder} × ${type.name} per order`, {
        field: 'items',
        key: 'maxPerOrder',
      });
    }
  }

  let promo: { id: string; percentOff: number | null; amountOffMinor: bigint | null } | null = null;
  if (input.promoCode?.trim()) {
    const code = input.promoCode.trim().toUpperCase();
    const row = await prisma.promoCode.findUnique({ where: { eventId_code: { eventId: event.id, code } } });
    if (!row) throw new ValidationError('That promo code is not valid', { field: 'promoCode', key: 'promoInvalid' });
    if (row.expiresAt && row.expiresAt <= now)
      throw new ValidationError('That promo code expired', { field: 'promoCode', key: 'promoExpired' });
    if (row.maxUses != null && row.used >= row.maxUses) {
      throw new ValidationError('That promo code is used up', { field: 'promoCode', key: 'promoUsedUp' });
    }
    promo = row;
  }

  const items: ReservationItem[] = windowed.map(({ ticketTypeId, qty, type }) => ({
    ticketTypeId,
    qty,
    unitMinor: type.priceMinor,
  }));
  const subtotal = items.reduce((sum, item) => sum + item.unitMinor * BigInt(item.qty), 0n);
  let discount = 0n;
  if (promo) {
    discount =
      promo.percentOff != null
        ? mulBps(subtotal, Math.round((promo.percentOff / 100) * 10_000))
        : promo.amountOffMinor!;
    if (discount > subtotal) discount = subtotal;
  }
  // Lean: no provider fee (fee arrives with online checkout, P8-T07).
  const total = subtotal - discount;

  const reservedUntil = new Date(Date.now() + RESERVATION_MINUTES * 60_000);
  const answers = (input.answers ?? {}) as Prisma.InputJsonValue;
  const order = await prisma.$transaction(async (tx) => {
    // Lock the type rows in id order so concurrent checkouts serialise.
    const locked: { id: string; quantity: number; sold: number; reserved: number }[] = await tx.$queryRaw`
      SELECT id, quantity, sold, reserved FROM "TicketType"
      WHERE id = ANY(${typeIds}::text[]) AND "eventId" = ${event.id}
      ORDER BY id FOR UPDATE`;
    const lockedById = new Map(locked.map((row) => [row.id, row]));
    for (const item of items) {
      const row = lockedById.get(item.ticketTypeId)!;
      if (row.quantity - row.sold - row.reserved < item.qty) {
        throw new ConflictError('Not enough tickets left', { key: 'soldOut' });
      }
    }
    if (promo) {
      const live = await tx.promoCode.findUniqueOrThrow({ where: { id: promo.id } });
      if (live.maxUses != null && live.used >= live.maxUses) {
        throw new ValidationError('That promo code is used up', { field: 'promoCode', key: 'promoUsedUp' });
      }
      await tx.promoCode.update({ where: { id: promo.id }, data: { used: { increment: 1 } } });
    }
    for (const item of items) {
      await tx.ticketType.update({ where: { id: item.ticketTypeId }, data: { reserved: { increment: item.qty } } });
    }
    return tx.ticketOrder.create({
      data: {
        id: uuidv7(),
        eventId: event.id,
        buyerName: input.buyerName.trim(),
        buyerEmail: input.buyerEmail.trim(),
        buyerPhone: input.buyerPhone?.trim() || null,
        items: items.map((item) => ({ ...item, unitMinor: item.unitMinor.toString() })),
        subtotalMinor: subtotal,
        discountMinor: discount,
        feeMinor: 0n,
        totalMinor: total,
        currency: event.currency,
        status: 'RESERVED',
        reservedUntil,
        promoCodeId: promo?.id ?? null,
        answers,
      },
    });
  });

  return {
    orderId: order.id,
    totalMinor: total.toString(),
    free: total === 0n,
    reservedUntil: reservedUntil.toISOString(),
  };
}

/** Issue the Ticket rows for a paid/free order (internal: call inside the order's transaction). */
export async function issueTicketsForOrder(
  tx: Prisma.TransactionClient,
  order: { id: string; eventId: string; buyerName: string; buyerEmail: string | null; items: unknown },
  secret: string,
): Promise<string[]> {
  const items = order.items as ReservationItem[] & { unitMinor: string | bigint }[];
  const ids: string[] = [];
  for (const item of items) {
    for (let n = 0; n < item.qty; n++) {
      const id = uuidv7();
      // qrToken doubles as the signed check-in value (P11-T05/T08): the
      // scanner verifies the HMAC offline, then confirms the row online.
      const qrToken = ticketQrValue(id, order.eventId, secret);
      await tx.ticket.create({
        data: {
          id,
          orderId: order.id,
          ticketTypeId: item.ticketTypeId,
          eventId: order.eventId,
          holderName: order.buyerName,
          holderEmail: order.buyerEmail,
          qrToken,
        },
      });
      ids.push(id);
    }
  }
  return ids;
}

/** Free tickets issue instantly (UF-22-3). Idempotent: a PAID order returns its tickets. */
export async function confirmFreeOrder(orderId: string, secret: string) {
  const order = await prisma.ticketOrder.findUniqueOrThrow({ where: { id: orderId } });
  if (order.status === 'PAID') {
    return { orderId, tickets: (await prisma.ticket.findMany({ where: { orderId } })).map((ticket) => ticket.id) };
  }
  if (order.status !== 'RESERVED') throw new ConflictError('This order is no longer reserved', { key: 'notReserved' });
  if (order.totalMinor !== 0n) throw new ConflictError('This order needs payment', { key: 'needsPayment' });
  if (order.reservedUntil <= new Date()) {
    await expireReservations(new Date());
    throw new ConflictError('The reservation expired — please try again', { key: 'expired' });
  }
  await prisma.$transaction(async (tx) => {
    const locked: { id: string; quantity: number; sold: number; reserved: number }[] = await tx.$queryRaw`
      SELECT id, quantity, sold, reserved FROM "TicketType"
      WHERE "eventId" = ${order.eventId} ORDER BY id FOR UPDATE`;
    void locked;
    await tx.ticketOrder.update({ where: { id: order.id }, data: { status: 'PAID' } });
    const items = order.items as { ticketTypeId: string; qty: number }[];
    for (const item of items) {
      await tx.ticketType.update({
        where: { id: item.ticketTypeId },
        data: { reserved: { decrement: item.qty }, sold: { increment: item.qty } },
      });
    }
    await issueTicketsForOrder(tx, { ...order, items: order.items }, secret);
  });
  await audit(prisma, {
    actor: { kind: 'system' },
    action: 'tickets.order.paid',
    targetType: 'TicketOrder',
    targetId: order.id,
  });
  const tickets = await prisma.ticket.findMany({ where: { orderId } });
  return { orderId, tickets: tickets.map((ticket) => ticket.id) };
}

/** Lean offline confirm (P11-T04/T05): the organiser collected the money outside Tiwa. */
export async function confirmTicketOrderOffline(actor: UserActor, orderId: string, secret: string) {
  const order = await prisma.ticketOrder.findUniqueOrThrow({ where: { id: orderId } });
  await requireEventAccess(actor, order.eventId, 'tickets.manage');
  if (order.status === 'PAID') {
    return { orderId, tickets: (await prisma.ticket.findMany({ where: { orderId } })).map((ticket) => ticket.id) };
  }
  if (order.status !== 'RESERVED') throw new ConflictError('This order is no longer reserved', { key: 'notReserved' });
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "TicketType" WHERE "eventId" = ${order.eventId} ORDER BY id FOR UPDATE`;
    await tx.ticketOrder.update({ where: { id: order.id }, data: { status: 'PAID' } });
    const items = order.items as { ticketTypeId: string; qty: number }[];
    for (const item of items) {
      await tx.ticketType.update({
        where: { id: item.ticketTypeId },
        data: { reserved: { decrement: item.qty }, sold: { increment: item.qty } },
      });
    }
    await issueTicketsForOrder(tx, { ...order, items: order.items }, secret);
  });
  await audit(prisma, { actor, action: 'tickets.order.confirm', targetType: 'TicketOrder', targetId: order.id });
  const tickets = await prisma.ticket.findMany({ where: { orderId } });
  return { orderId, tickets: tickets.map((ticket) => ticket.id) };
}

export async function cancelTicketOrder(actor: UserActor, orderId: string) {
  const order = await prisma.ticketOrder.findUniqueOrThrow({ where: { id: orderId } });
  const access = await requireEventAccess(actor, order.eventId, 'tickets.manage').catch(() => null);
  const ownOrder =
    access !== null ||
    (actor.kind === 'user' &&
      (await prisma.eventParticipant.findFirst({
        where: { eventId: order.eventId, userId: actor.userId, removedAt: null },
      })));
  if (!ownOrder) throw new ForbiddenError('Only the organiser manages orders');
  if (order.status !== 'RESERVED')
    throw new ConflictError('Only reserved orders can be cancelled', { key: 'notReserved' });
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "TicketType" WHERE "eventId" = ${order.eventId} ORDER BY id FOR UPDATE`;
    await tx.ticketOrder.update({ where: { id: order.id }, data: { status: 'CANCELLED' } });
    const items = order.items as { ticketTypeId: string; qty: number }[];
    for (const item of items) {
      await tx.ticketType.update({ where: { id: item.ticketTypeId }, data: { reserved: { decrement: item.qty } } });
    }
    if (order.promoCodeId)
      await tx.promoCode.update({ where: { id: order.promoCodeId }, data: { used: { decrement: 1 } } });
  });
  await audit(prisma, { actor, action: 'tickets.order.cancel', targetType: 'TicketOrder', targetId: order.id });
  return { cancelled: true as const };
}

/** Release unpaid reservations (worker `tickets/expire-reservations`, every minute; UF-22-2). Idempotent. */
export async function expireReservations(now = new Date()) {
  const stale = await prisma.ticketOrder.findMany({
    where: { status: 'RESERVED', reservedUntil: { lt: now } },
    select: { id: true, eventId: true, items: true, promoCodeId: true },
    take: 200,
  });
  let expired = 0;
  for (const order of stale) {
    try {
      await prisma.$transaction(async (tx) => {
        const current = await tx.ticketOrder.findUniqueOrThrow({ where: { id: order.id } });
        if (current.status !== 'RESERVED') return;
        await tx.$queryRaw`SELECT id FROM "TicketType" WHERE "eventId" = ${order.eventId} ORDER BY id FOR UPDATE`;
        await tx.ticketOrder.update({ where: { id: order.id }, data: { status: 'EXPIRED' } });
        const items = order.items as { ticketTypeId: string; qty: number }[];
        for (const item of items) {
          await tx.ticketType.update({ where: { id: item.ticketTypeId }, data: { reserved: { decrement: item.qty } } });
        }
        if (order.promoCodeId) {
          await tx.promoCode.update({ where: { id: order.promoCodeId }, data: { used: { decrement: 1 } } });
        }
      });
      expired++;
    } catch {
      // A concurrent confirm won the race — the order is PAID, nothing to free.
    }
  }
  return { expired };
}

export async function joinWaitlist(raw: z.input<typeof waitlistSchema>) {
  const input = waitlistSchema.parse(raw);
  const event = await prisma.event.findUnique({ where: { slug: input.eventSlug } });
  if (!event || event.deletedAt || !event.ticketsEnabled) throw new NotFoundError('Event not found');
  const entry = await prisma.waitlistEntry.create({
    data: {
      id: uuidv7(),
      eventId: event.id,
      email: input.email.trim(),
      name: input.name?.trim() || null,
      qty: input.qty,
    },
  });
  return { waitlistId: entry.id };
}
