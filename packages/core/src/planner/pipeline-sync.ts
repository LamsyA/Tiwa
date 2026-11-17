import { PLANNING_CATEGORY } from '@tiwa/config';
import type { Prisma } from '@tiwa/db';

// Proposal → pipeline sync (D-X69). A host asking a planner for a proposal
// becomes a client in that planner's CRM, and the client's pipeline stage
// follows the proposal: request → ENQUIRY, sent → PROPOSAL_SENT, accepted →
// WON, declined → LOST. WON is sticky: a lost bid on another event never
// moves a client who already hired the planner back down the pipeline.

type Tx = Prisma.TransactionClient;
export type PipelineStage = 'ENQUIRY' | 'PROPOSAL_SENT' | 'WON' | 'LOST';

/** The planner org's CRM client for this host, created on first contact. */
export async function ensurePlannerClient(tx: Tx, input: { orgId: string; hostUserId: string }): Promise<string> {
  const existing = await tx.client.findUnique({
    where: { orgId_userId: { orgId: input.orgId, userId: input.hostUserId } },
    select: { id: true, stage: true },
  });
  if (existing) {
    // A returning client the planner had lost is a fresh enquiry again.
    if (existing.stage === 'LOST') {
      await tx.client.update({ where: { id: existing.id }, data: { stage: 'ENQUIRY' } });
    }
    return existing.id;
  }
  const user = await tx.user.findUniqueOrThrow({
    where: { id: input.hostUserId },
    select: { name: true, phone: true, email: true },
  });
  const created = await tx.client.create({
    data: {
      orgId: input.orgId,
      userId: input.hostUserId,
      name: user.name?.trim() || 'Client',
      phone: user.phone,
      // Placeholder addresses (D-X56) are not contact details.
      email: user.email && !user.email.endsWith('.tiwa.local') ? user.email : null,
      stage: 'ENQUIRY',
    },
    select: { id: true },
  });
  return created.id;
}

/** Move the client behind a planning request; WON never moves back. */
export async function syncPipelineForRequest(tx: Tx, requestId: string | null, stage: PipelineStage): Promise<void> {
  if (!requestId) return;
  const request = await tx.quoteRequest.findUnique({
    where: { id: requestId },
    select: { category: true, clientId: true },
  });
  if (!request || request.category !== PLANNING_CATEGORY || !request.clientId) return;
  await tx.client.updateMany({
    where: { id: request.clientId, ...(stage === 'WON' ? {} : { stage: { not: 'WON' } }) },
    data: { stage },
  });
}
