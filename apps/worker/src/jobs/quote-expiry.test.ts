import { prisma } from '@tiwa/db';
import { afterAll, describe, expect, it } from 'vitest';
import { handleQuoteExpiry } from './quote-expiry.js';

describe('quotes/expire job', () => {
  const events: string[] = [];
  const users: string[] = [];

  afterAll(async () => {
    await prisma.quote.deleteMany({ where: { eventId: { in: events } } });
    await prisma.quoteRequest.deleteMany({ where: { eventId: { in: events } } });
    await prisma.eventParticipant.deleteMany({ where: { eventId: { in: events } } });
    await prisma.event.deleteMany({ where: { id: { in: events } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  it('expires past-due quotes and leaves live ones alone', async () => {
    const host = await prisma.user.create({ data: { name: 'ExpiryHost', countryCode: 'NG' } });
    users.push(host.id);
    const event = await prisma.event.create({
      data: {
        slug: `expiry-${Date.now()}`,
        type: 'birthday',
        format: 'PRIVATE_CELEBRATION',
        name: 'Expiry Party',
        countryCode: 'NG',
        currency: 'NGN',
        timezone: 'Africa/Lagos',
        createdById: host.id,
      },
    });
    events.push(event.id);
    const past = await prisma.quote.create({
      data: {
        eventId: event.id,
        vendorOrgId: '00000000-0000-7000-8000-000000000001',
        items: [{ name: 'X', qty: 1, unitMinor: '100' }],
        subtotalMinor: 100n,
        totalMinor: 100n,
        currency: 'NGN',
        cancellationTerms: 'none',
        proposedSchedule: [{ label: 'Deposit', percentBps: 5000, due: 'on_accept' }],
        expiresAt: new Date(Date.now() - 1000),
        status: 'SENT',
      },
      select: { id: true },
    });
    const live = await prisma.quote.create({
      data: {
        eventId: event.id,
        vendorOrgId: '00000000-0000-7000-8000-000000000002',
        items: [{ name: 'Y', qty: 1, unitMinor: '100' }],
        subtotalMinor: 100n,
        totalMinor: 100n,
        currency: 'NGN',
        cancellationTerms: 'none',
        proposedSchedule: [{ label: 'Deposit', percentBps: 5000, due: 'on_accept' }],
        expiresAt: new Date(Date.now() + 86_400_000),
        status: 'SENT',
      },
      select: { id: true },
    });
    const log = { info: () => undefined } as unknown as Parameters<typeof handleQuoteExpiry>[0];
    const result = await handleQuoteExpiry(log, new Date());
    expect(result.expired).toBeGreaterThanOrEqual(1);
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: past.id } })).status).toBe('EXPIRED');
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: live.id } })).status).toBe('SENT');
  });
});
