import { prisma } from '@tiwa/db';
import { z } from 'zod';
import type { Actor } from '../auth/authorize.js';
import { authorizeOrg } from '../auth/org.js';
import { ConflictError, NotFoundError, ValidationError } from '../shared/errors.js';
import { audit } from '../shared/outbox.js';

// Planner invoices (PLN-08, P10-T07). Lean scope (D-X27/D-X28): invoices are
// recorded and tracked in Tiwa; payment happens outside Tiwa (offline) until
// a provider is configured — the same rule as bookings. No provider payment
// link is generated; `markPaid` records offline receipt. Reminders are
// computed on read (overdue / due-soon lists); delivery as notifications
// waits for P13.

type UserActor = Extract<Actor, { kind: 'user' }>;

const minor = z.string().regex(/^\d{1,15}$/, 'invalidAmount');

const invoiceItemSchema = z.object({
  label: z.string().trim().min(1).max(200),
  qty: z.number().int().min(1).max(10000),
  unitMinor: minor,
});

export const INVOICE_STATUS = ['DRAFT', 'SENT', 'PAID', 'VOID'] as const;

export const createInvoiceSchema = z.object({
  orgId: z.string().uuid(),
  clientId: z.string().uuid().optional(),
  eventId: z.string().uuid().optional(),
  items: z.array(invoiceItemSchema).min(1, 'itemsRequired').max(100),
  currency: z.string().regex(/^[A-Z]{3}$/, 'invalidCurrency'),
  dueAt: z.string().datetime(),
  notes: z.string().trim().max(2000).optional(),
});

export const invoiceIdSchema = z.object({ invoiceId: z.string().uuid() });

async function requirePlanner(actor: UserActor, orgId: string, action: 'org.view' | 'org.manage') {
  const [membership, org] = await Promise.all([
    prisma.membership.findUnique({ where: { orgId_userId: { orgId, userId: actor.userId } } }),
    prisma.organization.findUnique({ where: { id: orgId }, select: { kind: true } }),
  ]);
  if (!org || org.kind !== 'PLANNER') throw new NotFoundError('Organisation not found');
  authorizeOrg(actor, action, orgId, membership ? { orgId, role: membership.role } : null);
}

function totalOf(items: z.infer<typeof invoiceItemSchema>[]): bigint {
  return items.reduce((sum, it) => sum + BigInt(it.qty) * BigInt(it.unitMinor), 0n);
}

async function nextNumber(orgId: string): Promise<string> {
  const count = await prisma.invoice.count({ where: { orgId } });
  return `INV-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;
}

export async function createInvoice(actor: UserActor, raw: z.input<typeof createInvoiceSchema>) {
  const input = createInvoiceSchema.parse(raw);
  await requirePlanner(actor, input.orgId, 'org.manage');
  if (input.clientId) {
    const client = await prisma.client.findUnique({ where: { id: input.clientId } });
    if (!client || client.orgId !== input.orgId) throw new NotFoundError('Client not found');
  }
  const dueAt = new Date(input.dueAt);
  if (Number.isNaN(dueAt.getTime()))
    throw new ValidationError('Invalid due date', { field: 'dueAt', key: 'invalidDate' });
  const totalMinor = totalOf(input.items);
  return prisma.$transaction(async (tx) => {
    const row = await tx.invoice.create({
      data: {
        orgId: input.orgId,
        clientId: input.clientId ?? null,
        eventId: input.eventId ?? null,
        number: await nextNumber(input.orgId),
        items: { items: input.items, notes: input.notes ?? null },
        totalMinor,
        currency: input.currency,
        dueAt,
        status: 'DRAFT',
      },
    });
    await audit(tx, { actor, action: 'planner.invoice.create', targetType: 'Invoice', targetId: row.id, data: {} });
    return { ...row, totalMinor: row.totalMinor.toString() };
  });
}

export async function listInvoices(actor: UserActor, orgId: string) {
  z.string().uuid().parse(orgId);
  await requirePlanner(actor, orgId, 'org.view');
  const rows = await prisma.invoice.findMany({ where: { orgId }, orderBy: { createdAt: 'desc' }, take: 100 });
  return rows.map((r) => ({ ...r, totalMinor: r.totalMinor.toString() }));
}

export async function getInvoice(actor: UserActor, invoiceId: string) {
  const row = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!row) throw new NotFoundError('Invoice not found');
  await requirePlanner(actor, row.orgId, 'org.view');
  const client = row.clientId ? await prisma.client.findUnique({ where: { id: row.clientId } }) : null;
  return { invoice: { ...row, totalMinor: row.totalMinor.toString() }, client };
}

export async function sendInvoice(actor: UserActor, invoiceId: string) {
  const row = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!row) throw new NotFoundError('Invoice not found');
  await requirePlanner(actor, row.orgId, 'org.manage');
  if (row.status !== 'DRAFT') throw new ConflictError('Invoice already sent', { reason: 'already-sent' });
  return prisma.$transaction(async (tx) => {
    const updated = await tx.invoice.update({ where: { id: row.id }, data: { status: 'SENT' } });
    await audit(tx, { actor, action: 'planner.invoice.send', targetType: 'Invoice', targetId: row.id, data: {} });
    return { ...updated, totalMinor: updated.totalMinor.toString() };
  });
}

/** Record offline receipt (lean): SENT → PAID. No provider involved. */
export async function markInvoicePaid(actor: UserActor, invoiceId: string) {
  const row = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!row) throw new NotFoundError('Invoice not found');
  await requirePlanner(actor, row.orgId, 'org.manage');
  if (row.status !== 'SENT') throw new ConflictError('Invoice is not sent', { reason: 'not-sent' });
  const updated = await prisma.invoice.update({ where: { id: row.id }, data: { status: 'PAID' } });
  return { ...updated, totalMinor: updated.totalMinor.toString() };
}

export async function voidInvoice(actor: UserActor, invoiceId: string) {
  const row = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!row) throw new NotFoundError('Invoice not found');
  await requirePlanner(actor, row.orgId, 'org.manage');
  if (row.status === 'PAID') throw new ConflictError('Paid invoice cannot be voided', { reason: 'already-paid' });
  const updated = await prisma.invoice.update({ where: { id: row.id }, data: { status: 'VOID' } });
  return { ...updated, totalMinor: updated.totalMinor.toString() };
}

/** Reminder list (computed on read, D-X28 pattern): overdue + due within 7 days. */
export async function invoiceReminders(actor: UserActor, orgId: string, now = new Date()) {
  await requirePlanner(actor, orgId, 'org.view');
  const rows = await prisma.invoice.findMany({
    where: { orgId, status: 'SENT', dueAt: { lte: new Date(now.getTime() + 7 * 24 * 3600 * 1000) } },
    orderBy: { dueAt: 'asc' },
    take: 50,
    select: { id: true, number: true, totalMinor: true, currency: true, dueAt: true, clientId: true },
  });
  return rows.map((r) => ({
    ...r,
    totalMinor: r.totalMinor.toString(),
    overdue: r.dueAt < now,
  }));
}
