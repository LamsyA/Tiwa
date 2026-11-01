'use server';

import {
  createInvoice,
  createInvoiceSchema,
  invoiceIdSchema,
  markInvoicePaid,
  sendInvoice,
  voidInvoice,
} from '@tiwa/core';
import { revalidatePath } from 'next/cache';
import { userAction } from '@/lib/ctx.js';

export const createInvoiceAction = userAction(createInvoiceSchema, async (input, ctx) => {
  const result = await createInvoice(ctx.actor, input);
  revalidatePath('/invoices');
  return { id: result.id };
});

export const sendInvoiceAction = userAction(invoiceIdSchema, async (input, ctx) => {
  const result = await sendInvoice(ctx.actor, input.invoiceId);
  revalidatePath('/invoices');
  return { status: result.status };
});

export const markInvoicePaidAction = userAction(invoiceIdSchema, async (input, ctx) => {
  const result = await markInvoicePaid(ctx.actor, input.invoiceId);
  revalidatePath('/invoices');
  return { status: result.status };
});

export const voidInvoiceAction = userAction(invoiceIdSchema, async (input, ctx) => {
  const result = await voidInvoice(ctx.actor, input.invoiceId);
  revalidatePath('/invoices');
  return { status: result.status };
});
