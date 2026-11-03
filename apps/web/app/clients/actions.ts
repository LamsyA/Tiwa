'use server';

import {
  addToVendorBook,
  addVendorBookSchema,
  createClient,
  createClientSchema,
  createProposal,
  createProposalSchema,
  decideProposal,
  listVendorBook,
  moveLead,
  moveLeadSchema,
  sendProposal,
  proposalIdSchema,
  startClientEvent,
  startClientEventSchema,
} from '@tiwa/core';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { userAction } from '@/lib/ctx.js';

export const createClientAction = userAction(createClientSchema, async (input, ctx) => {
  const result = await createClient(ctx.actor, input);
  revalidatePath('/clients');
  revalidatePath('/pipeline');
  revalidatePath('/home');
  return { id: result.id };
});

export const moveLeadAction = userAction(moveLeadSchema, async (input, ctx) => {
  const result = await moveLead(ctx.actor, input);
  revalidatePath('/clients');
  revalidatePath('/pipeline');
  revalidatePath('/home');
  return { stage: result.stage };
});

export const createProposalAction = userAction(createProposalSchema, async (input, ctx) => {
  const result = await createProposal(ctx.actor, input);
  revalidatePath(`/clients/${input.clientId}`);
  return result;
});

export const sendProposalAction = userAction(proposalIdSchema, async (input, ctx) => {
  const result = await sendProposal(ctx.actor, input.proposalId);
  revalidatePath('/clients');
  return result;
});

export const decideProposalAction = userAction(
  z.object({ proposalId: z.string().uuid(), accepted: z.boolean() }),
  async (input, ctx) => {
    const result = await decideProposal(ctx.actor, input);
    revalidatePath('/clients');
    return result;
  },
);

export const addVendorBookAction = userAction(addVendorBookSchema, async (input, ctx) => {
  const result = await addToVendorBook(ctx.actor, input);
  revalidatePath('/vendor-book');
  return { id: result.id };
});

export { listVendorBook };

/** D-X47: create the client's event as a draft and continue in the wizard. */
export const startClientEventAction = userAction(startClientEventSchema, async (input, ctx) => {
  const result = await startClientEvent(ctx.actor, input);
  revalidatePath('/clients');
  revalidatePath('/home');
  return result;
});
