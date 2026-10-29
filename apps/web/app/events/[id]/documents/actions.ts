'use server';

import {
  completeDocumentUpload,
  deleteDocument,
  documentIdSchema,
  startDocumentSchema,
  startDocumentUpload,
} from '@tiwa/core';
import { userAction } from '@/lib/ctx.js';
import { eventChannel, publishLive } from '@/lib/live.js';
import { privateStorage } from '@/lib/storage.js';

/** Step 1: a document row + a signed PUT the browser uploads to directly (D-A05). */
export const startUpload = userAction(startDocumentSchema, (input, ctx) =>
  startDocumentUpload(privateStorage(), ctx.actor, input),
);

/** Step 2: verify size and magic bytes, then list it. */
export const completeUpload = userAction(documentIdSchema, async (input, ctx) => {
  const result = await completeDocumentUpload(privateStorage(), ctx.actor, input);
  await publishLive(eventChannel(input.eventId), 'documents');
  return result;
});

export const removeDocument = userAction(documentIdSchema, async (input, ctx) => {
  await deleteDocument(privateStorage(), ctx.actor, input);
  await publishLive(eventChannel(input.eventId), 'documents');
});
