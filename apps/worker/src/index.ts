import * as Sentry from '@sentry/node';
import { Queue, Worker } from 'bullmq';
import { env } from '@tiwa/config';
import { createLogger, scrubSentryEvent } from '@tiwa/core';
import { Redis } from 'ioredis';
import { PING_JOB, handlePing } from './jobs/ping.js';

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

  const queue = new Queue(QUEUE_NAME, { connection });
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      if (job.name === PING_JOB) return handlePing();
      throw new Error(`unknown job: ${job.name}`);
    },
    { connection },
  );

  worker.on('completed', (job) => {
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
  log.info({ queue: QUEUE_NAME }, 'listening');
}

await main();
