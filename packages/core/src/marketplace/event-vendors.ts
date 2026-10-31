import { VENDOR_CATEGORIES, getEventType } from '@tiwa/config';
import { prisma } from '@tiwa/db';
import { z } from 'zod';
import type { Actor } from '../auth/authorize.js';
import { requireEventAccess } from '../events/access.js';

// Event vendors board (P6-T07): the template's suggested categories with the
// event's shortlist signal. Quoting/booked states arrive with P7 (quotes).

type UserActor = Extract<Actor, { kind: 'user' }>;

export const eventVendorsSchema = z.object({ eventId: z.string().uuid() });

export interface EventVendorCategory {
  category: string;
  label: string;
  shortlisted: number;
}

export async function getEventVendorCategories(
  actor: UserActor,
  input: z.infer<typeof eventVendorsSchema>,
): Promise<EventVendorCategory[]> {
  await requireEventAccess(actor, input.eventId, 'event.view');
  const event = await prisma.event.findUniqueOrThrow({ where: { id: input.eventId }, select: { type: true } });
  const template = getEventType(event.type);
  if (!template) return [];
  const picks = await prisma.shortlist.findMany({ where: { eventId: input.eventId }, select: { orgId: true } });
  const counts = new Map<string, number>();
  if (picks.length > 0) {
    const profiles = await prisma.businessProfile.findMany({
      where: { orgId: { in: picks.map((row) => row.orgId) } },
      select: { categories: true },
    });
    for (const profile of profiles) {
      for (const category of profile.categories) counts.set(category, (counts.get(category) ?? 0) + 1);
    }
  }
  return template.vendorCategories.map((category) => ({
    category,
    label: VENDOR_CATEGORIES[category as keyof typeof VENDOR_CATEGORIES] ?? category,
    shortlisted: counts.get(category) ?? 0,
  }));
}
