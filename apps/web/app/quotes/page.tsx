import { listEnquiries, listMyOrgs, listPendingChanges, listSiteVisits } from '@tiwa/core';
import { Button, Card, EmptyState, StatusPill } from '@tiwa/ui';
import { Inbox } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AppFrame } from '@/components/app-frame.js';
import { requirePageUser } from '@/lib/ctx.js';
import { ChangeCards } from './change-cards.js';
import { VisitCards } from './visit-cards.js';

/** Vendor quote inbox (VND-01, P7-T04): open briefs with status. Full quotes arrive with P7-T05. */
export default async function QuotesInboxPage() {
  const ctx = await requirePageUser('/quotes');
  const t = await getTranslations('quotes');
  const enquiries = await listEnquiries(ctx.actor).catch(() => null);
  const orgs = enquiries === null ? [] : await listMyOrgs(ctx.actor.userId).catch(() => []);
  const vendorOrgIds = (orgs ?? []).filter((row) => row.org.kind === 'VENDOR').map((row) => row.org.id);
  const visits = (
    await Promise.all(vendorOrgIds.map((orgId) => listSiteVisits(ctx.actor, { vendorOrgId: orgId }).catch(() => [])))
  )
    .flat()
    .map((row) => ({
      id: row.id,
      eventId: 'eventId' in row ? ((row as { eventId?: string | null }).eventId ?? null) : null,
      proposedTimes: row.proposedTimes.map((time) => (time instanceof Date ? time.toISOString() : String(time))),
      confirmedAt: row.confirmedAt ? row.confirmedAt.toISOString() : null,
      status: row.status,
      notes: row.notes,
      event: (() => {
        const withEvent = row as unknown as { event?: { name: string; startsAt: Date | null } | null };
        return withEvent.event
          ? { name: withEvent.event.name, startsAt: withEvent.event.startsAt?.toISOString() ?? null }
          : null;
      })(),
    }));
  const changes = (
    await Promise.all(vendorOrgIds.map((orgId) => listPendingChanges(ctx.actor, { vendorOrgId: orgId }).catch(() => [])))
  ).flat();

  return (
    <AppFrame userId={ctx.actor.userId} active="quotes" title={t('inboxTitle')}>
      <div className="flex flex-col gap-4 py-4">
        <p className="text-muted text-sm">{t('inboxBody')}</p>
        <VisitCards visits={visits} />
        <ChangeCards changes={changes} />
        {enquiries === null ? (
          <EmptyState icon={<Inbox className="size-8" aria-hidden />} title={t('noEnquiries')} body="" />
        ) : enquiries.length === 0 ? (
          <EmptyState icon={<Inbox className="size-8" aria-hidden />} title={t('noEnquiries')} body="" />
        ) : (
          <ul className="flex flex-col gap-3">
            {enquiries.map((row) => {
              const brief = row.brief as { eventName?: string; venue?: string | null; expectedGuests?: number | null };
              return (
                <li key={row.id}>
                  <Card>
                    <div className="flex flex-col gap-2 p-4">
                      <div className="flex items-center gap-2">
                        <p className="min-w-0 flex-1 truncate font-medium">{brief.eventName ?? row.event.name}</p>
                        <StatusPill tone="brand">{row.status}</StatusPill>
                      </div>
                      <p className="text-muted text-sm">
                        {row.category} · {brief.venue ?? row.event.name}
                        {typeof brief.expectedGuests === 'number' ? ` · ${brief.expectedGuests}` : ''}
                      </p>
                      <div className="flex gap-2">
                        <Link href={`/quotes/${row.id}`}>
                          <Button variant="secondary">{t('builderTitle')}</Button>
                        </Link>
                      </div>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppFrame>
  );
}
