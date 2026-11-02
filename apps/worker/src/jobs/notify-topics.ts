import { alreadyNotified, createLogger, notify, orgMemberUserIds, teamUserIds } from '@tiwa/core';
import { prisma } from '@tiwa/db';

type Log = ReturnType<typeof createLogger>;

const SYSTEM = { kind: 'system' } as const;

/** Earlier outbox stubs fanned out through `notify()` (P13-T04): P3 task
 * deadlines (via the scheduled job), P8 offline payments, P12 run-of-show
 * alerts, plus the adjacent quote/booking topics that had no consumer at
 * all. Every fan-out carries a dedupe key so outbox retries and hourly
 * re-scans never double-notify. Bodies carry names and amounts the
 * recipient already owns — never contact details. */

// Display only (integer math; storage stays in minor units per AGENTS.md §4).
function displayAmount(minor: bigint, currency: string): string {
  const raw = minor.toString().padStart(3, '0');
  const whole = raw.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ',') || '0';
  const frac = raw.slice(-2);
  return frac === '00' ? `${currency} ${whole}` : `${currency} ${whole}.${frac}`;
}

interface Fanout {
  userIds: string[];
  type: string;
  title: string;
  body: string;
  url: string;
  data: Record<string, string | number | boolean | null>;
  key: string;
  urgent?: boolean;
}

async function fanout(input: Fanout, log: Log): Promise<{ notified: number; skipped: number }> {
  let notified = 0;
  let skipped = 0;
  for (const userId of [...new Set(input.userIds)]) {
    if (await alreadyNotified(userId, input.type, input.key)) {
      skipped += 1;
      continue;
    }
    await notify(SYSTEM, {
      userId,
      type: input.type,
      title: input.title,
      body: input.body,
      url: input.url,
      data: { ...input.data, key: input.key },
      urgent: input.urgent,
    });
    notified += 1;
  }
  log.info({ topic: input.type, notified, skipped, key: input.key }, 'stub fanned out through notify');
  return { notified, skipped };
}

function asRecord(data: unknown): Record<string, unknown> {
  return (data ?? {}) as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** P12 run-of-show alerts → dependant owners + the event team (DAY-02). */
export async function handleDayItemLate(data: unknown, log: Log) {
  const payload = asRecord(data);
  const eventId = asString(payload.eventId);
  const itemId = asString(payload.itemId);
  if (!eventId || !itemId) throw new Error('day.item_late needs eventId + itemId');
  const [item, event] = await Promise.all([
    prisma.runItem.findUnique({ where: { id: itemId }, select: { title: true } }),
    prisma.event.findUnique({ where: { id: eventId }, select: { name: true } }),
  ]);
  if (!item || !event) return { missing: true as const };
  const ownerUserIds = Array.isArray(payload.ownerUserIds)
    ? payload.ownerUserIds.filter((id): id is string => typeof id === 'string')
    : [];
  const ownerOrgIds = Array.isArray(payload.ownerOrgIds)
    ? payload.ownerOrgIds.filter((id): id is string => typeof id === 'string')
    : [];
  const orgMembers = (await Promise.all(ownerOrgIds.map((orgId) => orgMemberUserIds(orgId)))).flat();
  const team = await teamUserIds(eventId);
  const lateByMin = typeof payload.lateByMin === 'number' ? payload.lateByMin : 0;
  const dependants = Array.isArray(payload.dependantIds) ? payload.dependantIds.length : 0;
  return fanout(
    {
      userIds: [...ownerUserIds, ...orgMembers, ...team],
      type: 'day.item_late',
      title: `Running late: ${item.title}`,
      body: `${event.name} · +${lateByMin}m${dependants > 0 ? ` · ${dependants} waiting on it` : ''}`,
      url: `/events/${eventId}/day`,
      data: { eventId, itemId },
      key: `daylate:${itemId}:${lateByMin}`,
      urgent: true,
    },
    log,
  );
}

/** P12 incident raised → the incident owner + the event team. */
export async function handleDayIncidentRaised(data: unknown, log: Log) {
  const payload = asRecord(data);
  const eventId = asString(payload.eventId);
  const incidentId = asString(payload.incidentId);
  if (!eventId || !incidentId) throw new Error('day.incident_raised needs eventId + incidentId');
  const [incident, event] = await Promise.all([
    prisma.incident.findUnique({ where: { id: incidentId }, select: { title: true } }),
    prisma.event.findUnique({ where: { id: eventId }, select: { name: true } }),
  ]);
  if (!incident || !event) return { missing: true as const };
  const ownerUserIds = Array.isArray(payload.ownerUserIds)
    ? payload.ownerUserIds.filter((id): id is string => typeof id === 'string')
    : [];
  const team = await teamUserIds(eventId);
  return fanout(
    {
      userIds: [...ownerUserIds, ...team],
      type: 'day.incident_raised',
      title: `Incident: ${incident.title}`,
      body: event.name,
      url: `/events/${eventId}/day`,
      data: { eventId, incidentId },
      key: `incident:${incidentId}`,
      urgent: true,
    },
    log,
  );
}

/** P12 delivery sign-off prompt → the event team. */
export async function handleDaySignoffDue(data: unknown, log: Log) {
  const payload = asRecord(data);
  const eventId = asString(payload.eventId);
  const bookingId = asString(payload.bookingId);
  if (!eventId || !bookingId) throw new Error('day.signoff_due needs eventId + bookingId');
  const [booking, event] = await Promise.all([
    prisma.booking.findUnique({
      where: { id: bookingId },
      select: { category: true, vendorOrgId: true },
    }),
    prisma.event.findUnique({ where: { id: eventId }, select: { name: true } }),
  ]);
  if (!booking || !event) return { missing: true as const };
  const vendor = await prisma.organization.findUnique({ where: { id: booking.vendorOrgId }, select: { name: true } });
  return fanout(
    {
      userIds: await teamUserIds(eventId),
      type: 'day.signoff_due',
      title: `Sign off ${booking.category}`,
      body: `${event.name} · ${vendor?.name ?? 'vendor'} — confirm delivery so the books close`,
      url: `/events/${eventId}/money`,
      data: { eventId, bookingId },
      key: `signoff:${bookingId}`,
    },
    log,
  );
}

/** P8 offline payment recorded → the vendor team confirms it. */
export async function handlePaymentRecorded(data: unknown, log: Log) {
  const payload = asRecord(data);
  const paymentId = asString(payload.paymentId);
  const bookingId = asString(payload.bookingId);
  const vendorOrgId = asString(payload.vendorOrgId);
  if (!paymentId || !bookingId || !vendorOrgId) throw new Error('payment.offline_recorded needs ids');
  const [payment, booking] = await Promise.all([
    prisma.payment.findUnique({ where: { id: paymentId }, select: { amountMinor: true, currency: true } }),
    prisma.booking.findUnique({
      where: { id: bookingId },
      select: { category: true, event: { select: { id: true, name: true } } },
    }),
  ]);
  if (!payment || !booking) return { missing: true as const };
  return fanout(
    {
      userIds: await orgMemberUserIds(vendorOrgId),
      type: 'payment.received',
      title: 'Payment recorded — please confirm',
      body: `${booking.event.name} · ${booking.category} · ${displayAmount(payment.amountMinor, payment.currency)}`,
      url: '/bookings',
      data: { paymentId, bookingId },
      key: `payrec:${paymentId}`,
    },
    log,
  );
}

/** P8 offline payment confirmed/declined → the event team. */
async function handlePaymentAnswered(
  data: unknown,
  log: Log,
  topic: 'payment.offline_confirmed' | 'payment.offline_declined',
): Promise<{ notified: number; skipped: number } | { missing: true }> {
  const payload = asRecord(data);
  const paymentId = asString(payload.paymentId);
  const bookingId = asString(payload.bookingId);
  if (!paymentId || !bookingId) throw new Error(`${topic} needs paymentId + bookingId`);
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { eventId: true, category: true, event: { select: { name: true } } },
  });
  if (!booking) return { missing: true as const };
  const confirmed = topic === 'payment.offline_confirmed';
  return fanout(
    {
      userIds: await teamUserIds(booking.eventId),
      type: confirmed ? 'payment.received' : 'payment.failed',
      title: confirmed ? 'Payment confirmed' : 'Payment not received',
      body: `${booking.event.name} · ${booking.category}`,
      url: `/events/${booking.eventId}/money`,
      data: { paymentId, bookingId },
      key: `pay${confirmed ? 'conf' : 'dec'}:${paymentId}`,
      urgent: !confirmed,
    },
    log,
  );
}

export const handlePaymentConfirmed = (data: unknown, log: Log) =>
  handlePaymentAnswered(data, log, 'payment.offline_confirmed');
export const handlePaymentDeclined = (data: unknown, log: Log) =>
  handlePaymentAnswered(data, log, 'payment.offline_declined');

/** Booking changed → both sides see it. */
export async function handleBookingChanged(data: unknown, log: Log) {
  const payload = asRecord(data);
  const bookingId = asString(payload.bookingId);
  const eventId = asString(payload.eventId);
  const vendorOrgId = asString(payload.vendorOrgId);
  if (!bookingId || !eventId || !vendorOrgId) throw new Error('booking.changed needs ids');
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { category: true, event: { select: { name: true } } },
  });
  if (!booking) return { missing: true as const };
  const [team, vendorTeam] = await Promise.all([teamUserIds(eventId), orgMemberUserIds(vendorOrgId)]);
  return fanout(
    {
      userIds: [...team, ...vendorTeam],
      type: 'booking.changed',
      title: 'Booking updated',
      body: `${booking.event.name} · ${booking.category}`,
      url: `/events/${eventId}/vendors`,
      data: { bookingId, eventId },
      key: `booking:${asString(payload.versionId) ?? bookingId}`,
    },
    log,
  );
}

/** Quote requested → the vendor team; quote sent → the event team. */
export async function handleQuoteRequested(data: unknown, log: Log) {
  const payload = asRecord(data);
  const eventId = asString(payload.eventId);
  const vendorOrgId = asString(payload.vendorOrgId);
  if (!eventId || !vendorOrgId) throw new Error('quote.requested needs eventId + vendorOrgId');
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { name: true } });
  if (!event) return { missing: true as const };
  return fanout(
    {
      userIds: await orgMemberUserIds(vendorOrgId),
      type: 'booking.changed',
      title: 'New quote request',
      body: `${event.name} · ${asString(payload.category) ?? 'event'}`,
      url: '/quotes',
      data: { eventId, vendorOrgId },
      key: `qr:${asString(payload.quoteRequestId) ?? `${eventId}:${vendorOrgId}`}`,
    },
    log,
  );
}

/** P14: a new review lands → the vendor team. */
export async function handleReviewReceived(data: unknown, log: Log) {
  const payload = asRecord(data);
  const reviewId = asString(payload.reviewId);
  if (!reviewId) throw new Error('review.received needs reviewId');
  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    select: { overall: true, vendorOrgId: true, bookingId: true },
  });
  if (!review) return { missing: true as const };
  const booking = await prisma.booking.findUnique({
    where: { id: review.bookingId },
    select: { eventId: true, event: { select: { name: true } } },
  });
  if (!booking) return { missing: true as const };
  return fanout(
    {
      userIds: await orgMemberUserIds(review.vendorOrgId),
      type: 'review.received',
      title: `New review: ${review.overall.toFixed(1)} / 5`,
      body: booking.event.name,
      url: '/orders',
      data: { reviewId, eventId: booking.eventId },
      key: `rev:${reviewId}`,
    },
    log,
  );
}

/** P14: a vendor reply lands → the event team. */
export async function handleReviewReplied(data: unknown, log: Log) {
  const payload = asRecord(data);
  const reviewId = asString(payload.reviewId);
  const eventId = asString(payload.eventId);
  if (!reviewId || !eventId) throw new Error('review.replied needs reviewId + eventId');
  const [review, event] = await Promise.all([
    prisma.review.findUnique({ where: { id: reviewId }, select: { vendorOrgId: true } }),
    prisma.event.findUnique({ where: { id: eventId }, select: { name: true } }),
  ]);
  if (!review || !event) return { missing: true as const };
  const vendor = await prisma.organization.findUnique({ where: { id: review.vendorOrgId }, select: { name: true } });
  return fanout(
    {
      userIds: await teamUserIds(eventId),
      type: 'review.replied',
      title: 'Vendor replied to your review',
      body: `${event.name} · ${vendor?.name ?? 'vendor'}`,
      url: `/events/${eventId}/close`,
      data: { reviewId, eventId },
      key: `revrep:${reviewId}`,
    },
    log,
  );
}

export async function handleQuoteSent(data: unknown, log: Log) {
  const payload = asRecord(data);
  const quoteId = asString(payload.quoteId);
  const eventId = asString(payload.eventId);
  const vendorOrgId = asString(payload.vendorOrgId);
  if (!quoteId || !eventId || !vendorOrgId) throw new Error('quote.sent needs ids');
  const [event, vendor] = await Promise.all([
    prisma.event.findUnique({ where: { id: eventId }, select: { name: true } }),
    prisma.organization.findUnique({ where: { id: vendorOrgId }, select: { name: true } }),
  ]);
  if (!event) return { missing: true as const };
  return fanout(
    {
      userIds: await teamUserIds(eventId),
      type: 'booking.changed',
      title: 'Quote received',
      body: `${event.name} · ${vendor?.name ?? 'vendor'}`,
      url: `/events/${eventId}/vendors`,
      data: { quoteId, eventId },
      key: `qs:${quoteId}`,
    },
    log,
  );
}
