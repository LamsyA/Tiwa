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

/** Each side opens the booking on its own page. */
const hostBookingUrl = (eventId: string, bookingId: string) => `/events/${eventId}/bookings/${bookingId}`;
const vendorBookingUrl = (bookingId: string) => `/bookings/${bookingId}`;

async function changeContext(versionId: string) {
  return prisma.bookingVersion.findUnique({
    where: { id: versionId },
    select: {
      version: true,
      reason: true,
      totalMinor: true,
      proposedById: true,
      booking: {
        select: {
          id: true,
          eventId: true,
          vendorOrgId: true,
          category: true,
          totalMinor: true,
          currency: true,
          event: { select: { name: true } },
        },
      },
    },
  });
}

function changeBody(row: NonNullable<Awaited<ReturnType<typeof changeContext>>>): string {
  const diff = row.totalMinor - row.booking.totalMinor;
  const money =
    diff === 0n ? '' : ` · ${diff > 0n ? '+' : '−'}${displayAmount(diff > 0n ? diff : -diff, row.booking.currency)}`;
  const reason = row.reason ? ` · “${row.reason.slice(0, 80)}”` : '';
  return `${row.booking.event.name}${money}${reason}`;
}

/** Change requested → the other side decides. */
export async function handleChangeRequested(data: unknown, log: Log) {
  const versionId = asString(asRecord(data).versionId);
  if (!versionId) throw new Error('booking.change_requested needs versionId');
  const row = await changeContext(versionId);
  if (!row) return { missing: true as const };
  const vendorTeam = await orgMemberUserIds(row.booking.vendorOrgId);
  const byVendor = vendorTeam.includes(row.proposedById);
  return fanout(
    {
      userIds: byVendor ? await teamUserIds(row.booking.eventId) : vendorTeam,
      type: 'booking.changed',
      title: byVendor ? 'Vendor asked to change the booking' : 'Client asked for a change',
      body: changeBody(row),
      url: byVendor ? hostBookingUrl(row.booking.eventId, row.booking.id) : vendorBookingUrl(row.booking.id),
      data: { bookingId: row.booking.id, eventId: row.booking.eventId },
      key: `chg-req:${versionId}`,
    },
    log,
  );
}

/** Change declined → whoever asked hears back. */
export async function handleChangeDeclined(data: unknown, log: Log) {
  const versionId = asString(asRecord(data).versionId);
  if (!versionId) throw new Error('booking.change_declined needs versionId');
  const row = await changeContext(versionId);
  if (!row) return { missing: true as const };
  const vendorTeam = await orgMemberUserIds(row.booking.vendorOrgId);
  const byVendor = vendorTeam.includes(row.proposedById);
  return fanout(
    {
      userIds: byVendor ? vendorTeam : await teamUserIds(row.booking.eventId),
      type: 'booking.changed',
      title: 'Change request declined',
      body: `${row.booking.event.name} · v${row.version}`,
      url: byVendor ? vendorBookingUrl(row.booking.id) : hostBookingUrl(row.booking.eventId, row.booking.id),
      data: { bookingId: row.booking.id, eventId: row.booking.eventId },
      key: `chg-dec:${versionId}`,
    },
    log,
  );
}

/** Booking changed → both sides see it, each with a link to their own booking page. */
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
  const key = `booking:${asString(payload.versionId) ?? bookingId}`;
  const common = {
    type: 'booking.changed',
    title: 'Booking updated',
    body: `${booking.event.name} · ${booking.category}`,
    data: { bookingId, eventId },
    key,
  };
  const host = await fanout({ ...common, userIds: team, url: hostBookingUrl(eventId, bookingId) }, log);
  const vendor = await fanout(
    { ...common, userIds: vendorTeam.filter((id) => !team.includes(id)), url: vendorBookingUrl(bookingId) },
    log,
  );
  return { notified: host.notified + vendor.notified, skipped: host.skipped + vendor.skipped };
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
