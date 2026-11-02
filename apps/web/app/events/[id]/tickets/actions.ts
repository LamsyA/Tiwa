'use server';

import {
  cancelTicketOrder,
  confirmTicketOrderOffline,
  createPromo,
  createTicketType,
  deletePromo,
  deletePromoSchema,
  deleteTicketType,
  deleteTicketTypeSchema,
  orderIdSchema,
  promoSchema,
  ticketTypeSchema,
  updateTicketType,
  updateTicketTypeSchema,
  updateTicketsSettings,
  ticketsSettingsSchema,
} from '@tiwa/core';
import { env } from '@tiwa/config';
import { revalidatePath } from 'next/cache';
import { userAction } from '@/lib/ctx.js';

function revalidate(eventId: string) {
  revalidatePath(`/events/${eventId}/tickets`);
  revalidatePath(`/events/${eventId}`, 'layout');
}

export const createTypeAction = userAction(ticketTypeSchema, async (input, ctx) => {
  const result = await createTicketType(ctx.actor, input);
  revalidate(input.eventId);
  return result;
});

export const updateTypeAction = userAction(updateTicketTypeSchema, async (input, ctx) => {
  const type = await updateTicketType(ctx.actor, input);
  const eventId = (
    await import('@tiwa/db').then((m) =>
      m.prisma.ticketType.findUniqueOrThrow({ where: { id: type.ticketTypeId }, select: { eventId: true } }),
    )
  ).eventId;
  revalidate(eventId);
  return type;
});

export const deleteTypeAction = userAction(deleteTicketTypeSchema, async (input, ctx) => {
  const eventId = (
    await import('@tiwa/db').then((m) =>
      m.prisma.ticketType.findUniqueOrThrow({ where: { id: input.ticketTypeId }, select: { eventId: true } }),
    )
  ).eventId;
  const result = await deleteTicketType(ctx.actor, input);
  revalidate(eventId);
  return result;
});

export const createPromoAction = userAction(promoSchema, async (input, ctx) => {
  const result = await createPromo(ctx.actor, input);
  revalidate(input.eventId);
  return result;
});

export const deletePromoAction = userAction(deletePromoSchema, async (input, ctx) => {
  const eventId = (
    await import('@tiwa/db').then((m) =>
      m.prisma.promoCode.findUniqueOrThrow({ where: { id: input.promoId }, select: { eventId: true } }),
    )
  ).eventId;
  const result = await deletePromo(ctx.actor, input);
  revalidate(eventId);
  return result;
});

export const saveTicketsSettings = userAction(ticketsSettingsSchema, async (input, ctx) => {
  const result = await updateTicketsSettings(ctx.actor, input);
  revalidate(input.eventId);
  return result;
});

export const confirmOrderOfflineAction = userAction(orderIdSchema, async (input, ctx) => {
  const result = await confirmTicketOrderOffline(ctx.actor, input.orderId, env.AUTH_SECRET || 'dev-secret');
  const eventId = (
    await import('@tiwa/db').then((m) =>
      m.prisma.ticketOrder.findUniqueOrThrow({ where: { id: input.orderId }, select: { eventId: true } }),
    )
  ).eventId;
  revalidate(eventId);
  return result;
});

export const cancelOrderAction = userAction(orderIdSchema, async (input, ctx) => {
  const result = await cancelTicketOrder(ctx.actor, input.orderId);
  const eventId = await import('@tiwa/db').then((m) =>
    m.prisma.ticketOrder
      .findUniqueOrThrow({ where: { id: input.orderId }, select: { eventId: true } })
      .catch(() => null),
  );
  if (eventId) revalidate(eventId.eventId);
  return result;
});
