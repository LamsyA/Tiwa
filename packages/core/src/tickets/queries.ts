// Public + organiser reads for tickets (P11-T03/T05; Frontend.md §6.2).
import { ticketsVisibility } from '@tiwa/config';
import { prisma } from '@tiwa/db';
import type { Actor } from '../auth/authorize.js';
import { requireEventAccess } from '../events/access.js';
import { NotFoundError } from '../shared/errors.js';

type UserActor = Extract<Actor, { kind: 'user' }>;

/** Published public event page (`/e/[slug]`, rendered dynamically per D-X31/D-X18): no contact details, ever. */
export async function getPublicEvent(slug: string) {
  const event = await prisma.event.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      coverKey: true,
      themeColor: true,
      timezone: true,
      startsAt: true,
      endsAt: true,
      currency: true,
      status: true,
      visibility: true,
      ticketsEnabled: true,
      ticketsPublished: true,
      registrationQuestions: true,
      createdBy: { select: { name: true } },
      days: {
        orderBy: { sortOrder: 'asc' },
        select: { date: true, title: true, venueName: true, address: true },
      },
      programme: {
        where: { isPublic: true },
        orderBy: [{ startsAt: 'asc' }, { sortOrder: 'asc' }],
        select: { id: true, title: true, startsAt: true, endsAt: true, room: true, speakers: true },
        take: 100,
      },
    },
  });
  if (
    !event ||
    event.status !== 'ACTIVE' ||
    !ticketsVisibility(event.visibility) ||
    !event.ticketsEnabled ||
    !event.ticketsPublished
  ) {
    throw new NotFoundError('Event not found');
  }
  const now = new Date();
  const types = await prisma.ticketType.findMany({
    where: { eventId: event.id },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      name: true,
      description: true,
      priceMinor: true,
      currency: true,
      quantity: true,
      sold: true,
      reserved: true,
      maxPerOrder: true,
      salesStart: true,
      salesEnd: true,
    },
  });
  return {
    event: { ...event, registrationQuestions: (event.registrationQuestions ?? []) as unknown[] },
    types: types.map((type) => ({
      ...type,
      priceMinor: type.priceMinor.toString(),
      available: Math.max(0, type.quantity - type.sold - type.reserved),
      onSale: (!type.salesStart || type.salesStart <= now) && (!type.salesEnd || type.salesEnd > now),
    })),
  };
}

export async function getOrderForBuyer(orderId: string) {
  const order = await prisma.ticketOrder.findUniqueOrThrow({ where: { id: orderId } });
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: order.eventId },
    select: { name: true, slug: true, timezone: true, startsAt: true, currency: true },
  });
  const tickets = await prisma.ticket.findMany({ where: { orderId }, select: { id: true, holderName: true } });
  return {
    order: {
      ...order,
      subtotalMinor: order.subtotalMinor.toString(),
      discountMinor: order.discountMinor.toString(),
      feeMinor: order.feeMinor.toString(),
      totalMinor: order.totalMinor.toString(),
      items: order.items as unknown[],
    },
    event,
    tickets,
  };
}

/** Organiser order list (tickets.manage): buyer contacts stay server-side. */
export async function listTicketOrders(actor: UserActor, eventId: string) {
  await requireEventAccess(actor, eventId, 'tickets.manage');
  return prisma.ticketOrder.findMany({
    where: { eventId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      buyerName: true,
      buyerEmail: true,
      status: true,
      totalMinor: true,
      createdAt: true,
      reservedUntil: true,
    },
  });
}

/** Single ticket view (`/t/[ticketId]`): the stored signed QR is served. */
export async function ticketView(ticketId: string) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new NotFoundError('Ticket not found');
  const order = await prisma.ticketOrder.findUniqueOrThrow({ where: { id: ticket.orderId } });
  if (order.status !== 'PAID') throw new NotFoundError('Ticket not found');
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: ticket.eventId },
    select: { name: true, slug: true, timezone: true, startsAt: true, endsAt: true },
  });
  return { ticket, order: { id: order.id, buyerName: order.buyerName }, event, qr: ticket.qrToken };
}

/** Paid ticket revenue for the budget income tab (D-D05; P9 reads this in P11-T05). */
export async function ticketIncome(eventId: string): Promise<bigint> {
  const paid = await prisma.ticketOrder.aggregate({
    where: { eventId, status: 'PAID' },
    _sum: { totalMinor: true },
  });
  return paid._sum.totalMinor ?? 0n;
}

/**
 * What a visitor sees when the ticket page isn't live yet (instead of a bare
 * 404): the event's name and date, and why. Private events stay hidden.
 */
export async function publicEventPreview(slug: string) {
  const event = await prisma.event.findUnique({
    where: { slug },
    select: {
      name: true,
      startsAt: true,
      timezone: true,
      status: true,
      visibility: true,
      ticketsEnabled: true,
      ticketsPublished: true,
    },
  });
  if (!event || !ticketsVisibility(event.visibility) || event.status === 'CANCELLED') return null;
  return {
    name: event.name,
    startsAt: event.startsAt,
    timezone: event.timezone,
    reason: event.status === 'COMPLETED' ? ('ended' as const) : ('notOnSale' as const),
  };
}

/**
 * D-X110: where a buyer sends money for a paid ticket order: the planner
 * running the event, else a business the organiser owns, else nothing.
 * Bank-confirmed accounts only show the full number (D-X103).
 */
export async function ticketOrderPayee(orderId: string) {
  const order = await prisma.ticketOrder.findUnique({
    where: { id: orderId },
    select: { id: true, eventId: true, status: true, totalMinor: true, reservedUntil: true, buyerName: true },
  });
  if (!order) return null;
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: order.eventId },
    select: { name: true, slug: true, currency: true, countryCode: true, createdById: true },
  });
  const planner = await prisma.eventParticipant.findFirst({
    where: { eventId: order.eventId, role: 'PLANNER', removedAt: null, orgId: { not: null } },
    select: { orgId: true },
  });
  const owned = planner?.orgId
    ? null
    : await prisma.membership.findFirst({
        where: {
          userId: event.createdById,
          role: 'OWNER',
          org: { kind: { in: ['PLANNER', 'VENDOR'] }, deletedAt: null },
        },
        select: { orgId: true },
      });
  const orgId = planner?.orgId ?? owned?.orgId ?? null;
  const account = orgId
    ? await prisma.bankAccount.findFirst({
        where: { orgId, isDefault: true, accountNumber: { not: null } },
        select: { bankCode: true, accountNumber: true, accountName: true, verifiedAt: true },
      })
    : null;
  const org = orgId ? await prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } }) : null;
  return {
    order: { ...order, totalMinor: order.totalMinor.toString(), reference: order.id.slice(-8).toUpperCase() },
    event,
    payee: account
      ? {
          orgName: org?.name ?? '',
          bankCode: account.bankCode,
          accountNumber: account.accountNumber as string,
          accountName: account.accountName,
          verified: account.verifiedAt !== null,
        }
      : null,
  };
}
