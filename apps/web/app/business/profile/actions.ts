'use server';

import {
  addMomentsSchema,
  addMomentsToPortfolio,
  archivePackage,
  archivePackageSchema,
  blockAvailability,
  blockAvailabilitySchema,
  completePortfolioUpload,
  confirmAvailability,
  confirmAvailabilitySchema,
  portfolioItemSchema,
  publishProfile,
  publishProfileSchema,
  removeBankAccount,
  removeBankAccountSchema,
  removePortfolioItem,
  removeVerificationDocument,
  savePackage as saveCorePackage,
  savePackageSchema,
  setupBankAccount,
  setupBankAccountSchema,
  startPortfolioUpload,
  startPortfolioUploadSchema,
  startVerificationUpload,
  startVerificationUploadSchema,
  submitVerification,
  submitVerificationSchema,
  unblockAvailability,
  unblockAvailabilitySchema,
  upsertBusinessProfile,
  upsertBusinessProfileSchema,
} from '@tiwa/core';
import { revalidatePath, updateTag } from 'next/cache';
import { z } from 'zod';
import { userAction } from '@/lib/ctx.js';
import { privateStorage } from '@/lib/storage.js';

/** P6-T02: business profile editing (org ADMIN+ enforced in core). Public
 * pages cache by tag `vendor:{orgId}` (P6-T04), so every mutation refreshes them. */
function refreshBusiness(orgId: string) {
  revalidatePath('/business/profile');
  updateTag(`vendor:${orgId}`);
}

export const saveBusinessProfile = userAction(upsertBusinessProfileSchema, async (input, ctx) => {
  await upsertBusinessProfile(ctx.actor, input);
  refreshBusiness(input.orgId);
});

export const saveBusinessPackage = userAction(savePackageSchema, async (input, ctx) => {
  await saveCorePackage(ctx.actor, input);
  refreshBusiness(input.orgId);
});

export const archiveBusinessPackage = userAction(archivePackageSchema, async (input, ctx) => {
  await archivePackage(ctx.actor, input);
  refreshBusiness(input.orgId);
});

export const startPortfolioItem = userAction(startPortfolioUploadSchema, async (input, ctx) => {
  return startPortfolioUpload(privateStorage(), ctx.actor, input);
});

/** Tag Moments photos from verified events (P14-T04): pending host approval. */
export const addMomentsToPortfolioAction = userAction(addMomentsSchema, async (input, ctx) => {
  const result = await addMomentsToPortfolio(ctx.actor, input);
  refreshBusiness(input.orgId);
  return result;
});

export const completePortfolioItem = userAction(portfolioItemSchema, async (input, ctx) => {
  await completePortfolioUpload(privateStorage(), ctx.actor, input);
  refreshBusiness(input.orgId);
});

export const removePortfolioPhoto = userAction(portfolioItemSchema, async (input, ctx) => {
  await removePortfolioItem(privateStorage(), ctx.actor, input);
  refreshBusiness(input.orgId);
});

export const blockBusinessDate = userAction(blockAvailabilitySchema, async (input, ctx) => {
  await blockAvailability(ctx.actor, input);
  refreshBusiness(input.orgId);
});

export const unblockBusinessDate = userAction(unblockAvailabilitySchema, async (input, ctx) => {
  await unblockAvailability(ctx.actor, input);
  refreshBusiness(input.orgId);
});

export const confirmBusinessAvailability = userAction(confirmAvailabilitySchema, async (input, ctx) => {
  await confirmAvailability(ctx.actor, input);
  refreshBusiness(input.orgId);
});

export const setProfilePublished = userAction(publishProfileSchema, async (input, ctx) => {
  await publishProfile(ctx.actor, input);
  refreshBusiness(input.orgId);
});

export const startVerificationDoc = userAction(startVerificationUploadSchema, async (input, ctx) => {
  return startVerificationUpload(privateStorage(), ctx.actor, input);
});

export const submitBusinessVerification = userAction(submitVerificationSchema, async (input, ctx) => {
  await submitVerification(privateStorage(), ctx.actor, input);
  refreshBusiness(input.orgId);
});

export const removeVerificationDoc = userAction(
  z.object({ orgId: z.string().uuid(), storageKey: z.string().min(1) }),
  async (input, ctx) => {
    await removeVerificationDocument(privateStorage(), ctx.actor, input);
  },
);

/** D-X46: payout bank account (OWNER only, enforced in core). */
export const savePayoutAccount = userAction(setupBankAccountSchema, async (input, ctx) => {
  await setupBankAccount(ctx.actor, input);
  revalidatePath('/business/profile');
});

export const removePayoutAccount = userAction(removeBankAccountSchema, async (input, ctx) => {
  await removeBankAccount(ctx.actor, input);
  revalidatePath('/business/profile');
});
