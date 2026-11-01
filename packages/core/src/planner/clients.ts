import { prisma } from '@tiwa/db';
import { z } from 'zod';
import { authorizeOrg } from '../auth/org.js';
import type { Actor } from '../auth/authorize.js';
import { ConflictError, NotFoundError, ValidationError } from '../shared/errors.js';
import { audit } from '../shared/outbox.js';

// Planner CRM (PLN-02/PLN-03, P10-T03). Clients belong to a planner org;
// reads need `org.view`, writes need `org.manage`. Only PLANNER orgs hold
// clients — a vendor org gets FORBIDDEN so the CRM never leaks across kinds.

type UserActor = Extract<Actor, { kind: 'user' }>;

export const STAGES = ['ENQUIRY', 'PROPOSAL_SENT', 'WON', 'LOST'] as const;
export type LeadStage = (typeof STAGES)[number];

async function requirePlannerOrg(actor: UserActor, orgId: string, action: 'org.view' | 'org.manage') {
  const [membership, org] = await Promise.all([
    prisma.membership.findUnique({ where: { orgId_userId: { orgId, userId: actor.userId } } }),
    prisma.organization.findUnique({ where: { id: orgId }, select: { kind: true, name: true } }),
  ]);
  if (!org) throw new NotFoundError('Organisation not found');
  if (org.kind !== 'PLANNER') throw new NotFoundError('Organisation not found');
  authorizeOrg(actor, action, orgId, membership ? { orgId, role: membership.role } : null);
  return org;
}

export const createClientSchema = z.object({
  orgId: z.string().uuid(),
  name: z.string().trim().min(1, 'nameRequired').max(120),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().max(160).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const listClientsSchema = z.object({ orgId: z.string().uuid() });

export const moveLeadSchema = z.object({
  clientId: z.string().uuid(),
  stage: z.enum(STAGES),
});

export const updateClientSchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  email: z.string().trim().max(160).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export async function createClient(actor: UserActor, raw: z.input<typeof createClientSchema>) {
  const input = createClientSchema.parse(raw);
  await requirePlannerOrg(actor, input.orgId, 'org.manage');
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
    throw new ValidationError('Invalid email', { field: 'email', key: 'invalidEmail' });
  }
  const client = await prisma.$transaction(async (tx) => {
    const row = await tx.client.create({
      data: {
        orgId: input.orgId,
        name: input.name,
        phone: input.phone || null,
        email: input.email || null,
        notes: input.notes || null,
      },
    });
    await audit(tx, {
      actor,
      action: 'planner.client.create',
      targetType: 'Client',
      targetId: row.id,
      data: { orgId: input.orgId },
    });
    return row;
  });
  return client;
}

export async function listClients(actor: UserActor, raw: z.input<typeof listClientsSchema>) {
  const input = listClientsSchema.parse(raw);
  await requirePlannerOrg(actor, input.orgId, 'org.view');
  return prisma.client.findMany({
    where: { orgId: input.orgId },
    orderBy: [{ stage: 'asc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      stage: true,
      createdAt: true,
      _count: { select: { proposals: true, invoices: true } },
    },
  });
}

export async function getClient(actor: UserActor, clientId: string) {
  const row = await prisma.client.findUnique({ where: { id: clientId } });
  if (!row) throw new NotFoundError('Client not found');
  await requirePlannerOrg(actor, row.orgId, 'org.view');
  const [proposals, invoices] = await Promise.all([
    prisma.proposal.findMany({ where: { clientId }, orderBy: { createdAt: 'desc' } }),
    prisma.invoice.findMany({ where: { clientId }, orderBy: { createdAt: 'desc' } }),
  ]);
  return { client: row, proposals, invoices };
}

export async function moveLead(actor: UserActor, raw: z.input<typeof moveLeadSchema>) {
  const input = moveLeadSchema.parse(raw);
  const existing = await prisma.client.findUnique({ where: { id: input.clientId } });
  if (!existing) throw new NotFoundError('Client not found');
  await requirePlannerOrg(actor, existing.orgId, 'org.manage');
  if (existing.stage === input.stage) return existing;
  // Terminal states can be reopened to ENQUIRY only (prevents accidental loss).
  if ((existing.stage === 'WON' || existing.stage === 'LOST') && input.stage !== 'ENQUIRY') {
    throw new ConflictError('Lead is closed', { reason: 'lead-closed', stage: existing.stage });
  }
  return prisma.$transaction(async (tx) => {
    const row = await tx.client.update({ where: { id: input.clientId }, data: { stage: input.stage } });
    await audit(tx, {
      actor,
      action: 'planner.client.move',
      targetType: 'Client',
      targetId: row.id,
      data: { from: existing.stage, to: input.stage },
    });
    return row;
  });
}

export async function updateClient(actor: UserActor, raw: z.input<typeof updateClientSchema>) {
  const input = updateClientSchema.parse(raw);
  const existing = await prisma.client.findUnique({ where: { id: input.clientId } });
  if (!existing) throw new NotFoundError('Client not found');
  await requirePlannerOrg(actor, existing.orgId, 'org.manage');
  if (
    input.email !== undefined &&
    input.email !== null &&
    input.email !== '' &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)
  ) {
    throw new ValidationError('Invalid email', { field: 'email', key: 'invalidEmail' });
  }
  return prisma.client.update({
    where: { id: input.clientId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
      ...(input.email !== undefined ? { email: input.email || null } : {}),
      ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
    },
  });
}
