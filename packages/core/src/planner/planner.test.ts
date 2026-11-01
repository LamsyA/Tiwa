import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../shared/outbox.js', () => ({ audit: vi.fn(), enqueue: vi.fn() }));

vi.mock('@tiwa/db', () => ({
  prisma: {
    membership: { findUnique: vi.fn() },
    organization: { findUnique: vi.fn() },
    client: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      groupBy: vi.fn(),
    },
    proposal: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    eventParticipant: { findMany: vi.fn() },
    task: { count: vi.fn() },
    paymentMilestone: { count: vi.fn() },
    quoteRequest: { count: vi.fn() },
    vendorBookEntry: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => {
      const { prisma: p } = await import('@tiwa/db');
      return fn(p);
    }),
  },
}));

import { prisma } from '@tiwa/db';
import { createClient, moveLead } from './clients.js';
import { plannerDashboard } from './dashboard.js';
import { createProposal } from './proposals.js';

const actor = { kind: 'user', userId: '0199a2c2-9c9a-7a9a-8a9a-9a9a9a9a9a9a', isAdmin: false } as const;
const ORG = '0199a2c2-9c9a-7a9a-8a9a-9a9a9a9a9a9b';
const CLIENT = '0199a2c2-9c9a-7a9a-8a9a-9a9a9a9a9a9c';
const mocked = vi.mocked(prisma);

function plannerMembership() {
  (mocked.membership.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ orgId: ORG, role: 'OWNER' });
  (mocked.organization.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ kind: 'PLANNER', name: 'Plan Co' });
}

beforeEach(() => vi.clearAllMocks());

describe('planner CRM', () => {
  it('creates a client in a planner org', async () => {
    plannerMembership();
    (mocked.client.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: CLIENT, stage: 'ENQUIRY' });
    const row = await createClient(actor, { orgId: ORG, name: 'Ada' });
    expect(row.id).toBe(CLIENT);
  });

  it('refuses clients in a vendor org', async () => {
    (mocked.membership.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ orgId: ORG, role: 'OWNER' });
    (mocked.organization.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ kind: 'VENDOR', name: 'V' });
    await expect(createClient(actor, { orgId: ORG, name: 'Ada' })).rejects.toThrow();
  });

  it('reopens a closed lead only to ENQUIRY', async () => {
    plannerMembership();
    (mocked.client.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: CLIENT, orgId: ORG, stage: 'WON' });
    await expect(moveLead(actor, { clientId: CLIENT, stage: 'LOST' })).rejects.toThrow();
  });

  it('totals proposal items with BigInt maths', async () => {
    plannerMembership();
    (mocked.client.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: CLIENT, orgId: ORG });
    (mocked.proposal.create as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ data }: { data: { totalMinor: bigint } }) => ({ id: 'p1', ...data }),
    );
    const row = await createProposal(actor, {
      orgId: ORG,
      clientId: CLIENT,
      title: 'Wedding plan',
      currency: 'NGN',
      items: [{ label: 'Planning', qty: 2, unitMinor: '500000' }],
    });
    expect(row.totalMinor).toBe('1000000');
  });

  it('dashboard groups pipeline and lists week events', async () => {
    plannerMembership();
    const now = new Date('2026-11-01T00:00:00Z');
    (mocked.eventParticipant.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        role: 'PLANNER',
        event: { id: 'e1', name: 'Party', startsAt: new Date('2026-11-03T00:00:00Z'), status: 'ACTIVE' },
      },
    ]);
    (mocked.task.count as ReturnType<typeof vi.fn>).mockResolvedValue(2);
    (mocked.paymentMilestone.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    (mocked.client.groupBy as ReturnType<typeof vi.fn>).mockResolvedValue([{ stage: 'ENQUIRY', _count: { _all: 3 } }]);
    (mocked.quoteRequest.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    const dash = await plannerDashboard(actor, { orgId: ORG }, now);
    expect(dash.totals.events).toBe(1);
    expect(dash.weekEvents).toHaveLength(1);
    expect(dash.needsToday.overdueTasks).toBe(2);
  });
});
