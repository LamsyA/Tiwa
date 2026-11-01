import { prisma, type MilestoneState } from '@tiwa/db';
import { sniffMime, type Storage } from '@tiwa/storage';
import { z } from 'zod';
import { authorize, type Actor } from '../auth/authorize.js';
import { assertBookingTransition } from '../bookings/state.js';
import { loadEventAccess } from '../events/access.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../shared/errors.js';
import { uuidv7 } from '../shared/ids.js';
import { audit, enqueue } from '../shared/outbox.js';

// Offline payments (lean P8, D-X27; Backend.md §7.7, UF-17 step 5). The host
// side records "I paid outside Tiwa" → milestone RECORDED_OFFLINE + Payment
// PENDING; the booking's vendor team confirms → CONFIRMED_OFFLINE + Payment
// SUCCEEDED, and the first milestone confirms a DEPOSIT_DUE/ACCEPTED booking.
// The vendor can also say "not received", which puts the milestone back to
// SCHEDULED. Tiwa never touches this money.

type UserActor = Extract<Actor, { kind: 'user' }>;

export const OFFLINE_METHODS = ['bank_transfer', 'cash', 'pos', 'other'] as const;
export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
const RECEIPT_TYPES: Record<string, string> = {
  'image/jpeg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
  'image/heic': 'image/heic',
  'application/pdf': 'application/pdf',
};
const PAYABLE: MilestoneState[] = ['SCHEDULED', 'PENDING_PAYMENT'];

export const startReceiptSchema = z.object({
  milestoneId: z.string().uuid(),
  mime: z.string().refine((mime) => mime in RECEIPT_TYPES, 'typeNotAllowed'),
  sizeBytes: z.number().int().min(1, 'emptyFile').max(MAX_RECEIPT_BYTES, 'tooLarge'),
});

export const recordOfflineSchema = z.object({
  milestoneId: z.string().uuid(),
  amountMinor: z.string().regex(/^\d+$/, 'invalidAmount'),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'invalidDate'),
  method: z.enum(OFFLINE_METHODS),
  note: z.string().trim().max(500).optional(),
  receiptKey: z.string().max(200).optional(),
});

export const offlinePaymentIdSchema = z.object({ paymentId: z.string().uuid() });
export const vendorOrgSchema = z.object({ vendorOrgId: z.string().uuid() });

function receiptPrefix(bookingId: string): string {
  return `bookings/${bookingId}/receipts/`;
}

/** Host side of the booking (never a vendor or photographer on the event). */
async function loadForPayer(actor: UserActor, milestoneId: string) {
  const milestone = await prisma.paymentMilestone.findUnique({
    where: { id: milestoneId },
    include: { booking: true },
  });
  if (!milestone) throw new NotFoundError('Milestone not found');
  const access = await loadEventAccess(actor.userId, milestone.booking.eventId);
  if (!access || access.role === 'VENDOR' || access.role === 'PHOTOGRAPHER') {
    throw new NotFoundError('Milestone not found');
  }
  authorize(actor, 'payment.make', {
    eventId: milestone.booking.eventId,
    access,
    amountMinor: milestone.amountMinor,
  });
  return milestone;
}

/** A member of the booking's vendor organisation; everyone else gets NOT_FOUND. */
async function loadForVendor(actor: UserActor, paymentId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { milestone: { include: { booking: true } } },
  });
  if (!payment || payment.provider !== 'offline' || !payment.milestone) throw new NotFoundError('Payment not found');
  const membership = await prisma.membership.findFirst({
    where: { userId: actor.userId, orgId: payment.milestone.booking.vendorOrgId },
    select: { role: true },
  });
  if (!membership) throw new NotFoundError('Payment not found');
  return { payment, milestone: payment.milestone, booking: payment.milestone.booking };
}

function assertPayable(booking: { status: string; paymentMode: string }) {
  if (booking.paymentMode === 'HELD') {
    throw new ValidationError('Held bookings are paid through Tiwa', { field: 'milestoneId', key: 'heldNotOffline' });
  }
  if (booking.status === 'CANCELLED' || booking.status === 'COMPLETED') {
    throw new ValidationError('This booking is closed', { field: 'milestoneId', key: 'bookingClosed' });
  }
}

export async function startReceiptUpload(storage: Storage, actor: UserActor, raw: z.input<typeof startReceiptSchema>) {
  const input = startReceiptSchema.parse(raw);
  const milestone = await loadForPayer(actor, input.milestoneId);
  assertPayable(milestone.booking);
  const receiptKey = `${receiptPrefix(milestone.bookingId)}${uuidv7()}`;
  const uploadUrl = await storage.signPut(receiptKey, input.mime, input.sizeBytes);
  return { receiptKey, uploadUrl };
}

export async function recordOfflinePayment(
  storage: Storage | null,
  actor: UserActor,
  raw: z.input<typeof recordOfflineSchema>,
  opts?: { ip?: string },
) {
  const input = recordOfflineSchema.parse(raw);
  const milestone = await loadForPayer(actor, input.milestoneId);
  assertPayable(milestone.booking);
  if (!PAYABLE.includes(milestone.state)) {
    throw new ConflictError('This payment is already recorded', { key: 'alreadyRecorded' });
  }
  if (BigInt(input.amountMinor) !== milestone.amountMinor) {
    throw new ValidationError('Amount must match the milestone', { field: 'amountMinor', key: 'amountMismatch' });
  }
  const paidAt = new Date(`${input.paidOn}T12:00:00.000Z`);
  if (paidAt.getTime() > Date.now() + 86_400_000) {
    throw new ValidationError('Payment date is in the future', { field: 'paidOn', key: 'futureDate' });
  }
  if (input.receiptKey) {
    // Only a receipt this booking's upload flow produced, and only real images/PDFs (Backend.md §12).
    if (!input.receiptKey.startsWith(receiptPrefix(milestone.bookingId)) || !storage) {
      throw new ValidationError('Invalid receipt', { field: 'receiptKey', key: 'invalidReceipt' });
    }
    const stored = await storage.head(input.receiptKey);
    const sniffed = stored ? sniffMime(await storage.readStart(input.receiptKey, 16)) : null;
    if (!stored || !sniffed || !Object.values(RECEIPT_TYPES).includes(sniffed)) {
      throw new ValidationError('Invalid receipt', { field: 'receiptKey', key: 'invalidReceipt' });
    }
  }

  return prisma.$transaction(async (tx) => {
    // Conditional update: two hosts recording at once leaves exactly one Payment.
    const moved = await tx.paymentMilestone.updateMany({
      where: { id: milestone.id, state: { in: PAYABLE } },
      data: { state: 'RECORDED_OFFLINE' },
    });
    if (moved.count !== 1) throw new ConflictError('This payment is already recorded', { key: 'alreadyRecorded' });
    const id = uuidv7();
    await tx.payment.create({
      data: {
        id,
        purpose: 'BOOKING_MILESTONE',
        milestoneId: milestone.id,
        payerUserId: actor.userId,
        amountMinor: milestone.amountMinor,
        currency: milestone.currency,
        provider: 'offline',
        providerRef: `offline:${id}`,
        status: 'PENDING',
        mode: 'OFFLINE',
        paidAt,
        offlineMethod: input.method,
        receiptKey: input.receiptKey ?? null,
        note: input.note || null,
        recordedById: actor.userId,
      },
    });
    await audit(tx, {
      actor,
      action: 'payment.offline.record',
      targetType: 'Payment',
      targetId: id,
      data: { bookingId: milestone.bookingId, milestoneId: milestone.id, method: input.method },
      ...(opts?.ip ? { ip: opts.ip } : {}),
    });
    await enqueue(tx, 'payment.offline_recorded', {
      paymentId: id,
      bookingId: milestone.bookingId,
      vendorOrgId: milestone.booking.vendorOrgId,
    });
    return { paymentId: id };
  });
}

export async function confirmOfflinePayment(
  actor: UserActor,
  raw: z.input<typeof offlinePaymentIdSchema>,
  opts?: { ip?: string },
) {
  const { paymentId } = offlinePaymentIdSchema.parse(raw);
  const { payment, milestone, booking } = await loadForVendor(actor, paymentId);
  if (payment.status !== 'PENDING' || milestone.state !== 'RECORDED_OFFLINE') {
    throw new ConflictError('This payment is not waiting for confirmation', { key: 'notAwaiting' });
  }
  const first = await prisma.paymentMilestone.findFirst({
    where: { bookingId: booking.id },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true },
  });
  const confirmsBooking =
    first?.id === milestone.id && (booking.status === 'DEPOSIT_DUE' || booking.status === 'ACCEPTED');
  if (confirmsBooking) assertBookingTransition(booking.status, 'CONFIRMED');

  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const moved = await tx.payment.updateMany({
      where: { id: payment.id, status: 'PENDING' },
      data: { status: 'SUCCEEDED', confirmedById: actor.userId, confirmedAt: now },
    });
    if (moved.count !== 1) throw new ConflictError('Already answered', { key: 'notAwaiting' });
    await tx.paymentMilestone.update({
      where: { id: milestone.id },
      data: { state: 'CONFIRMED_OFFLINE', paidAt: payment.paidAt ?? now },
    });
    if (confirmsBooking) {
      await tx.booking.update({ where: { id: booking.id }, data: { status: 'CONFIRMED', holdExpiresAt: null } });
    }
    await audit(tx, {
      actor,
      action: 'payment.offline.confirm',
      targetType: 'Payment',
      targetId: payment.id,
      data: { bookingId: booking.id, milestoneId: milestone.id, bookingConfirmed: confirmsBooking },
      ...(opts?.ip ? { ip: opts.ip } : {}),
    });
    await enqueue(tx, 'payment.offline_confirmed', {
      paymentId: payment.id,
      bookingId: booking.id,
      eventId: booking.eventId,
    });
    return { bookingStatus: confirmsBooking ? ('CONFIRMED' as const) : booking.status };
  });
}

/** "Not received": the record was wrong; the milestone goes back to SCHEDULED for the host to try again. */
export async function declineOfflinePayment(
  actor: UserActor,
  raw: z.input<typeof offlinePaymentIdSchema>,
  opts?: { ip?: string },
) {
  const { paymentId } = offlinePaymentIdSchema.parse(raw);
  const { payment, milestone, booking } = await loadForVendor(actor, paymentId);
  if (payment.status !== 'PENDING' || milestone.state !== 'RECORDED_OFFLINE') {
    throw new ConflictError('This payment is not waiting for confirmation', { key: 'notAwaiting' });
  }
  return prisma.$transaction(async (tx) => {
    const moved = await tx.payment.updateMany({
      where: { id: payment.id, status: 'PENDING' },
      data: { status: 'FAILED', confirmedById: actor.userId, confirmedAt: new Date() },
    });
    if (moved.count !== 1) throw new ConflictError('Already answered', { key: 'notAwaiting' });
    await tx.paymentMilestone.update({ where: { id: milestone.id }, data: { state: 'SCHEDULED' } });
    await audit(tx, {
      actor,
      action: 'payment.offline.decline',
      targetType: 'Payment',
      targetId: payment.id,
      data: { bookingId: booking.id, milestoneId: milestone.id },
      ...(opts?.ip ? { ip: opts.ip } : {}),
    });
    await enqueue(tx, 'payment.offline_declined', { paymentId: payment.id, bookingId: booking.id });
    return { ok: true as const };
  });
}

/** Offline payments on one booking, for the booking page (caller has already passed `getBooking`). */
export async function listBookingPayments(bookingId: string) {
  const rows = await prisma.payment.findMany({
    where: { milestone: { bookingId } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      milestoneId: true,
      amountMinor: true,
      currency: true,
      status: true,
      paidAt: true,
      offlineMethod: true,
      receiptKey: true,
      note: true,
      createdAt: true,
    },
  });
  return rows.map((row) => ({ ...row, amountMinor: row.amountMinor.toString(), hasReceipt: !!row.receiptKey }));
}

/** Signed link to a receipt for either side of the booking. */
export async function receiptUrl(storage: Storage, actor: UserActor, raw: z.input<typeof offlinePaymentIdSchema>) {
  const { paymentId } = offlinePaymentIdSchema.parse(raw);
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { milestone: { include: { booking: true } } },
  });
  const booking = payment?.milestone?.booking;
  if (!payment?.receiptKey || !booking) throw new NotFoundError('Receipt not found');
  const member = await prisma.membership.findFirst({
    where: { userId: actor.userId, orgId: booking.vendorOrgId },
    select: { role: true },
  });
  if (!member) {
    const access = await loadEventAccess(actor.userId, booking.eventId);
    if (!access || access.role === 'VENDOR' || access.role === 'PHOTOGRAPHER') {
      throw new NotFoundError('Receipt not found');
    }
    authorize(actor, 'money.view', { eventId: booking.eventId, access });
  }
  return { url: await storage.getSignedUrl(payment.receiptKey, 300) };
}

/** Vendor inbox: offline payments waiting for "Confirm received". */
export async function listPendingOfflinePayments(actor: UserActor, raw: z.input<typeof vendorOrgSchema>) {
  const { vendorOrgId } = vendorOrgSchema.parse(raw);
  const membership = await prisma.membership.findFirst({
    where: { userId: actor.userId, orgId: vendorOrgId },
    select: { role: true },
  });
  if (!membership) throw new ForbiddenError('Only the vendor team lists payments');
  const rows = await prisma.payment.findMany({
    where: { provider: 'offline', status: 'PENDING', milestone: { booking: { vendorOrgId } } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      amountMinor: true,
      currency: true,
      paidAt: true,
      offlineMethod: true,
      receiptKey: true,
      note: true,
      milestone: {
        select: {
          label: true,
          booking: { select: { id: true, eventId: true, event: { select: { name: true } } } },
        },
      },
    },
  });
  return rows.map(({ receiptKey, ...row }) => ({
    ...row,
    amountMinor: row.amountMinor.toString(),
    paidAt: row.paidAt?.toISOString() ?? null,
    hasReceipt: !!receiptKey,
  }));
}
