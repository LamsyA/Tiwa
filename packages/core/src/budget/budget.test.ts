import { prisma } from '@tiwa/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Actor } from '../auth/authorize.js';
import { permissionsFor, toStoredPermissions } from '../events/access.js';
import {
  addBudgetCategory,
  addContribution,
  addExpense,
  deleteContribution,
  deleteExpense,
  recordContributionReceived,
  removeBudgetCategory,
  renameBudgetCategory,
  setAllocations,
  setExpensePaid,
} from './edit.js';
import { listContributions, listExpenses, listPaymentSchedule } from './records.js';
import { budgetSummary } from './summary.js';

type UserActor = Extract<Actor, { kind: 'user' }>;

const users: string[] = [];
let eventId = '';
let host: UserActor;
let viewer: UserActor;
let noMoney: UserActor;
let stranger: UserActor;

async function makeUser(name: string): Promise<UserActor> {
  const user = await prisma.user.create({ data: { name, countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user', userId: user.id, isAdmin: false };
}

beforeAll(async () => {
  host = await makeUser('BudgetHost');
  viewer = await makeUser('BudgetViewer');
  noMoney = await makeUser('BudgetNoMoney');
  stranger = await makeUser('BudgetStranger');
  const event = await prisma.event.create({
    data: {
      slug: `budget-${Date.now()}`,
      type: 'birthday',
      format: 'PRIVATE_CELEBRATION',
      name: 'Budget Party',
      countryCode: 'NG',
      currency: 'NGN',
      timezone: 'Africa/Lagos',
      plannedBudgetMinor: 1_000_000n,
      createdById: host.userId,
      budgetCategories: {
        create: [
          { key: 'venue', label: 'Venue', plannedMinor: 400_000n, sortOrder: 0 },
          { key: 'catering', label: 'Food', plannedMinor: 600_000n, sortOrder: 1 },
        ],
      },
    },
  });
  eventId = event.id;
  await prisma.eventParticipant.createMany({
    data: [
      { eventId, userId: host.userId, role: 'HOST', permissions: toStoredPermissions(permissionsFor('HOST')) },
      {
        eventId,
        userId: viewer.userId,
        role: 'CO_HOST',
        permissions: toStoredPermissions({ ...permissionsFor('CO_HOST', 'view_only'), money: 'view' }),
      },
      {
        eventId,
        userId: noMoney.userId,
        role: 'CO_HOST',
        permissions: toStoredPermissions(permissionsFor('CO_HOST', 'view_only')),
      },
    ],
  });
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } });
  await prisma.expense.deleteMany({ where: { eventId } });
  await prisma.contribution.deleteMany({ where: { eventId } });
  await prisma.budgetCategory.deleteMany({ where: { eventId } });
  await prisma.eventParticipant.deleteMany({ where: { eventId } });
  await prisma.event.deleteMany({ where: { id: eventId } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

describe('budget edits (UF-20)', () => {
  it('reallocates categories and the total, with an audit history row', async () => {
    const result = await setAllocations(host, {
      eventId,
      plannedTotalMinor: '1200000',
      allocations: [
        { key: 'venue', plannedMinor: '500000' },
        { key: 'catering', plannedMinor: '600000' },
      ],
    });
    expect(result.changed).toBe(2);
    const summary = await budgetSummary(host, { eventId });
    expect(summary.totals.plannedMinor).toBe(1_200_000n);
    expect(summary.unallocatedMinor).toBe(100_000n);
    const history = await prisma.auditLog.findFirst({
      where: { action: 'budget.allocations', targetId: eventId },
      orderBy: { createdAt: 'desc' },
    });
    expect(history?.data).toMatchObject({ changes: { venue: { from: '400000', to: '500000' } } });
    await expect(
      setAllocations(host, { eventId, allocations: [{ key: 'nope', plannedMinor: '1' }] }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('expenses count as committed, and as paid only when paid', async () => {
    const { expenseId } = await addExpense(null, host, {
      eventId,
      categoryKey: 'venue',
      description: 'Chairs',
      amountMinor: '50000',
      paid: false,
    });
    let summary = await budgetSummary(host, { eventId });
    expect(summary.totals).toMatchObject({ committedMinor: 50_000n, paidMinor: 0n, outstandingMinor: 50_000n });
    await setExpensePaid(host, { expenseId, paid: true });
    summary = await budgetSummary(host, { eventId });
    expect(summary.totals.paidMinor).toBe(50_000n);
    expect((await listExpenses(host, { eventId }))[0]).toMatchObject({ description: 'Chairs', amountMinor: '50000' });
    await expect(
      addExpense(null, host, {
        eventId,
        categoryKey: 'venue',
        description: 'X',
        amountMinor: '1',
        receiptKey: 'events/other/expenses/x',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    await deleteExpense(host, { expenseId });
    expect(await listExpenses(host, { eventId })).toHaveLength(0);
  });

  it('pledges add up received amounts and appear as income by kind', async () => {
    const { contributionId } = await addContribution(host, {
      eventId,
      contributorName: 'Aunty Bisi',
      contributorPhone: '+2348000000001',
      kind: 'family',
      pledgedMinor: '100000',
    });
    await recordContributionReceived(host, { contributionId, amountMinor: '30000' });
    await recordContributionReceived(host, { contributionId, amountMinor: '20000' });
    await addContribution(host, { eventId, contributorName: 'Drinks Co', kind: 'sponsor', pledgedMinor: '250000' });
    const summary = await budgetSummary(host, { eventId });
    expect(summary.income).toEqual(
      expect.arrayContaining([
        { kind: 'family', pledgedMinor: 100_000n, receivedMinor: 50_000n },
        { kind: 'sponsor', pledgedMinor: 250_000n, receivedMinor: 0n },
      ]),
    );
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'budget.contribution.add', targetId: contributionId },
    });
    expect(JSON.stringify(audit?.data)).not.toContain('Bisi');
    expect((await listContributions(host, { eventId })).length).toBe(2);
    await deleteContribution(host, { contributionId });
    expect((await listContributions(host, { eventId })).length).toBe(1);
  });

  it('custom budget lines: add with an amount, rename, remove (D-X30)', async () => {
    const { key } = await addBudgetCategory(host, { eventId, label: 'Aso-ebi & outfits', plannedMinor: '150000' });
    expect(key).toBe('aso_ebi_outfits');
    await expect(addBudgetCategory(host, { eventId, label: 'aso-ebi & OUTFITS' })).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    await renameBudgetCategory(host, { eventId, key, label: 'Outfits' });
    let summary = await budgetSummary(host, { eventId });
    expect(summary.lines.find((line) => line.key === key)).toMatchObject({ label: 'Outfits', plannedMinor: 150_000n });
    await removeBudgetCategory(host, { eventId, key });
    summary = await budgetSummary(host, { eventId });
    expect(summary.lines.some((line) => line.key === key)).toBe(false);
    await expect(addBudgetCategory(viewer, { eventId, label: 'X' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('UF-20-3: money view reads but cannot edit; no money permission → FORBIDDEN; stranger → NOT_FOUND', async () => {
    await expect(budgetSummary(noMoney, { eventId })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(budgetSummary(viewer, { eventId })).resolves.toBeDefined();
    await expect(
      addExpense(null, viewer, { eventId, categoryKey: 'venue', description: 'X', amountMinor: '1' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(budgetSummary(stranger, { eventId })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(listPaymentSchedule(stranger, { eventId })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
