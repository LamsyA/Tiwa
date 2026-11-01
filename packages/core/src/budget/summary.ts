import { budgetKeyFor } from '@tiwa/config';
import { prisma, type MilestoneState } from '@tiwa/db';
import { z } from 'zod';
import type { Actor, EventAccess } from '../auth/authorize.js';
import { resolveEventAccess } from '../events/access.js';
import { bookingMoney } from '../payments/status.js';

// Budget figures (BUD-01–BUD-08, UF-20; D-X28). Read straight from bookings,
// milestones and expenses until the ledger exists (lean P8, D-X27):
//   Committed   = non-cancelled booking totals + every expense
//   Paid        = secured milestones (incl. CONFIRMED_OFFLINE) + expenses with paidAt
//   Outstanding = Committed − Paid
//   Uncommitted = Planned − Committed (negative = over budget)
// `computeBudget` is pure so the identities are property-tested.

type UserActor = Extract<Actor, { kind: 'user' }>;

/** Key of the line for bookings/expenses whose category the event doesn't have. */
export const OTHER_KEY = '__other';

export interface BudgetInput {
  plannedTotalMinor: bigint;
  categories: { key: string; label: string; plannedMinor: bigint }[];
  bookings: {
    id: string;
    category: string;
    status: string;
    totalMinor: bigint;
    vendorName: string;
    milestones: { state: MilestoneState; amountMinor: bigint }[];
  }[];
  expenses: { id: string; categoryKey: string; description: string; amountMinor: bigint; paidAt: Date | null }[];
  contributions: { kind: string; pledgedMinor: bigint; receivedMinor: bigint }[];
}

export interface BudgetFigures {
  plannedMinor: bigint;
  committedMinor: bigint;
  paidMinor: bigint;
  outstandingMinor: bigint;
  uncommittedMinor: bigint;
}

export interface BudgetLine extends BudgetFigures {
  key: string;
  label: string | null;
  bookings: { id: string; vendorName: string; status: string; committedMinor: bigint; paidMinor: bigint }[];
  expenses: { id: string; description: string; amountMinor: bigint; paid: boolean }[];
}

export interface BudgetSummary {
  totals: BudgetFigures;
  /** Planned total minus what the categories allocate (can be negative). */
  unallocatedMinor: bigint;
  lines: BudgetLine[];
  income: { kind: string; pledgedMinor: bigint; receivedMinor: bigint }[];
  incomeTotals: { pledgedMinor: bigint; receivedMinor: bigint };
}

function figures(planned: bigint, committed: bigint, paid: bigint): BudgetFigures {
  return {
    plannedMinor: planned,
    committedMinor: committed,
    paidMinor: paid,
    outstandingMinor: committed - paid,
    uncommittedMinor: planned - committed,
  };
}

export function computeBudget(input: BudgetInput): BudgetSummary {
  const keys = input.categories.map((row) => row.key);
  const lines = new Map<string, BudgetLine>();
  for (const row of input.categories) {
    lines.set(row.key, {
      key: row.key,
      label: row.label,
      ...figures(row.plannedMinor, 0n, 0n),
      bookings: [],
      expenses: [],
    });
  }
  const lineFor = (key: string | null): BudgetLine => {
    const resolved = key ?? OTHER_KEY;
    let line = lines.get(resolved);
    if (!line) {
      line = { key: resolved, label: null, ...figures(0n, 0n, 0n), bookings: [], expenses: [] };
      lines.set(resolved, line);
    }
    return line;
  };

  for (const booking of input.bookings) {
    if (booking.status === 'CANCELLED') continue;
    const paid = bookingMoney(booking.milestones).securedMinor;
    const line = lineFor(budgetKeyFor(booking.category, keys));
    line.committedMinor += booking.totalMinor;
    line.paidMinor += paid;
    line.bookings.push({
      id: booking.id,
      vendorName: booking.vendorName,
      status: booking.status,
      committedMinor: booking.totalMinor,
      paidMinor: paid,
    });
  }
  for (const expense of input.expenses) {
    const line = lineFor(keys.includes(expense.categoryKey) ? expense.categoryKey : null);
    line.committedMinor += expense.amountMinor;
    if (expense.paidAt) line.paidMinor += expense.amountMinor;
    line.expenses.push({
      id: expense.id,
      description: expense.description,
      amountMinor: expense.amountMinor,
      paid: !!expense.paidAt,
    });
  }

  const finished = [...lines.values()].map((line) => ({
    ...line,
    ...figures(line.plannedMinor, line.committedMinor, line.paidMinor),
  }));
  const allocated = input.categories.reduce((sum, row) => sum + row.plannedMinor, 0n);
  const planned = input.plannedTotalMinor > 0n ? input.plannedTotalMinor : allocated;
  const committed = finished.reduce((sum, line) => sum + line.committedMinor, 0n);
  const paid = finished.reduce((sum, line) => sum + line.paidMinor, 0n);

  const income = new Map<string, { kind: string; pledgedMinor: bigint; receivedMinor: bigint }>();
  for (const row of input.contributions) {
    const entry = income.get(row.kind) ?? { kind: row.kind, pledgedMinor: 0n, receivedMinor: 0n };
    entry.pledgedMinor += row.pledgedMinor;
    entry.receivedMinor += row.receivedMinor;
    income.set(row.kind, entry);
  }
  const incomeRows = [...income.values()];

  return {
    totals: figures(planned, committed, paid),
    unallocatedMinor: planned - allocated,
    lines: finished,
    income: incomeRows,
    incomeTotals: {
      pledgedMinor: incomeRows.reduce((sum, row) => sum + row.pledgedMinor, 0n),
      receivedMinor: incomeRows.reduce((sum, row) => sum + row.receivedMinor, 0n),
    },
  };
}

export const budgetEventSchema = z.object({ eventId: z.string().uuid() });

/** Loads everything `computeBudget` needs; `money.view` (UF-20-3: others get FORBIDDEN). */
export async function budgetSummary(actor: UserActor, raw: z.input<typeof budgetEventSchema>, preloaded?: EventAccess) {
  const { eventId } = budgetEventSchema.parse(raw);
  await resolveEventAccess(actor, eventId, 'money.view', preloaded);
  const input = await loadBudgetInput(eventId);
  return { currency: input.currency, ...computeBudget(input) };
}

/** Raw inputs for one event (also used by the consistency check and exports). */
export async function loadBudgetInput(eventId: string): Promise<BudgetInput & { currency: string }> {
  const [event, categories, bookings, expenses, contributions] = await Promise.all([
    prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { plannedBudgetMinor: true, currency: true } }),
    prisma.budgetCategory.findMany({
      where: { eventId },
      orderBy: { sortOrder: 'asc' },
      select: { key: true, label: true, plannedMinor: true },
    }),
    prisma.booking.findMany({
      where: { eventId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        category: true,
        status: true,
        totalMinor: true,
        vendorOrgId: true,
        milestones: { select: { state: true, amountMinor: true } },
      },
    }),
    prisma.expense.findMany({
      where: { eventId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, categoryKey: true, description: true, amountMinor: true, paidAt: true },
    }),
    prisma.contribution.findMany({
      where: { eventId },
      select: { kind: true, pledgedMinor: true, receivedMinor: true },
    }),
  ]);
  const orgs = await prisma.organization.findMany({
    where: { id: { in: [...new Set(bookings.map((row) => row.vendorOrgId))] } },
    select: { id: true, name: true },
  });
  const names = new Map(orgs.map((org) => [org.id, org.name]));
  return {
    currency: event.currency,
    plannedTotalMinor: event.plannedBudgetMinor,
    categories,
    bookings: bookings.map(({ vendorOrgId, ...row }) => ({ ...row, vendorName: names.get(vendorOrgId) ?? '' })),
    expenses,
    contributions,
  };
}
