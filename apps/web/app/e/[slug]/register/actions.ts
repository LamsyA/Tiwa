'use server';

import { confirmFreeOrder, joinWaitlist, reserveTickets, reserveTicketsSchema, waitlistSchema } from '@tiwa/core';
import { env } from '@tiwa/config';
import { z } from 'zod';
import { action } from '@/lib/ctx.js';
import { emailSender } from '@/lib/auth.js';

const secret = () => env.AUTH_SECRET || 'dev-secret';

/** Public reservation (TKT-05, UF-22): no account needed. */
export const reserveAction = action(reserveTicketsSchema, async (input) => {
  const result = await reserveTickets(input);
  if (result.free) {
    const confirmed = await confirmFreeOrder(result.orderId, secret());
    // Lean delivery: email the ticket link inline (no worker needed for one email).
    try {
      const order = await import('@tiwa/db').then((m) =>
        m.prisma.ticketOrder.findUniqueOrThrow({ where: { id: result.orderId } }),
      );
      const base = env.APP_URL.replace(/\/$/, '');
      await emailSender.send({
        to: order.buyerEmail,
        subject: 'Your tickets',
        html: `<p>Your tickets are confirmed. View them here: <a href="${base}/t/${confirmed.tickets[0]}">${base}/t/${confirmed.tickets[0]}</a></p>`,
      });
    } catch {
      // Delivery is best-effort; the tickets page always shows the QR.
    }
    return { ...result, tickets: confirmed.tickets };
  }
  return { ...result, tickets: [] as string[] };
});

export const confirmFreeAction = action(z.object({ orderId: z.string().uuid() }), async (input) => {
  const confirmed = await confirmFreeOrder(input.orderId, secret());
  return confirmed;
});

export const waitlistAction = action(waitlistSchema, async (input) => joinWaitlist(input));
