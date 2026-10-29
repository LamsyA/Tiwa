import { enqueue } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { afterAll, describe, expect, it } from 'vitest';
import { handlePublishOutbox, type JobSink } from './publish-outbox.js';

const TOPIC = `test.worker.${Date.now()}`;

/** In-memory BullMQ stand-in: like BullMQ, a repeated jobId is ignored. */
function fakeQueue() {
  const jobs = new Map<string, { name: string; data: unknown }>();
  const sink: JobSink = {
    async add(name, data, opts) {
      if (!jobs.has(opts.jobId)) jobs.set(opts.jobId, { name, data });
    },
  };
  return { sink, jobs };
}

afterAll(async () => {
  await prisma.outboxEvent.deleteMany({ where: { topic: TOPIC } });
  await prisma.$disconnect();
});

describe('events/publish-outbox', () => {
  it('turns outbox rows into jobs named by topic with the row id as job id', async () => {
    const { id } = await enqueue(prisma, TOPIC, { userId: 'u-1' });
    const { sink, jobs } = fakeQueue();
    const result = await handlePublishOutbox(sink);
    expect(result.published).toBeGreaterThanOrEqual(1);
    expect(jobs.get(id)).toEqual({ name: TOPIC, data: { userId: 'u-1' } });
  });

  it('is idempotent: running twice publishes nothing new', async () => {
    await enqueue(prisma, TOPIC, { userId: 'u-2' });
    const { sink, jobs } = fakeQueue();
    await handlePublishOutbox(sink);
    const after = jobs.size;
    await handlePublishOutbox(sink);
    expect(jobs.size).toBe(after);
    expect(await prisma.outboxEvent.count({ where: { topic: TOPIC, publishedAt: null } })).toBe(0);
  });
});
