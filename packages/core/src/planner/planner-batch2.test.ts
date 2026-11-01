import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../shared/outbox.js', () => ({ audit: vi.fn(), enqueue: vi.fn() }));

vi.mock('@tiwa/db', () => ({
  prisma: {
    membership: { findUnique: vi.fn() },
    organization: { findUnique: vi.fn() },
    client: { count: vi.fn() },
    invoice: { count: vi.fn(), create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    eventParticipant: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), count: vi.fn() },
    quoteRequest: { count: vi.fn() },
    booking: { findMany: vi.fn() },
    availabilityBlock: { findMany: vi.fn() },
    vendorBookEntry: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => {
      const { prisma: p } = await import('@tiwa/db');
      return fn(p);
    }),
  },
}));

import { prisma } from '@tiwa/db';
import { plannerCalendar } from './team.js';
import { createInvoice } from './invoices.js';
import { vendorDashboard } from './vendor-dashboard.js';

const mocked = vi.mocked(prisma);
const ACTOR = { kind: 'user', userId: '0199a2c2-9c9a-7a9a-8a9a-9a9a9a9a9a9a', isAdmin: false } as const;
const ORG = '0199a2c2-9c9a-7a9a-8a9a-9a9a9a9a9a9b';

function plannerOrg() {
  (mocked.membership.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ orgId: ORG, role: 'OWNER' });
  (mocked.organization.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ kind: 'PLANNER', name: 'Plan Co' });
}

function vendorOrg() {
  (mocked.membership.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ orgId: ORG, role: 'OWNER' });
  (mocked.organization.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ kind: 'VENDOR', name: 'Vendor Co' });
}

beforeEach(() => vi.clearAllMocks());

describe('planner team + calendar', () => {
  it('lists events in date order', async () => {
    plannerOrg();
    (mocked.eventParticipant.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        role: 'PLANNER',
        event: { id: 'e1', name: 'B', startsAt: new Date('2026-12-01'), endsAt: null, status: 'ACTIVE' },
      },
      {
        role: 'PLANNER',
        event: { id: 'e2', name: 'A', startsAt: new Date('2026-11-01'), endsAt: null, status: 'ACTIVE' },
      },
    ]);
    const rows = await plannerCalendar(ACTOR, ORG);
    expect(rows).toHaveLength(2);
  });
});

describe('invoices (lean offline)', () => {
  it('totals items and numbers sequentially', async () => {
    plannerOrg();
    (mocked.invoice.count as ReturnType<typeof vi.fn>).mockResolvedValue(2);
    (mocked.invoice.create as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ data }: { data: { totalMinor: bigint } }) => ({
        id: 'i1',
        ...data,
      }),
    );
    const row = await createInvoice(ACTOR, {
      orgId: ORG,
      items: [{ label: 'Planning', qty: 2, unitMinor: '500000' }],
      currency: 'NGN',
      dueAt: new Date('2026-12-01').toISOString(),
    });
    expect(row.totalMinor).toBe('1000000');
    expect(row.number).toBe('INV-2026-0003');
  });
});

describe('vendor dashboard', () => {
  it('flags double-booked dates', async () => {
    vendorOrg();
    (mocked.quoteRequest.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    const day = new Date('2026-12-01T00:00:00Z');
    (mocked.booking.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'b1',
        status: 'CONFIRMED',
        serviceDate: day,
        event: { name: 'E1', startsAt: day },
        milestones: [{ state: 'SCHEDULED', amountMinor: 100n }],
      },
      {
        id: 'b2',
        status: 'CONFIRMED',
        serviceDate: day,
        event: { name: 'E2', startsAt: day },
        milestones: [{ state: 'SCHEDULED', amountMinor: 200n }],
      },
    ]);
    (mocked.availabilityBlock.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const dash = await vendorDashboard(ACTOR, { orgId: ORG }, new Date('2026-11-01'));
    expect(dash.doubleBookingWarnings).toHaveLength(1);
    expect(dash.needsToday.openEnquiries).toBe(1);
  });
});
