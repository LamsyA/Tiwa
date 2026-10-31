import { prisma } from '@tiwa/db';
import { z } from 'zod';
import type { Actor } from '../auth/authorize.js';
import { authorizeOrg, type OrgAction } from '../auth/org.js';
import { NotFoundError } from '../shared/errors.js';
import { audit } from '../shared/outbox.js';

// Service packages (MKT-01, P6-T02). Vendors and planners sell named packages
// with a starting price, includes list and add-ons. Edits need org ADMIN+.

type UserActor = Extract<Actor, { kind: 'user' }>;

async function loadAccess(actor: UserActor, orgId: string, action: OrgAction) {
  const membership = await prisma.membership.findUnique({
    where: { orgId_userId: { orgId, userId: actor.userId } },
  });
  authorizeOrg(actor, action, orgId, membership ? { orgId, role: membership.role } : null);
}

export const savePackageSchema = z.object({
  orgId: z.string().uuid(),
  packageId: z.string().uuid().optional(),
  name: z.string().trim().min(1, 'nameRequired').max(120, 'nameTooLong'),
  description: z.string().trim().max(2000, 'descriptionTooLong').optional(),
  priceMinor: z
    .string()
    .regex(/^\d+$/, 'priceInvalid')
    .optional(),
  currency: z.string().regex(/^[A-Z]{3}$/, 'currencyInvalid'),
  includes: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
  addOns: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
  active: z.boolean().default(true),
});

export async function savePackage(actor: UserActor, input: z.infer<typeof savePackageSchema>) {
  await loadAccess(actor, input.orgId, 'org.manage');
  const data = {
    name: input.name,
    description: input.description || null,
    priceMinor: input.priceMinor ? BigInt(input.priceMinor) : null,
    currency: input.currency,
    includes: input.includes,
    addOns: input.addOns,
    active: input.active,
  };
  return prisma.$transaction(async (tx) => {
    const saved = input.packageId
      ? await tx.servicePackage.updateMany({ where: { id: input.packageId, orgId: input.orgId }, data })
      : null;
    if (input.packageId && saved?.count === 0) throw new NotFoundError('Package not found');
    const row = input.packageId
      ? await tx.servicePackage.findUniqueOrThrow({ where: { id: input.packageId } })
      : await tx.servicePackage.create({ data: { orgId: input.orgId, ...data } });
    await audit(tx, {
      actor,
      action: input.packageId ? 'org.package.update' : 'org.package.create',
      targetType: 'Organization',
      targetId: input.orgId,
      data: { packageId: row.id, name: input.name },
    });
    return row;
  });
}

export const archivePackageSchema = z.object({ orgId: z.string().uuid(), packageId: z.string().uuid() });

export async function archivePackage(actor: UserActor, input: z.infer<typeof archivePackageSchema>) {
  await loadAccess(actor, input.orgId, 'org.manage');
  await prisma.$transaction(async (tx) => {
    const updated = await tx.servicePackage.updateMany({
      where: { id: input.packageId, orgId: input.orgId },
      data: { active: false },
    });
    if (updated.count === 0) throw new NotFoundError('Package not found');
    await audit(tx, {
      actor,
      action: 'org.package.archive',
      targetType: 'Organization',
      targetId: input.orgId,
      data: { packageId: input.packageId },
    });
  });
}
