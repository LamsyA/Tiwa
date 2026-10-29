import { publishOutbox } from '@tiwa/core';

export const PUBLISH_OUTBOX_JOB = 'events/publish-outbox' as const;
export const PUBLISH_OUTBOX_EVERY_MS = 2000;

/** The slice of a BullMQ Queue this job needs (lets tests pass a fake). */
export interface JobSink {
  add(
    name: string,
    data: unknown,
    opts: { jobId: string; removeOnComplete: number; removeOnFail: number },
  ): Promise<unknown>;
}

/**
 * Backend.md §10: every 2 s, turn unpublished OutboxEvent rows into queue
 * jobs named by topic. The job id is the outbox row id, so a re-publish after
 * a crash is a no-op in BullMQ — safe to run twice.
 */
export async function handlePublishOutbox(sink: JobSink): Promise<{ published: number }> {
  const published = await publishOutbox(async (row) => {
    await sink.add(row.topic, row.payload, { jobId: row.id, removeOnComplete: 1000, removeOnFail: 5000 });
  });
  return { published };
}
