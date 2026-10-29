import { prisma } from '@tiwa/db';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { audit, enqueue, publishOutbox, type OutboxRow } from './outbox.js';

const TOPIC = `test.outbox.${Date.now()}`;

// Other suites leave their own rows; publish only ours by draining with a filter.
async function drain(publish: (row: OutboxRow) => Promise<void>) {
  return publishOutbox(async (row) => {
    if (row.topic === TOPIC) await publish(row);
  });
}

beforeEach(async () => {
  await prisma.outboxEvent.deleteMany({ where: { topic: TOPIC } });
});

afterAll(async () => {
  await prisma.outboxEvent.deleteMany({ where: { topic: TOPIC } });
  await prisma.auditLog.deleteMany({ where: { targetType: 'OutboxTest' } });
  await prisma.$disconnect();
});

describe('enqueue + publishOutbox', () => {
  it('publishes in order, marks rows, and is idempotent (second run publishes nothing)', async () => {
    await prisma.$transaction(async (tx) => {
      await enqueue(tx, TOPIC, { n: 1 });
      await enqueue(tx, TOPIC, { n: 2 });
    });
    const seen: unknown[] = [];
    await drain(async (row) => {
      seen.push(row.payload);
    });
    expect(seen).toEqual([{ n: 1 }, { n: 2 }]);
    const rows = await prisma.outboxEvent.findMany({ where: { topic: TOPIC } });
    expect(rows.every((row) => row.publishedAt !== null)).toBe(true);
    seen.length = 0;
    await drain(async (row) => {
      seen.push(row.payload);
    });
    expect(seen).toEqual([]);
  });

  it('a rolled-back transaction leaves no job', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await enqueue(tx, TOPIC, { n: 3 });
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(await prisma.outboxEvent.count({ where: { topic: TOPIC } })).toBe(0);
  });

  it('a failed publish leaves that row (and later ones) for the next run', async () => {
    await prisma.$transaction(async (tx) => {
      await enqueue(tx, TOPIC, { n: 1 });
      await enqueue(tx, TOPIC, { n: 2 });
    });
    await drain(async () => {
      throw new Error('queue down');
    });
    expect(await prisma.outboxEvent.count({ where: { topic: TOPIC, publishedAt: null } })).toBe(2);
    const seen: unknown[] = [];
    await drain(async (row) => {
      seen.push(row.payload);
    });
    expect(seen).toHaveLength(2);
  });
});

describe('audit', () => {
  it('records actor kind and id', async () => {
    await audit(prisma, {
      actor: { kind: 'user', userId: 'u-audit', isAdmin: false },
      action: 'test.do',
      targetType: 'OutboxTest',
      targetId: 't1',
      data: { role: 'STAFF' },
    });
    await audit(prisma, { actor: { kind: 'system' }, action: 'test.sys', targetType: 'OutboxTest', targetId: 't1' });
    const rows = await prisma.auditLog.findMany({ where: { targetType: 'OutboxTest' }, orderBy: { createdAt: 'asc' } });
    expect(rows.map((row) => [row.actorType, row.actorId, row.action])).toEqual([
      ['user', 'u-audit', 'test.do'],
      ['system', null, 'test.sys'],
    ]);
  });
});
