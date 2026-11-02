import { prisma } from '@tiwa/db';
import { sniffMime, type Storage } from '@tiwa/storage';
import { z } from 'zod';
import type { Actor } from '../auth/authorize.js';
import { requireEventAccess } from '../events/access.js';
import { NotFoundError, ValidationError } from '../shared/errors.js';
import { uuidv7 } from '../shared/ids.js';
import { audit } from '../shared/outbox.js';

// Budget edits (BUD-02–BUD-06, UF-20 steps 3; D-X28). Everything needs
// `money.edit`; every change writes an AuditLog `budget.*` row with the
// before/after so the AuditLog is the budget history (Backend.md §3).

type UserActor = Extract<Actor, { kind: 'user' }>;

const minor = z.string().regex(/^\d{1,15}$/, 'invalidAmount');
export const CONTRIBUTION_KINDS = ['family', 'committee', 'member', 'sponsor', 'other_income'] as const;
export const MAX_EXPENSE_RECEIPT_BYTES = 10 * 1024 * 1024;
const RECEIPT_TYPES: Record<string, string> = {
  'image/jpeg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
  'image/heic': 'image/heic',
  'application/pdf': 'application/pdf',
};

export const setAllocationsSchema = z.object({
  eventId: z.string().uuid(),
  plannedTotalMinor: minor.optional(),
  allocations: z.array(z.object({ key: z.string().min(1).max(60), plannedMinor: minor })).max(50),
});

export const startExpenseReceiptSchema = z.object({
  eventId: z.string().uuid(),
  mime: z.string().refine((mime) => mime in RECEIPT_TYPES, 'typeNotAllowed'),
  sizeBytes: z.number().int().min(1, 'emptyFile').max(MAX_EXPENSE_RECEIPT_BYTES, 'tooLarge'),
});

export const addExpenseSchema = z.object({
  eventId: z.string().uuid(),
  categoryKey: z.string().min(1).max(60),
  description: z.string().trim().min(1, 'descriptionRequired').max(200),
  amountMinor: minor.refine((value) => BigInt(value) > 0n, 'invalidAmount'),
  paid: z.boolean().default(true),
  receiptKey: z.string().max(200).optional(),
});

export const expenseIdSchema = z.object({ expenseId: z.string().uuid() });
export const setExpensePaidSchema = expenseIdSchema.extend({ paid: z.boolean() });

export const addContributionSchema = z.object({
  eventId: z.string().uuid(),
  contributorName: z.string().trim().min(1, 'nameRequired').max(120),
  contributorPhone: z.string().trim().max(20).optional(),
  kind: z.enum(CONTRIBUTION_KINDS),
  pledgedMinor: minor,
  receivedMinor: minor.default('0'),
  notes: z.string().trim().max(500).optional(),
});

export const contributionIdSchema = z.object({ contributionId: z.string().uuid() });
export const recordReceivedSchema = contributionIdSchema.extend({
  amountMinor: minor.refine((value) => BigInt(value) > 0n, 'invalidAmount'),
});

function receiptPrefix(eventId: string): string {
  return `events/${eventId}/expenses/`;
}

export async function setAllocations(actor: UserActor, raw: z.input<typeof setAllocationsSchema>) {
  const input = setAllocationsSchema.parse(raw);
  await requireEventAccess(actor, input.eventId, 'money.edit');
  const [event, categories] = await Promise.all([
    prisma.event.findUniqueOrThrow({ where: { id: input.eventId }, select: { plannedBudgetMinor: true } }),
    prisma.budgetCategory.findMany({ where: { eventId: input.eventId }, select: { key: true, plannedMinor: true } }),
  ]);
  const known = new Map(categories.map((row) => [row.key, row.plannedMinor]));
  for (const row of input.allocations) {
    if (!known.has(row.key))
      throw new ValidationError('Unknown budget category', { field: 'allocations', key: 'unknownCategory' });
  }
  const changes = input.allocations.filter((row) => known.get(row.key) !== BigInt(row.plannedMinor));
  const totalChanged =
    input.plannedTotalMinor !== undefined && BigInt(input.plannedTotalMinor) !== event.plannedBudgetMinor;

  await prisma.$transaction(async (tx) => {
    for (const row of changes) {
      await tx.budgetCategory.update({
        where: { eventId_key: { eventId: input.eventId, key: row.key } },
        data: { plannedMinor: BigInt(row.plannedMinor) },
      });
    }
    if (totalChanged) {
      await tx.event.update({
        where: { id: input.eventId },
        data: { plannedBudgetMinor: BigInt(input.plannedTotalMinor!) },
      });
    }
    if (changes.length > 0 || totalChanged) {
      await audit(tx, {
        actor,
        action: 'budget.allocations',
        targetType: 'Event',
        targetId: input.eventId,
        data: {
          // Keyed by category: { venue: { from, to } }.
          changes: Object.fromEntries(
            changes.map((row) => [row.key, { from: known.get(row.key)!.toString(), to: row.plannedMinor }]),
          ),
          ...(totalChanged
            ? { total: { from: event.plannedBudgetMinor.toString(), to: input.plannedTotalMinor! } }
            : {}),
        },
      });
    }
  });
  return { changed: changes.length + (totalChanged ? 1 : 0) };
}

export async function startExpenseReceipt(
  storage: Storage,
  actor: UserActor,
  raw: z.input<typeof startExpenseReceiptSchema>,
) {
  const input = startExpenseReceiptSchema.parse(raw);
  await requireEventAccess(actor, input.eventId, 'money.edit');
  const receiptKey = `${receiptPrefix(input.eventId)}${uuidv7()}`;
  return { receiptKey, uploadUrl: await storage.signPut(receiptKey, input.mime, input.sizeBytes) };
}

export async function addExpense(storage: Storage | null, actor: UserActor, raw: z.input<typeof addExpenseSchema>) {
  const input = addExpenseSchema.parse(raw);
  await requireEventAccess(actor, input.eventId, 'money.edit');
  const event = await prisma.event.findUniqueOrThrow({ where: { id: input.eventId }, select: { currency: true } });
  if (input.receiptKey) {
    if (!input.receiptKey.startsWith(receiptPrefix(input.eventId)) || !storage) {
      throw new ValidationError('Invalid receipt', { field: 'receiptKey', key: 'invalidReceipt' });
    }
    const stored = await storage.head(input.receiptKey);
    const sniffed = stored ? sniffMime(await storage.readStart(input.receiptKey, 16)) : null;
    if (!stored || !sniffed || !Object.values(RECEIPT_TYPES).includes(sniffed)) {
      throw new ValidationError('Invalid receipt', { field: 'receiptKey', key: 'invalidReceipt' });
    }
  }
  return prisma.$transaction(async (tx) => {
    const expense = await tx.expense.create({
      data: {
        eventId: input.eventId,
        categoryKey: input.categoryKey,
        description: input.description,
        amountMinor: BigInt(input.amountMinor),
        currency: event.currency,
        paidAt: input.paid ? new Date() : null,
        receiptKey: input.receiptKey ?? null,
        createdById: actor.userId,
      },
      select: { id: true },
    });
    await audit(tx, {
      actor,
      action: 'budget.expense.add',
      targetType: 'Expense',
      targetId: expense.id,
      data: {
        eventId: input.eventId,
        categoryKey: input.categoryKey,
        amountMinor: input.amountMinor,
        paid: input.paid,
      },
    });
    return { expenseId: expense.id };
  });
}

async function loadExpense(actor: UserActor, expenseId: string) {
  const expense = await prisma.expense.findUnique({ where: { id: expenseId } });
  if (!expense) throw new NotFoundError('Expense not found');
  await requireEventAccess(actor, expense.eventId, 'money.edit');
  return expense;
}

export async function setExpensePaid(actor: UserActor, raw: z.input<typeof setExpensePaidSchema>) {
  const input = setExpensePaidSchema.parse(raw);
  const expense = await loadExpense(actor, input.expenseId);
  await prisma.$transaction(async (tx) => {
    await tx.expense.update({ where: { id: expense.id }, data: { paidAt: input.paid ? new Date() : null } });
    await audit(tx, {
      actor,
      action: 'budget.expense.paid',
      targetType: 'Expense',
      targetId: expense.id,
      data: { eventId: expense.eventId, paid: input.paid },
    });
  });
  return { ok: true as const };
}

export async function deleteExpense(actor: UserActor, raw: z.input<typeof expenseIdSchema>) {
  const input = expenseIdSchema.parse(raw);
  const expense = await loadExpense(actor, input.expenseId);
  await prisma.$transaction(async (tx) => {
    await tx.expense.delete({ where: { id: expense.id } });
    await audit(tx, {
      actor,
      action: 'budget.expense.delete',
      targetType: 'Expense',
      targetId: expense.id,
      data: {
        eventId: expense.eventId,
        description: expense.description,
        amountMinor: expense.amountMinor.toString(),
      },
    });
  });
  return { ok: true as const };
}

export async function addContribution(actor: UserActor, raw: z.input<typeof addContributionSchema>) {
  const input = addContributionSchema.parse(raw);
  await requireEventAccess(actor, input.eventId, 'money.edit');
  const event = await prisma.event.findUniqueOrThrow({ where: { id: input.eventId }, select: { currency: true } });
  return prisma.$transaction(async (tx) => {
    const row = await tx.contribution.create({
      data: {
        eventId: input.eventId,
        contributorName: input.contributorName,
        contributorPhone: input.contributorPhone || null,
        kind: input.kind,
        pledgedMinor: BigInt(input.pledgedMinor),
        receivedMinor: BigInt(input.receivedMinor),
        currency: event.currency,
        notes: input.notes || null,
        createdById: actor.userId,
      },
      select: { id: true },
    });
    // No name or phone in the audit row (Backend.md §12: logs stay free of personal data).
    await audit(tx, {
      actor,
      action: 'budget.contribution.add',
      targetType: 'Contribution',
      targetId: row.id,
      data: {
        eventId: input.eventId,
        kind: input.kind,
        pledgedMinor: input.pledgedMinor,
        receivedMinor: input.receivedMinor,
      },
    });
    return { contributionId: row.id };
  });
}

async function loadContribution(actor: UserActor, contributionId: string) {
  const row = await prisma.contribution.findUnique({ where: { id: contributionId } });
  if (!row) throw new NotFoundError('Contribution not found');
  await requireEventAccess(actor, row.eventId, 'money.edit');
  return row;
}

/** Adds a received amount (part payments add up; may exceed the pledge, e.g. a generous family). */
export async function recordContributionReceived(actor: UserActor, raw: z.input<typeof recordReceivedSchema>) {
  const input = recordReceivedSchema.parse(raw);
  const row = await loadContribution(actor, input.contributionId);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.contribution.update({
      where: { id: row.id },
      data: { receivedMinor: { increment: BigInt(input.amountMinor) } },
      select: { receivedMinor: true },
    });
    await audit(tx, {
      actor,
      action: 'budget.contribution.received',
      targetType: 'Contribution',
      targetId: row.id,
      data: { eventId: row.eventId, amountMinor: input.amountMinor },
    });
    return { receivedMinor: updated.receivedMinor.toString() };
  });
}

export async function deleteContribution(actor: UserActor, raw: z.input<typeof contributionIdSchema>) {
  const input = contributionIdSchema.parse(raw);
  const row = await loadContribution(actor, input.contributionId);
  await prisma.$transaction(async (tx) => {
    await tx.contribution.delete({ where: { id: row.id } });
    await audit(tx, {
      actor,
      action: 'budget.contribution.delete',
      targetType: 'Contribution',
      targetId: row.id,
      data: { eventId: row.eventId, kind: row.kind },
    });
  });
  return { ok: true as const };
}

// Custom budget lines (D-X30): the host names their own categories and amounts.

export const addBudgetCategorySchema = z.object({
  eventId: z.string().uuid(),
  label: z.string().trim().min(1, 'labelRequired').max(60, 'labelTooLong'),
  plannedMinor: minor.default('0'),
});

export const budgetCategoryRefSchema = z.object({ eventId: z.string().uuid(), key: z.string().min(1).max(60) });
export const renameBudgetCategorySchema = budgetCategoryRefSchema.extend({
  label: z.string().trim().min(1, 'labelRequired').max(60, 'labelTooLong'),
});

/** A stable key from a label ("Aso-ebi & outfits" → "aso_ebi_outfits"), unique within the event. */
function keyFromLabel(label: string, taken: Set<string>): string {
  const base =
    label
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'category';
  let key = base;
  for (let n = 2; taken.has(key); n += 1) key = `${base}_${n}`;
  return key;
}

export async function addBudgetCategory(actor: UserActor, raw: z.input<typeof addBudgetCategorySchema>) {
  const input = addBudgetCategorySchema.parse(raw);
  await requireEventAccess(actor, input.eventId, 'money.edit');
  const existing = await prisma.budgetCategory.findMany({
    where: { eventId: input.eventId },
    select: { key: true, label: true, sortOrder: true },
  });
  if (existing.some((row) => row.label.toLowerCase() === input.label.toLowerCase())) {
    throw new ValidationError('A category with that name exists', { field: 'label', key: 'labelTaken' });
  }
  const key = keyFromLabel(input.label, new Set(existing.map((row) => row.key)));
  const sortOrder = existing.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;
  await prisma.$transaction(async (tx) => {
    await tx.budgetCategory.create({
      data: { eventId: input.eventId, key, label: input.label, plannedMinor: BigInt(input.plannedMinor), sortOrder },
    });
    await audit(tx, {
      actor,
      action: 'budget.category.add',
      targetType: 'Event',
      targetId: input.eventId,
      data: { key, plannedMinor: input.plannedMinor },
    });
  });
  return { key };
}

export async function renameBudgetCategory(actor: UserActor, raw: z.input<typeof renameBudgetCategorySchema>) {
  const input = renameBudgetCategorySchema.parse(raw);
  await requireEventAccess(actor, input.eventId, 'money.edit');
  const row = await prisma.budgetCategory.findUnique({
    where: { eventId_key: { eventId: input.eventId, key: input.key } },
  });
  if (!row) throw new NotFoundError('Category not found');
  await prisma.$transaction(async (tx) => {
    await tx.budgetCategory.update({ where: { id: row.id }, data: { label: input.label } });
    await audit(tx, {
      actor,
      action: 'budget.category.rename',
      targetType: 'Event',
      targetId: input.eventId,
      data: { key: input.key, from: row.label, to: input.label },
    });
  });
  return { ok: true as const };
}

/**
 * Removes a budget line. Expenses filed under it move to the "Other" line
 * (budgetSummary shows unknown keys there); bookings are matched by category
 * and simply fall through to the next matching line.
 */
export async function removeBudgetCategory(actor: UserActor, raw: z.input<typeof budgetCategoryRefSchema>) {
  const input = budgetCategoryRefSchema.parse(raw);
  await requireEventAccess(actor, input.eventId, 'money.edit');
  const row = await prisma.budgetCategory.findUnique({
    where: { eventId_key: { eventId: input.eventId, key: input.key } },
  });
  if (!row) throw new NotFoundError('Category not found');
  await prisma.$transaction(async (tx) => {
    await tx.budgetCategory.delete({ where: { id: row.id } });
    await audit(tx, {
      actor,
      action: 'budget.category.remove',
      targetType: 'Event',
      targetId: input.eventId,
      data: { key: input.key, label: row.label, plannedMinor: row.plannedMinor.toString() },
    });
  });
  return { ok: true as const };
}
