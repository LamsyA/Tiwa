'use server';

import {
  confirmOfflinePayment,
  declineOfflinePayment,
  offlinePaymentIdSchema,
  receiptUrl,
  recordOfflinePayment,
  recordOfflineSchema,
  requestBookingChange,
  requestChangeSchema,
  respondBookingChange,
  respondChangeSchema,
  startReceiptSchema,
  startReceiptUpload,
} from '@tiwa/core';
import { userAction } from '@/lib/ctx.js';
import { privateStorage } from '@/lib/storage.js';

/** Booking change requests (QTE-07, P7-T08): propose a new version, accept or decline it. */
export const requestChangeAction = userAction(requestChangeSchema, async (input, ctx) => {
  return requestBookingChange(ctx.actor, input);
});

export const respondChangeAction = userAction(respondChangeSchema, async (input, ctx) => {
  return respondBookingChange(ctx.actor, input, { ip: ctx.ip });
});

/** Offline payments (P8-T08, D-X27): host records, the vendor team confirms or says "not received". */
export const startReceiptAction = userAction(startReceiptSchema, async (input, ctx) =>
  startReceiptUpload(privateStorage(), ctx.actor, input),
);

export const recordOfflineAction = userAction(recordOfflineSchema, async (input, ctx) =>
  recordOfflinePayment(privateStorage(), ctx.actor, input, { ip: ctx.ip }),
);

export const confirmOfflineAction = userAction(offlinePaymentIdSchema, async (input, ctx) =>
  confirmOfflinePayment(ctx.actor, input, { ip: ctx.ip }),
);

export const declineOfflineAction = userAction(offlinePaymentIdSchema, async (input, ctx) =>
  declineOfflinePayment(ctx.actor, input, { ip: ctx.ip }),
);

export const receiptUrlAction = userAction(offlinePaymentIdSchema, async (input, ctx) =>
  receiptUrl(privateStorage(), ctx.actor, input),
);
