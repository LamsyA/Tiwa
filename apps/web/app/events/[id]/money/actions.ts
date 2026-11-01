'use server';

import {
  addContribution,
  addContributionSchema,
  addExpense,
  addExpenseSchema,
  contributionIdSchema,
  deleteContribution,
  deleteExpense,
  expenseIdSchema,
  recordContributionReceived,
  recordReceivedSchema,
  setAllocations,
  setAllocationsSchema,
  setExpensePaid,
  setExpensePaidSchema,
  startExpenseReceipt,
  startExpenseReceiptSchema,
} from '@tiwa/core';
import { userAction } from '@/lib/ctx.js';
import { privateStorage } from '@/lib/storage.js';

/** Budget edits (P9-T04, UF-20): money.edit is enforced in core. */
export const setAllocationsAction = userAction(setAllocationsSchema, (input, ctx) => setAllocations(ctx.actor, input));

export const startExpenseReceiptAction = userAction(startExpenseReceiptSchema, (input, ctx) =>
  startExpenseReceipt(privateStorage(), ctx.actor, input),
);

export const addExpenseAction = userAction(addExpenseSchema, (input, ctx) =>
  addExpense(privateStorage(), ctx.actor, input),
);

export const setExpensePaidAction = userAction(setExpensePaidSchema, (input, ctx) => setExpensePaid(ctx.actor, input));

export const deleteExpenseAction = userAction(expenseIdSchema, (input, ctx) => deleteExpense(ctx.actor, input));

export const addContributionAction = userAction(addContributionSchema, (input, ctx) =>
  addContribution(ctx.actor, input),
);

export const recordReceivedAction = userAction(recordReceivedSchema, (input, ctx) =>
  recordContributionReceived(ctx.actor, input),
);

export const deleteContributionAction = userAction(contributionIdSchema, (input, ctx) =>
  deleteContribution(ctx.actor, input),
);
