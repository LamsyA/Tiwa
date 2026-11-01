import { prisma } from '@tiwa/db';
import { z } from 'zod';
import type { Actor, EventAccess } from '../auth/authorize.js';
import { ForbiddenError } from '../shared/errors.js';
import { requireEventAccess } from './access.js';

// Vendor-price visibility (EVT-12, D-P08, P10-T10). The planner decides
// whether the host side sees vendor-level prices. When hidden, host-side
// viewers (HOST, CO_HOST) get `pricesHidden: true` with every vendor amount
// nulled on the server — nothing reaches the browser to inspect. Planner
// roles, the vendor's own team and staff always see full figures.

type UserActor = Extract<Actor, { kind: 'user' }>;

export const setPriceVisibilitySchema = z.object({
  eventId: z.string().uuid(),
  visible: z.boolean(),
});

/** Host-side roles see redacted prices when the planner hides them. */
export function pricesHiddenFor(access: EventAccess, hostCanSeeVendorPrices: boolean): boolean {
  if (hostCanSeeVendorPrices) return false;
  return access.role === 'HOST' || access.role === 'CO_HOST';
}

/** Only the hired planner team may flip the switch — never the host side. */
export async function setVendorPriceVisibility(actor: UserActor, raw: z.input<typeof setPriceVisibilitySchema>) {
  const input = setPriceVisibilitySchema.parse(raw);
  const access = await requireEventAccess(actor, input.eventId, 'event.edit');
  if (access.role !== 'PLANNER' && access.role !== 'PLANNER_STAFF') {
    throw new ForbiddenError('Only the planner controls price visibility', { reason: 'planner-only' });
  }
  const event = await prisma.event.update({
    where: { id: input.eventId },
    data: { hostCanSeeVendorPrices: input.visible },
    select: { id: true, hostCanSeeVendorPrices: true },
  });
  return event;
}

/** Load the flag for an event (one indexed read; callers batch it with their other reads). */
export async function priceVisibilityFor(eventId: string): Promise<boolean> {
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    select: { hostCanSeeVendorPrices: true },
  });
  return event.hostCanSeeVendorPrices;
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
