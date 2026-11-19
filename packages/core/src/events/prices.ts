import { prisma } from '@tiwa/db';
import { z } from 'zod';
import type { Actor, EventAccess } from '../auth/authorize.js';
import { ForbiddenError } from '../shared/errors.js';
import { requireEventAccess } from './access.js';

// Vendor-price visibility. D-X98 removed the planner's "hide prices from the
// host" switch: everyone on the event's client side sees full figures.

type UserActor = Extract<Actor, { kind: 'user' }>;

/**
 * D-X98: the host always sees every vendor price, quote line, booking total and
 * payment amount — the host pays, so they can see what the money was used for.
 * The old planner switch (EVT-12) is gone; this stays as the single rule every
 * read path asks, and it never hides anything now.
 */
export function pricesHiddenFor(_access: EventAccess, _hostCanSeeVendorPrices?: boolean): boolean {
  return false;
}

/** Kept for callers that batch it with other reads; prices are always visible (D-X98). */
export async function priceVisibilityFor(_eventId: string): Promise<boolean> {
  return true;
}

// ── Server-side redaction (nothing hidden may reach the browser) ──

export interface RedactedQuote {
  items: unknown[];
  taxBps: number | null;
  serviceBps: number | null;
  travelFeeMinor: string | null;
  subtotalMinor: string | null;
  totalMinor: string | null;
  pricesHidden: true;
}

/** Quote totals and line items (which carry unit prices) are vendor prices. */
export function redactQuote<T extends { items: unknown }>(quote: T): T & RedactedQuote {
  return {
    ...quote,
    items: [],
    taxBps: null,
    serviceBps: null,
    travelFeeMinor: null,
    subtotalMinor: null,
    totalMinor: null,
    pricesHidden: true as const,
  };
}

export interface RedactedBooking {
  totalMinor: string | null;
  pricesHidden: true;
}

/** Booking totals, version scopes/totals and milestone amounts are vendor prices. */
export function redactBooking<T extends object>(booking: T): T & RedactedBooking {
  const base = booking as Record<string, unknown>;
  const versions = Array.isArray(base['versions']) ? (base['versions'] as unknown[]) : [];
  const milestones = Array.isArray(base['milestones']) ? (base['milestones'] as unknown[]) : [];
  return {
    ...booking,
    totalMinor: null,
    versions: versions.map((version) => ({ ...(version as object), totalMinor: null, scope: null })),
    milestones: milestones.map((milestone) => ({ ...(milestone as object), amountMinor: null })),
    pricesHidden: true as const,
  };
}

// D-X73: the guest list belongs to the host. A hired planner may add, edit and
// invite guests only after the host switches this on (default off).
export const setPlannerGuestsSchema = z.object({ eventId: z.string().uuid(), allowed: z.boolean() });

export async function setPlannerManagesGuests(actor: UserActor, raw: z.input<typeof setPlannerGuestsSchema>) {
  const input = setPlannerGuestsSchema.parse(raw);
  const access = await requireEventAccess(actor, input.eventId, 'event.edit');
  if (access.role !== 'HOST') throw new ForbiddenError('Only the host decides this', { reason: 'host-only' });
  return prisma.event.update({
    where: { id: input.eventId },
    data: { plannerManagesGuests: input.allowed },
    select: { id: true, plannerManagesGuests: true },
  });
}
