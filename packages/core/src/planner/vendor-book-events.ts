import { prisma } from '@tiwa/db';
import { z } from 'zod';
import { authorize, type Actor } from '../auth/authorize.js';
import { authorizeOrg } from '../auth/org.js';
import { loadEventAccess } from '../events/access.js';
import { ConflictError, NotFoundError, ValidationError } from '../shared/errors.js';
import { audit } from '../shared/outbox.js';

// Add a vendor-book entry to an event (PLN-06, P10-T06). When the entry
// points at a vendor org on Tiwa, the org joins the event as VENDOR in one
// row — no QuoteRequest is created, so no marketplace fee can apply (fees
// only attach to marketplace bookings paid through Tiwa). External entries
// (no vendorOrgId) cannot join until the vendor is on Tiwa.

type UserActor = Extract<Actor, { kind: 'user' }>;

export const addBookEntryToEventSchema = z.object({
  entryId: z.string().uuid(),
  eventId: z.string().uuid(),
});

async function requirePlannerManage(actor: UserActor, orgId: string) {
  const [membership, org] = await Promise.all([
    prisma.membership.findUnique({ where: { orgId_userId: { orgId, userId: actor.userId } } }),
    prisma.organization.findUnique({ where: { id: orgId }, select: { kind: true } }),
  ]);
  if (!org || org.kind !== 'PLANNER') throw new NotFoundError('Organisation not found');
  authorizeOrg(actor, 'org.manage', orgId, membership ? { orgId, role: membership.role } : null);
}

export async function addBookEntryToEvent(actor: UserActor, raw: z.input<typeof addBookEntryToEventSchema>) {
  const input = addBookEntryToEventSchema.parse(raw);
  const entry = await prisma.vendorBookEntry.findUnique({ where: { id: input.entryId } });
  if (!entry) throw new NotFoundError('Entry not found');
  await requirePlannerManage(actor, entry.plannerOrgId);
  if (!entry.vendorOrgId) {
    throw new ValidationError('External vendor is not on Tiwa yet', { field: 'entryId', key: 'externalVendor' });
  }
  const access = await loadEventAccess(actor.userId, input.eventId);
  if (!access) throw new NotFoundError('Event not found');
  // Planner must be able to manage members or edit the event to add vendors.
  try {
    authorize(actor, 'event.members.manage', { eventId: input.eventId, access });
  } catch {
    authorize(actor, 'event.edit', { eventId: input.eventId, access });
  }
  const existing = await prisma.eventParticipant.findFirst({
    where: { eventId: input.eventId, orgId: entry.vendorOrgId, removedAt: null },
  });
  if (existing) throw new ConflictError('Vendor already on this event', { reason: 'already-added' });
  return prisma.$transaction(async (tx) => {
    const row = await tx.eventParticipant.create({
      data: { eventId: input.eventId, orgId: entry.vendorOrgId, role: 'VENDOR', permissions: '{}' },
    });
    await audit(tx, {
      actor,
      action: 'planner.vendorbook.addToEvent',
      targetType: 'Event',
      targetId: input.eventId,
      data: {},
    });
    return row;
  });
}
