import { prisma } from '@tiwa/db';
import { z } from 'zod';
import type { Actor } from '../auth/authorize.js';
import { authorizeOrg } from '../auth/org.js';
import { NotFoundError } from '../shared/errors.js';
import { audit } from '../shared/outbox.js';

// Private vendor book (PLN-06, P10-T06). Trusted vendors with notes and
// rates. Adding to an event from the book creates no marketplace fee —
// enforced by never creating a QuoteRequest for book entries (callers link
// the entry directly when building a booking brief).

type UserActor = Extract<Actor, { kind: 'user' }>;

export const addVendorBookSchema = z.object({
  orgId: z.string().uuid(),
  vendorOrgId: z.string().uuid().optional(),
  name: z.string().trim().min(1, 'nameRequired').max(120),
  phone: z.string().trim().max(30).optional(),
  category: z.string().trim().min(1).max(60),
  notes: z.string().trim().max(2000).optional(),
  rateNote: z.string().trim().max(500).optional(),
});

async function requirePlanner(actor: UserActor, orgId: string, action: 'org.view' | 'org.manage') {
  const [membership, org] = await Promise.all([
    prisma.membership.findUnique({ where: { orgId_userId: { orgId, userId: actor.userId } } }),
    prisma.organization.findUnique({ where: { id: orgId }, select: { kind: true } }),
  ]);
  if (!org || org.kind !== 'PLANNER') throw new NotFoundError('Organisation not found');
  authorizeOrg(actor, action, orgId, membership ? { orgId, role: membership.role } : null);
}

export async function addToVendorBook(actor: UserActor, raw: z.input<typeof addVendorBookSchema>) {
  const input = addVendorBookSchema.parse(raw);
  await requirePlanner(actor, input.orgId, 'org.manage');
  return prisma.$transaction(async (tx) => {
    const row = await tx.vendorBookEntry.create({
      data: {
        plannerOrgId: input.orgId,
        vendorOrgId: input.vendorOrgId ?? null,
        name: input.name,
        phone: input.phone || null,
        category: input.category,
        notes: input.notes || null,
        rateNote: input.rateNote || null,
      },
    });
    await audit(tx, {
      actor,
      action: 'planner.vendorbook.add',
      targetType: 'VendorBookEntry',
      targetId: row.id,
      data: {},
    });
    return row;
  });
}

export async function listVendorBook(actor: UserActor, orgId: string) {
  z.string().uuid().parse(orgId);
  await requirePlanner(actor, orgId, 'org.view');
  return prisma.vendorBookEntry.findMany({ where: { plannerOrgId: orgId }, orderBy: { createdAt: 'desc' }, take: 200 });
}

export async function removeVendorBookEntry(actor: UserActor, entryId: string) {
  const row = await prisma.vendorBookEntry.findUnique({ where: { id: entryId } });
  if (!row) throw new NotFoundError('Entry not found');
  await requirePlanner(actor, row.plannerOrgId, 'org.manage');
  await prisma.vendorBookEntry.delete({ where: { id: entryId } });
  return { deleted: true };
}
