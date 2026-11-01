import { prisma } from '@tiwa/db';
import { z } from 'zod';
import type { Actor } from '../auth/authorize.js';
import { authorizeOrg } from '../auth/org.js';
import { NotFoundError } from '../shared/errors.js';
import { bookingMoney } from '../payments/status.js';

// Vendor home dashboard (VND-01–VND-06, P10-T08). One call, parallel reads:
// open enquiries, upcoming bookings with payment status, availability blocks,
// and double-booking warnings (same date with 2+ confirmed bookings).

type UserActor = Extract<Actor, { kind: 'user' }>;

export const vendorDashboardSchema = z.object({ orgId: z.string().uuid() });

export interface VendorDashboard {
  orgId: string;
  orgName: string;
  needsToday: { openEnquiries: number; upcomingBookings: number; awaitingPayment: number; overdueTasks: number };
  upcomingBookings: {
    id: string;
    eventName: string;
    startsAt: string | null;
    status: string;
    securedMinor: string;
    awaitingMinor: string;
    outstandingMinor: string;
  }[];
  doubleBookingWarnings: { date: string; bookingIds: string[] }[];
  blockedDates: { date: string; slot: string }[];
}

async function requireVendor(actor: UserActor, orgId: string, action: 'org.view' | 'org.manage') {
  const [membership, org] = await Promise.all([
    prisma.membership.findUnique({ where: { orgId_userId: { orgId, userId: actor.userId } } }),
    prisma.organization.findUnique({ where: { id: orgId }, select: { kind: true, name: true } }),
  ]);
  if (!org || org.kind !== 'VENDOR') throw new NotFoundError('Organisation not found');
  authorizeOrg(actor, action, orgId, membership ? { orgId, role: membership.role } : null);
  return org;
}

export async function vendorDashboard(
  actor: UserActor,
  raw: z.input<typeof vendorDashboardSchema>,
  now = new Date(),
): Promise<VendorDashboard> {
  const input = vendorDashboardSchema.parse(raw);
  const org = await requireVendor(actor, input.orgId, 'org.view');

  const [openEnquiries, bookings, blocks] = await Promise.all([
    prisma.quoteRequest.count({ where: { vendorOrgId: input.orgId, status: 'OPEN' } }),
    prisma.booking.findMany({
      where: { vendorOrgId: input.orgId, status: { notIn: ['CANCELLED', 'COMPLETED'] } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        status: true,
        serviceDate: true,
        event: { select: { name: true, startsAt: true } },
        milestones: { select: { state: true, amountMinor: true } },
      },
    }),
    prisma.availabilityBlock.findMany({
      where: { orgId: input.orgId, date: { gte: now } },
      orderBy: { date: 'asc' },
      take: 60,
      select: { date: true, slot: true },
    }),
  ]);

  const upcoming = bookings.slice(0, 10).map((b) => {
    const money = bookingMoney(b.milestones);
    return {
      id: b.id,
      eventName: b.event.name,
      startsAt: (b.serviceDate ?? b.event.startsAt)?.toISOString() ?? null,
      status: b.status,
      securedMinor: money.securedMinor.toString(),
      awaitingMinor: money.awaitingMinor.toString(),
      outstandingMinor: money.outstandingMinor.toString(),
    };
  });

  // Double-booking warning: same service date on 2+ active bookings.
  const byDate = new Map<string, string[]>();
  for (const b of bookings) {
    const key = b.serviceDate?.toISOString().slice(0, 10);
    if (!key) continue;
    const list = byDate.get(key) ?? [];
    list.push(b.id);
    byDate.set(key, list);
  }
  const doubleBookingWarnings = [...byDate.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([date, bookingIds]) => ({ date, bookingIds }));

  const awaitingPayment = bookings.filter((b) => {
    const money = bookingMoney(b.milestones);
    return money.awaitingMinor > 0n || money.outstandingMinor > 0n;
  }).length;

  return {
    orgId: input.orgId,
    orgName: org.name,
    needsToday: { openEnquiries, upcomingBookings: bookings.length, awaitingPayment, overdueTasks: 0 },
    upcomingBookings: upcoming,
    doubleBookingWarnings,
    blockedDates: blocks.map((b) => ({ date: b.date.toISOString().slice(0, 10), slot: b.slot })),
  };
}
