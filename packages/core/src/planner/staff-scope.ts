import { prisma } from '@tiwa/db';

/**
 * D-X88: Staff in a planner business see only the events they are assigned
 * to. Owners and admins see the whole business. Returns a Prisma `where`
 * fragment for EventParticipant/Task-style rows keyed by `eventId`.
 */
export async function staffEventIds(userId: string, orgId: string): Promise<string[] | null> {
  const membership = await prisma.membership.findUnique({
    where: { orgId_userId: { orgId, userId } },
    select: { role: true },
  });
  if (membership?.role !== 'STAFF') return null;
  const rows = await prisma.eventParticipant.findMany({
    where: { orgId, userId, role: 'PLANNER_STAFF', removedAt: null },
    select: { eventId: true },
  });
  return rows.map((row) => row.eventId);
}

export async function staffEventWhere(userId: string, orgId: string): Promise<{ eventId?: { in: string[] } }> {
  const ids = await staffEventIds(userId, orgId);
  return ids ? { eventId: { in: ids } } : {};
}

/** Client ids a staff member may see: clients behind their assigned events. */
export async function staffClientIds(userId: string, orgId: string): Promise<string[] | null> {
  const ids = await staffEventIds(userId, orgId);
  if (!ids) return null;
  const requests = await prisma.quoteRequest.findMany({
    where: { eventId: { in: ids }, clientId: { not: null } },
    select: { clientId: true },
  });
  return [...new Set(requests.map((row) => row.clientId as string))];
}
