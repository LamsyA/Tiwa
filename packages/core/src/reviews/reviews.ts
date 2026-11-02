import { prisma } from '@tiwa/db';
import { z } from 'zod';
import type { Actor } from '../auth/authorize.js';
import { requireEventAccess } from '../events/access.js';
import { enqueue, audit } from '../shared/outbox.js';
import { uuidv7 } from '../shared/ids.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../shared/errors.js';

// Reviews and reputation (P14, REV-01–REV-06). One review per booking, only
// after the booking is COMPLETED (UF-25-1, enforced here on the server).
// The vendor replies once; anyone may report; the score only shows after
// 5 reviews (REV-05). Ratings are computed on read — always fresh, so no
// roll-up job is needed (see decision log).

type UserActor = Extract<Actor, { kind: 'user' }>;

const SCORE = z.number().int().min(1).max(5);

export const createReviewSchema = z.object({
  bookingId: z.string().uuid(),
  quality: SCORE,
  communication: SCORE,
  punctuality: SCORE,
  value: SCORE,
  scope: SCORE,
  body: z.string().trim().max(2000, 'notesTooLong').optional(),
  photoIds: z.array(z.string().uuid()).max(10).optional(),
});

export async function createReview(actor: UserActor, raw: z.input<typeof createReviewSchema>) {
  const input = createReviewSchema.parse(raw);
  const booking = await prisma.booking.findUnique({
    where: { id: input.bookingId },
    select: { id: true, eventId: true, vendorOrgId: true, status: true },
  });
  if (!booking) throw new NotFoundError('Booking not found');
  if (booking.status !== 'COMPLETED') {
    throw new ForbiddenError('Reviews open after the booking is completed', { key: 'notCompleted' });
  }
  await requireEventAccess(actor, booking.eventId, 'review.create');
  const existing = await prisma.review.findUnique({ where: { bookingId: booking.id }, select: { id: true } });
  if (existing) throw new ConflictError('This booking already has a review');
  if (input.photoIds?.length) {
    const media = await prisma.mediaItem.findMany({
      where: { id: { in: input.photoIds } },
      select: { id: true, gallery: { select: { eventId: true } } },
    });
    const foreign = media.filter((row) => row.gallery.eventId !== booking.eventId);
    if (media.length !== input.photoIds.length || foreign.length > 0) {
      throw new ValidationError('Photos must come from this event', { field: 'photoIds' });
    }
  }
  const overall = (input.quality + input.communication + input.punctuality + input.value + input.scope) / 5;
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.review.create({
      data: {
        id: uuidv7(),
        bookingId: booking.id,
        vendorOrgId: booking.vendorOrgId,
        authorId: actor.userId,
        quality: input.quality,
        communication: input.communication,
        punctuality: input.punctuality,
        value: input.value,
        scope: input.scope,
        overall,
        body: input.body || null,
        photoIds: input.photoIds ?? [],
      },
      select: { id: true },
    });
    await audit(tx, {
      actor,
      action: 'review.create',
      targetType: 'Review',
      targetId: created.id,
      data: { eventId: booking.eventId, bookingId: booking.id },
    });
    await enqueue(tx, 'review.received', { reviewId: created.id, bookingId: booking.id, eventId: booking.eventId });
    return created;
  });
  return { reviewId: row.id, overall };
}

export const replySchema = z.object({
  reviewId: z.string().uuid(),
  body: z.string().trim().min(1, 'titleRequired').max(2000, 'notesTooLong'),
});

/** The vendor replies once, on their own booking's review (matrix OWN). */
export async function replyToReview(actor: UserActor, raw: z.input<typeof replySchema>) {
  const input = replySchema.parse(raw);
  const review = await prisma.review.findUnique({
    where: { id: input.reviewId },
    select: { id: true, bookingId: true, vendorOrgId: true, reply: true },
  });
  if (!review) throw new NotFoundError('Review not found');
  const membership = await prisma.membership.findFirst({
    where: { userId: actor.userId, orgId: review.vendorOrgId },
    select: { role: true },
  });
  // Vendors are rarely event participants, so org membership scoped to the
  // reviewed booking is the proof (same pattern as vendor arrivals and
  // vendor booking money; matrix `review.reply: OWN` documents the intent).
  if (!membership) throw new ForbiddenError('Only the vendor team replies to its reviews');
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: review.bookingId },
    select: { eventId: true },
  });
  if (review.reply !== null) throw new ConflictError('This review already has a reply');
  await prisma.$transaction(async (tx) => {
    await tx.review.update({ where: { id: review.id }, data: { reply: input.body, repliedAt: new Date() } });
    await audit(tx, {
      actor,
      action: 'review.reply',
      targetType: 'Review',
      targetId: review.id,
      data: { eventId: booking.eventId, bookingId: review.bookingId },
    });
    await enqueue(tx, 'review.replied', { reviewId: review.id, bookingId: review.bookingId, eventId: booking.eventId });
  });
  return { ok: true as const };
}

export const reportReviewSchema = z.object({
  reviewId: z.string().uuid(),
  reason: z.string().trim().min(1, 'titleRequired').max(500, 'notesTooLong'),
});

/** Anyone signed in can report a review; staff decide in the admin queue. */
export async function reportReview(actor: UserActor, raw: z.input<typeof reportReviewSchema>) {
  const input = reportReviewSchema.parse(raw);
  const review = await prisma.review.findUnique({ where: { id: input.reviewId }, select: { id: true } });
  if (!review) throw new NotFoundError('Review not found');
  await requireEventAccess(actor, (await bookingEventOf(input.reviewId)).eventId, 'review.report');
  const report = await prisma.report.create({
    data: {
      id: uuidv7(),
      targetType: 'review',
      targetId: review.id,
      reason: input.reason,
      reporterUserId: actor.userId,
      status: 'OPEN',
    },
    select: { id: true },
  });
  return { reportId: report.id };
}

async function bookingEventOf(reviewId: string): Promise<{ eventId: string }> {
  const review = await prisma.review.findUniqueOrThrow({ where: { id: reviewId }, select: { bookingId: true } });
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: review.bookingId },
    select: { eventId: true },
  });
  return { eventId: booking.eventId };
}

export interface VendorRating {
  count: number;
  /** Mean overall, or null until 5 reviews (REV-05). */
  average: number | null;
}

/** Reputation computed on read (decision log): always fresh, no roll-up job. */
export async function vendorRating(vendorOrgId: string): Promise<VendorRating> {
  const rows = await prisma.review.findMany({
    where: { vendorOrgId, hidden: false },
    select: { overall: true },
  });
  if (rows.length < 5) return { count: rows.length, average: null };
  const sum = rows.reduce((total, row) => total + row.overall, 0);
  return { count: rows.length, average: Math.round((sum / rows.length) * 10) / 10 };
}

export interface VendorReviewRow {
  id: string;
  overall: number;
  quality: number;
  communication: number;
  punctuality: number;
  value: number;
  scope: number;
  body: string | null;
  photoIds: string[];
  reply: string | null;
  repliedAt: Date | null;
  authorName: string | null;
  eventName: string | null;
  createdAt: Date;
}

/** Public review list for a vendor profile: published only, newest first. */
export async function listVendorReviews(vendorOrgId: string, take = 20): Promise<VendorReviewRow[]> {
  const rows = await prisma.review.findMany({
    where: { vendorOrgId, hidden: false },
    orderBy: { createdAt: 'desc' },
    take,
  });
  const [authors, bookings] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: [...new Set(rows.map((row) => row.authorId))] } },
      select: { id: true, name: true },
    }),
    prisma.booking.findMany({
      where: { id: { in: rows.map((row) => row.bookingId) } },
      select: { id: true, event: { select: { name: true } } },
    }),
  ]);
  const names = new Map(authors.map((row) => [row.id, row.name] as const));
  const events = new Map(bookings.map((row) => [row.id, row.event.name] as const));
  return rows.map((row) => ({
    id: row.id,
    overall: row.overall,
    quality: row.quality,
    communication: row.communication,
    punctuality: row.punctuality,
    value: row.value,
    scope: row.scope,
    body: row.body,
    photoIds: row.photoIds,
    reply: row.reply,
    repliedAt: row.repliedAt,
    authorName: names.get(row.authorId) ?? null,
    eventName: events.get(row.bookingId) ?? null,
    createdAt: row.createdAt,
  }));
}
