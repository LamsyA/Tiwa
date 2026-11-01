import { prisma } from '@tiwa/db';
import { z } from 'zod';
import type { Actor } from '../auth/authorize.js';
import { authorizeOrg } from '../auth/org.js';
import { ConflictError, NotFoundError } from '../shared/errors.js';
import { audit } from '../shared/outbox.js';

// Proposals (PLN-04, P10-T04). A proposal is a branded quote for a CRM
// client: line items live in `body.items`, the server totals them with
// BigInt maths so client and server can never disagree. Sending moves the
// lead to PROPOSAL_SENT; accepting/declining closes it to WON/LOST.
// PDF is a print-ready web page (D-X28 pattern) — no worker job.

type UserActor = Extract<Actor, { kind: 'user' }>;

const minor = z.string().regex(/^\d{1,15}$/, 'invalidAmount');

const proposalItemSchema = z.object({
  label: z.string().trim().min(1).max(200),
  qty: z.number().int().min(1).max(10000),
  unitMinor: minor,
});

export const PROPOSAL_STATUS = ['DRAFT', 'SENT', 'ACCEPTED', 'DECLINED'] as const;

export const createProposalSchema = z.object({
  orgId: z.string().uuid(),
  clientId: z.string().uuid(),
  eventId: z.string().uuid().optional(),
  title: z.string().trim().min(1, 'titleRequired').max(160),
  items: z.array(proposalItemSchema).min(1, 'itemsRequired').max(100),
  notes: z.string().trim().max(5000).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/, 'invalidCurrency'),
});

export const proposalIdSchema = z.object({ proposalId: z.string().uuid() });

async function requirePlannerManage(actor: UserActor, orgId: string) {
  const [membership, org] = await Promise.all([
    prisma.membership.findUnique({ where: { orgId_userId: { orgId, userId: actor.userId } } }),
    prisma.organization.findUnique({ where: { id: orgId }, select: { kind: true } }),
  ]);
  if (!org || org.kind !== 'PLANNER') throw new NotFoundError('Organisation not found');
  authorizeOrg(actor, 'org.manage', orgId, membership ? { orgId, role: membership.role } : null);
}

async function requirePlannerView(actor: UserActor, orgId: string) {
  const [membership, org] = await Promise.all([
    prisma.membership.findUnique({ where: { orgId_userId: { orgId, userId: actor.userId } } }),
    prisma.organization.findUnique({ where: { id: orgId }, select: { kind: true } }),
  ]);
  if (!org || org.kind !== 'PLANNER') throw new NotFoundError('Organisation not found');
  authorizeOrg(actor, 'org.view', orgId, membership ? { orgId, role: membership.role } : null);
}

function totalOf(items: z.infer<typeof proposalItemSchema>[]): bigint {
  return items.reduce((sum, it) => sum + BigInt(it.qty) * BigInt(it.unitMinor), 0n);
}

export async function createProposal(actor: UserActor, raw: z.input<typeof createProposalSchema>) {
  const input = createProposalSchema.parse(raw);
  await requirePlannerManage(actor, input.orgId);
  const client = await prisma.client.findUnique({ where: { id: input.clientId } });
  if (!client || client.orgId !== input.orgId) throw new NotFoundError('Client not found');
  const totalMinor = totalOf(input.items);
  return prisma.$transaction(async (tx) => {
    const row = await tx.proposal.create({
      data: {
        orgId: input.orgId,
        clientId: input.clientId,
        eventId: input.eventId ?? null,
        title: input.title,
        body: { items: input.items, notes: input.notes ?? null },
        totalMinor,
        currency: input.currency,
        status: 'DRAFT',
      },
    });
    await audit(tx, {
      actor,
      action: 'planner.proposal.create',
      targetType: 'Proposal',
      targetId: row.id,
      data: { orgId: input.orgId },
    });
    return { ...row, totalMinor: row.totalMinor.toString() };
  });
}

export async function listProposals(actor: UserActor, raw: { orgId: string; clientId?: string }) {
  const parsed = z.object({ orgId: z.string().uuid(), clientId: z.string().uuid().optional() }).parse(raw);
  await requirePlannerView(actor, parsed.orgId);
  const rows = await prisma.proposal.findMany({
    where: { orgId: parsed.orgId, ...(parsed.clientId ? { clientId: parsed.clientId } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return rows.map((r) => ({ ...r, totalMinor: r.totalMinor.toString() }));
}

export async function getProposal(actor: UserActor, proposalId: string) {
  const row = await prisma.proposal.findUnique({ where: { id: proposalId } });
  if (!row) throw new NotFoundError('Proposal not found');
  await requirePlannerView(actor, row.orgId);
  const [client, org] = await Promise.all([
    prisma.client.findUnique({ where: { id: row.clientId } }),
    prisma.organization.findUnique({ where: { id: row.orgId }, select: { name: true, city: true, logoKey: true } }),
  ]);
  return { proposal: { ...row, totalMinor: row.totalMinor.toString() }, client, org };
}

export async function sendProposal(actor: UserActor, proposalId: string) {
  const row = await prisma.proposal.findUnique({ where: { id: proposalId } });
  if (!row) throw new NotFoundError('Proposal not found');
  await requirePlannerManage(actor, row.orgId);
  if (row.status !== 'DRAFT') throw new ConflictError('Proposal already sent', { reason: 'already-sent' });
  return prisma.$transaction(async (tx) => {
    const updated = await tx.proposal.update({ where: { id: proposalId }, data: { status: 'SENT' } });
    await tx.client.updateMany({ where: { id: row.clientId, stage: 'ENQUIRY' }, data: { stage: 'PROPOSAL_SENT' } });
    await audit(tx, { actor, action: 'planner.proposal.send', targetType: 'Proposal', targetId: row.id, data: {} });
    return { ...updated, totalMinor: updated.totalMinor.toString() };
  });
}

export async function decideProposal(actor: UserActor, raw: { proposalId: string; accepted: boolean }) {
  const input = z.object({ proposalId: z.string().uuid(), accepted: z.boolean() }).parse(raw);
  const row = await prisma.proposal.findUnique({ where: { id: input.proposalId } });
  if (!row) throw new NotFoundError('Proposal not found');
  await requirePlannerManage(actor, row.orgId);
  if (row.status !== 'SENT') throw new ConflictError('Proposal is not sent', { reason: 'not-sent' });
  const status = input.accepted ? 'ACCEPTED' : 'DECLINED';
  return prisma.$transaction(async (tx) => {
    const updated = await tx.proposal.update({ where: { id: row.id }, data: { status } });
    await tx.client.update({
      where: { id: row.clientId },
      data: { stage: input.accepted ? 'WON' : 'LOST' },
    });
    await audit(tx, {
      actor,
      action: 'planner.proposal.decide',
      targetType: 'Proposal',
      targetId: row.id,
      data: { status },
    });
    return { ...updated, totalMinor: updated.totalMinor.toString() };
  });
}
