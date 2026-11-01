'use server';

import {
  blockParty,
  blockPartySchema,
  reportMessage,
  reportMessageSchema,
  unblockParty,
  archiveThread,
  archiveThreadSchema,
  deleteMessage,
  editMessage,
  editMessageSchema,
  listMessages,
  markDecision,
  markDelivered,
  markRead,
  messageIdSchema,
  muteThread,
  muteThreadSchema,
  sendMessage,
  sendMessageSchema,
  startAttachment,
  startAttachmentSchema,
  startThread,
  startThreadSchema,
  threadReceiptSchema,
} from '@tiwa/core';
import { z } from 'zod';
import { publishToThread } from '@/lib/chat-live.js';
import { userAction } from '@/lib/ctx.js';
import { moderation } from '@/lib/moderation.js';
import { privateStorage } from '@/lib/storage.js';

// Chat actions (Backend.md §6). Each write publishes a small event to the
// thread's channels (§9a.2); clients refetch through these permission-checked reads.

export const startChat = userAction(startThreadSchema, async (input, ctx) => {
  const result = await startThread(ctx.actor, input);
  // A 'message' event also tells recipients about a brand-new thread (they refetch the inbox).
  await publishToThread(result.threadId, {
    type: 'message',
    threadId: result.threadId,
    messageId: result.messageId,
    authorUserId: ctx.actor.userId,
    at: Date.now(),
  });
  return result;
});

/** Signed PUT for one chat file; the browser uploads directly (D-A05), then sends the message. */
export const startChatAttachment = userAction(startAttachmentSchema, (input, ctx) =>
  startAttachment(privateStorage(), ctx.actor, input),
);

export const sendChatMessage = userAction(sendMessageSchema, async (input, ctx) => {
  const result = await sendMessage(ctx.actor, input, { storage: privateStorage(), moderation: moderation() });
  if (!result.duplicate) {
    await publishToThread(input.threadId, {
      type: 'message',
      threadId: input.threadId,
      messageId: result.messageId,
      authorUserId: ctx.actor.userId,
      at: Date.now(),
    });
  }
  return result;
});

export const editChatMessage = userAction(editMessageSchema, async (input, ctx) => {
  const { threadId } = await editMessage(ctx.actor, input);
  await publishToThread(threadId, { type: 'updated', threadId, messageId: input.messageId, at: Date.now() });
});

export const deleteChatMessage = userAction(messageIdSchema, async (input, ctx) => {
  const { threadId } = await deleteMessage(ctx.actor, input);
  await publishToThread(threadId, { type: 'updated', threadId, messageId: input.messageId, at: Date.now() });
});

export const markChatRead = userAction(threadReceiptSchema, async (input, ctx) => {
  const { at } = await markRead(ctx.actor, input);
  await publishToThread(
    input.threadId,
    {
      type: 'receipt',
      threadId: input.threadId,
      kind: 'read',
      upTo: at.toISOString(),
      byUserId: ctx.actor.userId,
      at: Date.now(),
    },
    { exceptUserId: ctx.actor.userId },
  );
});

export const markChatDelivered = userAction(threadReceiptSchema, async (input, ctx) => {
  const { at } = await markDelivered(ctx.actor, input);
  await publishToThread(
    input.threadId,
    {
      type: 'receipt',
      threadId: input.threadId,
      kind: 'delivered',
      upTo: at.toISOString(),
      byUserId: ctx.actor.userId,
      at: Date.now(),
    },
    { exceptUserId: ctx.actor.userId },
  );
});

export const muteChat = userAction(muteThreadSchema, (input, ctx) => muteThread(ctx.actor, input));
export const archiveChat = userAction(archiveThreadSchema, (input, ctx) => archiveThread(ctx.actor, input));

export const markChatDecision = userAction(
  messageIdSchema.extend({ decision: z.boolean().optional() }),
  async (input, ctx) => {
    const { threadId } = await markDecision(ctx.actor, input);
    await publishToThread(threadId, { type: 'updated', threadId, messageId: input.messageId, at: Date.now() });
  },
);

/** Older pages and re-syncs after reconnect. */
export const loadChatMessages = userAction(
  z.object({ threadId: z.string().uuid(), before: z.string().uuid().optional() }),
  (input, ctx) => listMessages(ctx.actor, input.threadId, input.before),
);

export const blockChatParty = userAction(blockPartySchema, (input, ctx) => blockParty(ctx.actor, input));
export const unblockChatParty = userAction(blockPartySchema, (input, ctx) => unblockParty(ctx.actor, input));
export const reportChatMessage = userAction(reportMessageSchema, (input, ctx) => reportMessage(ctx.actor, input));
