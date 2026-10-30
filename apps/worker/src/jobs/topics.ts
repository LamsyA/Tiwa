import type { createLogger } from '@tiwa/core';
import { GUESTS_IMPORT_TOPIC, handleGuestCsvImport } from './csv-import.js';

type Log = ReturnType<typeof createLogger>;

/**
 * Consumers for outbox topics. Topics whose consumer arrives in a later phase
 * are acknowledged and logged (ids only, never contact details) so they don't
 * retry forever; the outbox row keeps the record.
 */
export const TOPIC_HANDLERS: Record<string, (data: unknown, log: Log) => Promise<unknown>> = {
  [GUESTS_IMPORT_TOPIC]: async (data, log) => handleGuestCsvImport(data, log),
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
