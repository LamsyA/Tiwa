import { prisma } from '@tiwa/db';
import { vendorRating } from '../reviews/reviews.js';

/**
 * Rating roll-up (P14-T01, corrected D-X39): recompute the cached profile
 * columns from live reviews. The average only surfaces at 5+ reviews
 * (REV-05). Runs hourly; the profile cache feeds search sort/filter and
 * the public score, so a job (not on-read) keeps them consistent.
 */
export async function rollupVendorRatings(limit = 500): Promise<{ orgs: number }> {
  const groups = await prisma.review.groupBy({
    by: ['vendorOrgId'],
    _count: { _all: true },
    orderBy: { vendorOrgId: 'asc' },
    take: limit,
  });
  let orgs = 0;
  for (const group of groups) {
    const rating = await vendorRating(group.vendorOrgId);
    const completedBookings = await prisma.booking.count({
      where: { vendorOrgId: group.vendorOrgId, status: 'COMPLETED' },
    });
    const updated = await prisma.businessProfile.updateMany({
      where: { orgId: group.vendorOrgId },
      data: { ratingAvg: rating.average, ratingCount: rating.count, completedBookings },
    });
    orgs += updated.count;
  }
  return { orgs };
}
