'use server';

import {
  addBudgetCategory,
  addBudgetCategorySchema,
  addContribution,
  applySuggestedBudget,
  budgetCategoryRefSchema,
  eventIdSchema,
  removeBudgetCategory,
  renameBudgetCategory,
  renameBudgetCategorySchema,
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
  draftBudgetSplit,
  draftBudgetSplitSchema,
  plannerFeeSchema,
  setPlannerFee,
} from '@tiwa/core';
import { assistantFor } from '@/lib/ai.js';
import { revalidatePath } from 'next/cache';
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

/** Custom budget lines and the opt-in suggested split (D-X30). */
export const addBudgetCategoryAction = userAction(addBudgetCategorySchema, (input, ctx) =>
  addBudgetCategory(ctx.actor, input),
);

export const renameBudgetCategoryAction = userAction(renameBudgetCategorySchema, (input, ctx) =>
  renameBudgetCategory(ctx.actor, input),
);

export const removeBudgetCategoryAction = userAction(budgetCategoryRefSchema, (input, ctx) =>
  removeBudgetCategory(ctx.actor, input),
);

export const applySuggestedBudgetAction = userAction(eventIdSchema, (input, ctx) =>
  applySuggestedBudget(ctx.actor, input),
);

/** AI budget split (AI-01): a proposal only — Apply goes through setAllocationsAction (AI-06). */
export const draftBudgetSplitAction = userAction(draftBudgetSplitSchema, async (input, ctx) =>
  draftBudgetSplit(await assistantFor(ctx.actor.userId, input.eventId), ctx.actor, input),
);

/** D-X47: the planner's fee agreement on this event (planner only, enforced in core). */
export const savePlannerFee = userAction(plannerFeeSchema, async (input, ctx) => {
  await setPlannerFee(ctx.actor, input);
  revalidatePath(`/events/${input.eventId}/money`);
});
