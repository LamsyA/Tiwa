import { syncEventTeamThread, type createLogger } from '@tiwa/core';
import { GUESTS_IMPORT_TOPIC, handleGuestCsvImport } from './csv-import.js';
import {
  MEDIA_PROCESS_IMAGE_TOPIC,
  MEDIA_PROCESS_VIDEO_TOPIC,
  MEDIA_WATERMARK_JOB,
  handleProcessImage,
  handleProcessVideo,
  handleWatermark,
} from './media.js';
import { MEDIA_ZIP_JOB, handleZip } from './zip.js';
import { INVITE_BATCH_QUEUED_TOPIC, handleInviteBatchQueued, type FanOutSink } from './send-invite.js';
import { NOTIFY_TOPIC, handleNotify } from './notify.js';

type Log = ReturnType<typeof createLogger>;

/**
 * Consumers for outbox topics. Topics whose consumer arrives in a later phase
 * are acknowledged and logged (ids only, never contact details) so they don't
 * retry forever; the outbox row keeps the record.
 */
/** Idempotent: safe to run on every member change, and twice. */
async function syncTeam(data: unknown, log: Log, topic: string) {
  const eventId = (data as { eventId?: string }).eventId;
  if (!eventId) return { skipped: true };
  const result = await syncEventTeamThread(eventId);
  log.info({ topic, eventId, members: result.members }, 'event-team thread synced');
  return result;
}

export const TOPIC_HANDLERS: Record<string, (data: unknown, log: Log, sink: FanOutSink) => Promise<unknown>> = {
  [GUESTS_IMPORT_TOPIC]: async (data, log) => handleGuestCsvImport(data, log),
  [INVITE_BATCH_QUEUED_TOPIC]: async (data, log, sink) => handleInviteBatchQueued(data, log, sink),
  // One notification pipeline (P13-T03): preferences + quiet hours applied at send time.
  [NOTIFY_TOPIC]: async (data, log) => handleNotify(data, log),
  [MEDIA_PROCESS_IMAGE_TOPIC]: async (data, log, sink) => handleProcessImage(data, log, sink),
  [MEDIA_PROCESS_VIDEO_TOPIC]: async (data, log, sink) => handleProcessVideo(data, log, sink),
  [MEDIA_WATERMARK_JOB]: async (data, log) => handleWatermark(data, log),
  [MEDIA_ZIP_JOB]: async (data, log) => handleZip(data, log),
  // Event-team chat (P6-T12): the thread follows the event's members.
  'event.finalized': async (data, log) => syncTeam(data, log, 'event.finalized'),
  'event.members.changed': async (data, log) => syncTeam(data, log, 'event.members.changed'),
  // Stub until refunds/notifications (P8/P13) consume it.
  'event.cancelled': async (data, log) => {
    log.info({ topic: 'event.cancelled', eventId: (data as { eventId?: string }).eventId }, 'event cancelled (stub)');
    return { stub: true };
  },
  // Stub until the export builder (ZIP of JSON + media links, Backend.md §12).
  'account.export.requested': async (data, log) => {
    log.info(
      { topic: 'account.export.requested', userId: (data as { userId?: string }).userId },
      'export queued (stub)',
    );
    return { stub: true };
  },
  // Stub until Moments (P5) deletes the user's uploads.
  'account.deleted': async (data, log) => {
    log.info({ topic: 'account.deleted', userId: (data as { userId?: string }).userId }, 'account deleted (stub)');
    return { stub: true };
  },
};
