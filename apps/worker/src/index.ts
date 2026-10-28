import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { PING_JOB, handlePing } from './jobs/ping.js';

const QUEUE_NAME = 'tiwa';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

function log(message: string) {
  // NOTE P0-T12: replaced by the shared pino logger when observability lands.
  console.log(`[worker] ${new Date().toISOString()} ${message}`);
}

async function main() {
  const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
  connection.on('error', (error: unknown) => {
    log(`redis error: ${error instanceof Error ? error.message : String(error)}`);
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
    log(`job completed: ${job.name} (${job.id})`);
  });
  worker.on('failed', (job, error) => {
    log(`job failed: ${job?.name} (${job?.id}): ${error.message}`);
  });

  let shuttingDown = false;
  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`received ${signal}, closing…`);
    await worker.close();
    await queue.close();
    await connection.quit().catch(() => undefined);
    log('closed cleanly');
    process.exit(0);
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    log(`unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}`);
  });

  await queue.add(PING_JOB, {}, { jobId: `boot-${Date.now()}`, removeOnComplete: 100 });
  log(`listening on queue "${QUEUE_NAME}" (redis ${REDIS_URL})`);
}

await main();
