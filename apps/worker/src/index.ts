import * as Sentry from '@sentry/node';
import { Queue, Worker } from 'bullmq';
import { env } from '@tiwa/config';
import { createLogger, scrubSentryEvent } from '@tiwa/core';
import { Redis } from 'ioredis';
import { DEADLINE_ALERTS_EVERY_MS, DEADLINE_ALERTS_JOB, handleDeadlineAlerts } from './jobs/deadline-alerts.js';
import {
  HOLD_EXPIRY_EVERY_MS,
  HOLD_EXPIRY_JOB,
  QUOTE_EXPIRY_EVERY_MS,
  QUOTE_EXPIRY_JOB,
  handleHoldExpiry,
  handleQuoteExpiry,
} from './jobs/quote-expiry.js';
import { REMINDERS_EVERY_MS, REMINDERS_JOB, handleReminders } from './jobs/reminders.js';
import { TICKET_EXPIRY_EVERY_MS, TICKET_EXPIRY_JOB, handleTicketExpiry } from './jobs/ticket-expiry.js';
import { DAY_PROGRESS_EVERY_MS, DAY_PROGRESS_JOB, handleDayProgress } from './jobs/day-progress.js';
import { CHAT_NUDGES_EVERY_MS, CHAT_NUDGES_JOB, handleChatNudges } from './jobs/chat-nudges.js';
import { ROLLUP_RATINGS_EVERY_MS, ROLLUP_RATINGS_JOB, handleRollupRatings } from './jobs/rollup-ratings.js';
import { AI_CAPTIONS_EVERY_MS, AI_CAPTIONS_JOB, handleAiCaptions } from './jobs/ai-captions.js';
import { RETENTION_EVERY_MS, RETENTION_JOB, handleRetention } from './jobs/retention.js';
import { PING_JOB, handlePing } from './jobs/ping.js';
import { PUBLISH_OUTBOX_EVERY_MS, PUBLISH_OUTBOX_JOB, handlePublishOutbox } from './jobs/publish-outbox.js';
import { MEDIA_MODERATE_JOB, handleModerate } from './jobs/media.js';
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
      if (job.name === QUOTE_EXPIRY_JOB) return handleQuoteExpiry(log);
      if (job.name === TICKET_EXPIRY_JOB) return handleTicketExpiry(log);
      if (job.name === DAY_PROGRESS_JOB) return handleDayProgress(log);
      if (job.name === CHAT_NUDGES_JOB) return handleChatNudges(log);
      if (job.name === ROLLUP_RATINGS_JOB) return handleRollupRatings(log);
      if (job.name === AI_CAPTIONS_JOB) return handleAiCaptions(log);
      if (job.name === HOLD_EXPIRY_JOB) return handleHoldExpiry(log);
      if (job.name === RETENTION_JOB) return handleRetention(log);
      if (job.name === SEND_INVITE_JOB) return handleSendInvite(job.data, log);
      if (job.name === MEDIA_MODERATE_JOB) return handleModerate(job.data, log);
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
  await queue.upsertJobScheduler(
    RETENTION_JOB,
    { every: RETENTION_EVERY_MS },
    { name: RETENTION_JOB, opts: { removeOnComplete: true, removeOnFail: 100 } },
  );
  await queue.upsertJobScheduler(
    QUOTE_EXPIRY_JOB,
    { every: QUOTE_EXPIRY_EVERY_MS },
    { name: QUOTE_EXPIRY_JOB, opts: { removeOnComplete: true, removeOnFail: 100 } },
  );
  await queue.upsertJobScheduler(
    HOLD_EXPIRY_JOB,
    { every: HOLD_EXPIRY_EVERY_MS },
    { name: HOLD_EXPIRY_JOB, opts: { removeOnComplete: true, removeOnFail: 100 } },
  );
  await queue.upsertJobScheduler(
    TICKET_EXPIRY_JOB,
    { every: TICKET_EXPIRY_EVERY_MS },
    { name: TICKET_EXPIRY_JOB, opts: { removeOnComplete: true, removeOnFail: 100 } },
  );
  await queue.upsertJobScheduler(
    DAY_PROGRESS_JOB,
    { every: DAY_PROGRESS_EVERY_MS },
    { name: DAY_PROGRESS_JOB, opts: { removeOnComplete: true, removeOnFail: 100 } },
  );
  await queue.upsertJobScheduler(
    CHAT_NUDGES_JOB,
    { every: CHAT_NUDGES_EVERY_MS },
    { name: CHAT_NUDGES_JOB, opts: { removeOnComplete: true, removeOnFail: 100 } },
  );
  await queue.upsertJobScheduler(
    ROLLUP_RATINGS_JOB,
    { every: ROLLUP_RATINGS_EVERY_MS },
    { name: ROLLUP_RATINGS_JOB, opts: { removeOnComplete: true, removeOnFail: 100 } },
  );
  await queue.upsertJobScheduler(
    AI_CAPTIONS_JOB,
    { every: AI_CAPTIONS_EVERY_MS },
    { name: AI_CAPTIONS_JOB, opts: { removeOnComplete: true, removeOnFail: 100 } },
  );
  log.info({ queue: QUEUE_NAME }, 'listening');
}

await main();
