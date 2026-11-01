import { prisma } from '@tiwa/db';
import { getTranslations } from 'next-intl/server';
import * as React from 'react';
import { MessageBusiness } from './message-business.js';

/**
 * Guest enquiries (UF-31, Backend.md §9a.1): after the event ends, guests can
 * message the businesses that worked on it — if those businesses allow it.
 * The server re-checks every condition (attendance, verified phone) on send.
 */
export async function GuestEnquiries({ eventId, galleryId }: { eventId?: string; galleryId?: string }) {
  const id =
    eventId ??
    (galleryId
      ? (await prisma.gallery.findUnique({ where: { id: galleryId }, select: { eventId: true } }))?.eventId
      : undefined);
  if (!id) return null;
  const event = await prisma.event.findUnique({ where: { id }, select: { startsAt: true, endsAt: true } });
  const ended = event?.endsAt ?? event?.startsAt;
  if (!ended || ended > new Date()) return null;

  const rows = await prisma.eventParticipant.findMany({
    where: { eventId: id, removedAt: null, orgId: { not: null }, role: { in: ['VENDOR', 'PHOTOGRAPHER', 'PLANNER'] } },
    select: { orgId: true },
  });
  const orgIds = [...new Set(rows.map((row) => row.orgId as string))];
  if (orgIds.length === 0) return null;
  const businesses = await prisma.organization.findMany({
    where: { id: { in: orgIds }, deletedAt: null, profile: { allowGuestEnquiries: true } },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  if (businesses.length === 0) return null;
  const t = await getTranslations('inbox');
  return (
    <section aria-labelledby="guest-enquiries" className="border-border mt-6 rounded-lg border p-4 text-left">
      <h2 id="guest-enquiries" className="font-medium">
        {t('guestEnquiryHeading')}
      </h2>
      <p className="text-muted mb-3 text-sm">{t('guestEnquiryHint')}</p>
      <ul className="flex flex-col gap-2">
        {businesses.map((business) => (
          <li key={business.id} className="flex items-center gap-3">
            <span className="min-w-0 flex-1 truncate">{business.name}</span>
            <span className="w-36 shrink-0">
              <React.Suspense fallback={null}>
                <MessageBusiness orgId={business.id} orgName={business.name} guestEventId={id} variant="secondary" />
              </React.Suspense>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
