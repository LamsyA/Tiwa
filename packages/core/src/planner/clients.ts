import { staffClientIds } from './staff-scope.js';
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
  const scope = await staffClientIds(actor.userId, input.orgId);
  const clients = await prisma.client.findMany({
    where: { orgId: input.orgId, ...(scope ? { id: { in: scope } } : {}) },
    orderBy: [{ stage: 'asc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      stage: true,
      userId: true,
      createdAt: true,
      _count: { select: { proposals: true, invoices: true } },
    },
  });
  // D-X69: the newest Tiwa proposal request behind each client, so the
  // pipeline and client list link straight to the proposal and its history.
  const requests = await prisma.quoteRequest.findMany({
    where: { clientId: { in: clients.map((row) => row.id) } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, clientId: true, eventId: true, createdAt: true },
  });
  const events = await prisma.event.findMany({
    where: { id: { in: [...new Set(requests.map((row) => row.eventId))] } },
    select: { id: true, name: true },
  });
  const eventName = new Map(events.map((row) => [row.id, row.name]));
  const latest = new Map<string, { requestId: string; eventName: string; requests: number }>();
  for (const row of requests) {
    const key = row.clientId as string;
    const seen = latest.get(key);
    if (seen) seen.requests += 1;
    else latest.set(key, { requestId: row.id, eventName: eventName.get(row.eventId) ?? '', requests: 1 });
  }
  return clients.map((row) => ({ ...row, onTiwa: row.userId !== null, proposal: latest.get(row.id) ?? null }));
}

export async function getClient(actor: UserActor, clientId: string) {
  const row = await prisma.client.findUnique({ where: { id: clientId } });
  if (!row) throw new NotFoundError('Client not found');
  await requirePlannerOrg(actor, row.orgId, 'org.view');
  const scope = await staffClientIds(actor.userId, row.orgId);
  if (scope && !scope.includes(clientId)) throw new NotFoundError('Client not found');
  const [proposals, invoices] = await Promise.all([
    prisma.proposal.findMany({ where: { clientId }, orderBy: { createdAt: 'desc' } }),
    prisma.invoice.findMany({ where: { clientId }, orderBy: { createdAt: 'desc' } }),
  ]);
  // D-X69: every proposal request this client sent on Tiwa, with where it stands.
  const requests = await prisma.quoteRequest.findMany({
    where: { clientId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, eventId: true, status: true, createdAt: true },
  });
  const [events, quotes] = await Promise.all([
    prisma.event.findMany({
      where: { id: { in: requests.map((r) => r.eventId) } },
      select: { id: true, name: true, startsAt: true },
    }),
    prisma.quote.findMany({
      where: { requestId: { in: requests.map((r) => r.id) }, status: { not: 'DRAFT' } },
      orderBy: { createdAt: 'desc' },
      select: { requestId: true, status: true, totalMinor: true, currency: true, revision: true },
    }),
  ]);
  const eventById = new Map(events.map((e) => [e.id, e]));
  const tiwaRequests = requests.map((r) => {
    const quote = quotes.find((q) => q.requestId === r.id) ?? null;
    return {
      requestId: r.id,
      requestStatus: r.status,
      eventName: eventById.get(r.eventId)?.name ?? '',
      eventDate: eventById.get(r.eventId)?.startsAt?.toISOString() ?? null,
      requestedAt: r.createdAt.toISOString(),
      quote: quote
        ? {
            status: quote.status,
            totalMinor: quote.totalMinor.toString(),
            currency: quote.currency,
            revision: quote.revision,
          }
        : null,
    };
  });
  return { client: row, proposals, invoices, tiwaRequests };
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
