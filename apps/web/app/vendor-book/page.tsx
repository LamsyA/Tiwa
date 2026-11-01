import { listMyOrgs, listVendorBook } from '@tiwa/core';
import { Card, EmptyState, buttonClasses } from '@tiwa/ui';
import { BookUser } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AppFrame } from '@/components/app-frame.js';
import { requirePageUser } from '@/lib/ctx.js';
import { VendorBookForms } from './forms.js';

/** Private vendor book (PLN-06, P10-T06): trusted vendors, add to event with no fee. */
export default async function VendorBookPage() {
  const ctx = await requirePageUser('/vendor-book');
  const t = await getTranslations('planner');
  const orgs = await listMyOrgs(ctx.actor.userId);
  const plannerOrg = orgs.find((r) => r.org.kind === 'PLANNER')?.org;
  if (!plannerOrg) {
    return (
      <AppFrame userId={ctx.actor.userId} active="clients" title={t('vendorBookTitle')}>
        <EmptyState icon={<BookUser className="size-8" aria-hidden />} title={t('emptyVendorBook')} body="" />
      </AppFrame>
    );
  }
  const entries = await listVendorBook(ctx.actor, plannerOrg.id);
  const { listMyEvents } = await import('@tiwa/core');
  const events = await listMyEvents(ctx.actor.userId, 'upcoming');
  return (
    <AppFrame userId={ctx.actor.userId} active="clients" title={t('vendorBookTitle')}>
      <div className="flex flex-col gap-4 py-2">
        <VendorBookForms orgId={plannerOrg.id} events={events.map((e) => ({ id: e.id, name: e.name }))} />
        {entries.length === 0 ? (
          <EmptyState icon={<BookUser className="size-8" aria-hidden />} title={t('emptyVendorBook')} body="" />
        ) : (
          <ul className="flex flex-col gap-2">
            {entries.map((entry) => (
              <li key={entry.id}>
                <Card className="flex flex-col gap-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{entry.name}</p>
                    <span className="text-muted text-sm">{entry.category}</span>
                  </div>
                  {(entry.notes || entry.rateNote) && (
                    <p className="text-muted text-sm">{[entry.notes, entry.rateNote].filter(Boolean).join(' · ')}</p>
                  )}
                  {!entry.vendorOrgId && <p className="text-muted text-sm">{t('externalHint')}</p>}
                  <div className="flex flex-wrap gap-2">
                    {entry.vendorOrgId && (
                      <Link href={`/inbox?to=${entry.vendorOrgId}`} className={buttonClasses({ variant: 'secondary' })}>
                        {t('messageAction')}
                      </Link>
                    )}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppFrame>
  );
}
