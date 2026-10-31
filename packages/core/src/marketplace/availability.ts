import { prisma } from '@tiwa/db';
import { z } from 'zod';
import type { Actor } from '../auth/authorize.js';
import { authorizeOrg, type OrgAction } from '../auth/org.js';
import { NotFoundError, ValidationError } from '../shared/errors.js';
import { audit } from '../shared/outbox.js';

// Availability (MKT-04, P6-T02/T08): whole-business and per-space slot
// blocks plus the "confirm availability" heartbeat. A confirmation older
// than 14 days reads as "unconfirmed" on the public profile.

type UserActor = Extract<Actor, { kind: 'user' }>;

async function loadAccess(actor: UserActor, orgId: string, action: OrgAction) {
  const membership = await prisma.membership.findUnique({
    where: { orgId_userId: { orgId, userId: actor.userId } },
  });
  authorizeOrg(actor, action, orgId, membership ? { orgId, role: membership.role } : null);
}

export const blockAvailabilitySchema = z.object({
  orgId: z.string().uuid(),
  spaceId: z.string().uuid().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dateInvalid'),
  slot: z.enum(['MORNING', 'AFTERNOON', 'EVENING', 'FULL_DAY']).default('FULL_DAY'),
  reason: z.string().trim().max(200, 'reasonTooLong').optional(),
});

export async function blockAvailability(actor: UserActor, raw: z.input<typeof blockAvailabilitySchema>) {
  const input = blockAvailabilitySchema.parse(raw);
  await loadAccess(actor, input.orgId, 'org.manage');
  // A space block needs its parent venue; a whole-business block (spaceId
  // null) must be FULL_DAY — the SQL trigger rejects the mixed cases anyway.
  if (input.spaceId) {
    const space = await prisma.venueSpace.findFirst({
      where: { id: input.spaceId, profile: { orgId: input.orgId } },
    });
    if (!space) throw new NotFoundError('Space not found');
  } else if (input.slot !== 'FULL_DAY') {
    throw new ValidationError('Whole-business blocks cover the full day', { field: 'slot', key: 'slotInvalid' });
  }
  // The raw-SQL unique index (availability_unique, NULLS NOT DISTINCT) is not
  // a Prisma @@unique, so upsert by compound key is impossible — read then
  // write; the index still guarantees no double block under concurrency.
  const date = new Date(input.date);
  const existing = await prisma.availabilityBlock.findFirst({
    where: { orgId: input.orgId, spaceId: input.spaceId ?? null, date, slot: input.slot, bookingId: null },
  });
  const block = existing
    ? await prisma.availabilityBlock.update({ where: { id: existing.id }, data: { reason: input.reason || null } })
    : await prisma.availabilityBlock.create({
        data: {
          orgId: input.orgId,
          spaceId: input.spaceId ?? null,
          date,
          slot: input.slot,
          reason: input.reason || null,
        },
      });
  await audit(prisma, {
    actor,
    action: 'org.availability.block',
    targetType: 'Organization',
    targetId: input.orgId,
    data: { date: input.date, spaceId: input.spaceId ?? null, slot: input.slot },
  });
  return block;
}

export const unblockAvailabilitySchema = z.object({ orgId: z.string().uuid(), blockId: z.string().uuid() });

export async function unblockAvailability(actor: UserActor, input: z.infer<typeof unblockAvailabilitySchema>) {
  await loadAccess(actor, input.orgId, 'org.manage');
  const deleted = await prisma.availabilityBlock.deleteMany({
    where: { id: input.blockId, orgId: input.orgId, bookingId: null },
  });
  if (deleted.count === 0) throw new NotFoundError('Availability block not found');
  await audit(prisma, {
    actor,
    action: 'org.availability.unblock',
    targetType: 'Organization',
    targetId: input.orgId,
    data: { blockId: input.blockId },
  });
}

export const confirmAvailabilitySchema = z.object({ orgId: z.string().uuid() });

/** "Last confirmed" heartbeat (MKT-04): today the business says its calendar is current. */
export async function confirmAvailability(actor: UserActor, input: z.infer<typeof confirmAvailabilitySchema>) {
  await loadAccess(actor, input.orgId, 'org.manage');
  return prisma.businessProfile.upsert({
    where: { orgId: input.orgId },
    create: { orgId: input.orgId, categories: [], city: '', currency: 'NGN', availabilityConfirmedAt: new Date() },
    update: { availabilityConfirmedAt: new Date() },
  });
}

export async function listAvailability(actor: UserActor, orgId: string, from: string, to: string) {
  await loadAccess(actor, orgId, 'org.view');
  return prisma.availabilityBlock.findMany({
    where: { orgId, date: { gte: new Date(from), lte: new Date(to) } },
    orderBy: { date: 'asc' },
  });
}

export const listSpaceAvailabilitySchema = z.object({
  orgId: z.string().uuid(),
  spaceId: z.string().uuid(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dateInvalid'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dateInvalid'),
});

/** Blocks for one space (the venue calendar shows one row per space). */
export async function listSpaceAvailability(actor: UserActor, input: z.infer<typeof listSpaceAvailabilitySchema>) {
  await loadAccess(actor, input.orgId, 'org.view');
  const space = await prisma.venueSpace.findFirst({
    where: { id: input.spaceId, profile: { orgId: input.orgId } },
  });
  if (!space) throw new NotFoundError('Space not found');
  return prisma.availabilityBlock.findMany({
    where: { orgId: input.orgId, spaceId: input.spaceId, date: { gte: new Date(input.from), lte: new Date(input.to) } },
    orderBy: { date: 'asc' },
  });
}
