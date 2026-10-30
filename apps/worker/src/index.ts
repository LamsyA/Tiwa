import * as Sentry from '@sentry/node';
import { Queue, Worker } from 'bullmq';
import { env } from '@tiwa/config';
import { createLogger, scrubSentryEvent } from '@tiwa/core';
import { Redis } from 'ioredis';
import { DEADLINE_ALERTS_EVERY_MS, DEADLINE_ALERTS_JOB, handleDeadlineAlerts } from './jobs/deadline-alerts.js';
import { REMINDERS_EVERY_MS, REMINDERS_JOB, handleReminders } from './jobs/reminders.js';
import { PING_JOB, handlePing } from './jobs/ping.js';
import { PUBLISH_OUTBOX_EVERY_MS, PUBLISH_OUTBOX_JOB, handlePublishOutbox } from './jobs/publish-outbox.js';
import { SEND_INVITE_JOB, handleSendInvite } from './jobs/send-invite.js';
import { TOPIC_HANDLERS } from './jobs/topics.js';

const QUEUE_NAME = 'tiwa';

if (env.SENTRY_DSN) {
  Sentry.init({ dsn: env.SENTRY_DSN, beforeSend: (event) => scrubSentryEvent(event) });
}

const log = createLogger('worker');

async function main() {
  const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  connection.on('error', (error: unknown) => {
    log.error({ err: error instanceof Error ? error.message : String(error) }, 'redis error');
  });

  // Backend.md §10 default: 5 attempts, exponential backoff from 10 s —
  // applies to every outbox-derived job (fan-outs are idempotent).
  const queue = new Queue(QUEUE_NAME, {
    connection,
    defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 10_000 } },
  });
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      if (job.name === PING_JOB) return handlePing();
      if (job.name === PUBLISH_OUTBOX_JOB) return handlePublishOutbox(queue);
      if (job.name === DEADLINE_ALERTS_JOB) return handleDeadlineAlerts(log);
      if (job.name === REMINDERS_JOB) return handleReminders(log);
      if (job.name === SEND_INVITE_JOB) return handleSendInvite(job.data, log);
      const handler = TOPIC_HANDLERS[job.name];
      if (handler) return handler(job.data, log, queue);
      throw new Error(`unknown job: ${job.name}`);
    },
    // Invite fan-outs enqueue thousands of sends; they overlap freely
    // (per-provider Redis limiters bound the actual send rate).
    { connection, concurrency: 20 },
  );

  worker.on('completed', (job) => {
    if (job.name === PUBLISH_OUTBOX_JOB) return; // every 2 s; too noisy to log
    log.info({ job: job.name, id: job.id }, 'job completed');
  });
  worker.on('failed', (job, error) => {
    log.error({ job: job?.name, id: job?.id, err: error.message }, 'job failed');
    Sentry.captureException(error);
  });

  let shuttingDown = false;
  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info({ signal }, 'shutting down');
    await worker.close();
    await queue.close();
    await connection.quit().catch(() => undefined);
    await Sentry.close(2000).catch(() => undefined);
    log.info('closed cleanly');
    process.exit(0);
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    log.error({ err: reason instanceof Error ? reason.message : String(reason) }, 'unhandled rejection');
  });

  await queue.add(PING_JOB, {}, { jobId: `boot-${Date.now()}`, removeOnComplete: 100 });
  // Single scheduler entry (upsert is idempotent across restarts and replicas).
  await queue.upsertJobScheduler(
    PUBLISH_OUTBOX_JOB,
    { every: PUBLISH_OUTBOX_EVERY_MS },
    { name: PUBLISH_OUTBOX_JOB, opts: { removeOnComplete: true, removeOnFail: 100 } },
  );
  await queue.upsertJobScheduler(
    DEADLINE_ALERTS_JOB,
    { every: DEADLINE_ALERTS_EVERY_MS },
    { name: DEADLINE_ALERTS_JOB, opts: { removeOnComplete: true, removeOnFail: 100 } },
  );
  await queue.upsertJobScheduler(
    REMINDERS_JOB,
    { every: REMINDERS_EVERY_MS },
    { name: REMINDERS_JOB, opts: { removeOnComplete: true, removeOnFail: 100 } },
  );
  log.info({ queue: QUEUE_NAME }, 'listening');
}

await main();
