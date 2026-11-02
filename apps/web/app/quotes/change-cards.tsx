import type { ChangeSummary as Summary } from '@tiwa/core';
import { StatusPill, buttonClasses } from '@tiwa/ui';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { ChangeSummary } from '@/components/bookings/change-summary.js';
import { PendingDecision } from '../events/[id]/bookings/[bookingId]/change-dialog.js';

export interface PendingChangeRow {
  id: string;
  version: number;
  reason: string | null;
  proposedBy: 'host' | 'vendor';
  mine: boolean;
  summary: Summary;
  booking: { id: string; eventId: string; currency: string; event: { name: string } };
}

/** Change requests on the vendor's bookings (P7-T08, UF-19): what the client wants, line by line, then Accept / Decline. */
export async function ChangeCards({ changes }: { changes: PendingChangeRow[] }) {
  const t = await getTranslations('bookings.change');
  if (changes.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" aria-labelledby="change-requests">
      <h2 id="change-requests" className="font-medium">
        {t('inboxHeading')}
      </h2>
      <ul className="flex flex-col gap-3">
        {changes.map((row) => (
          <li key={row.id} className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-sm">
              <p className="flex-1 font-semibold">{row.booking.event.name}</p>
              <Link href={`/bookings/${row.booking.id}`} className={buttonClasses({ variant: 'ghost', size: 'sm' })}>
                {t('openBooking')}
              </Link>
            </div>
            {row.proposedBy === 'host' ? (
              <PendingDecision
                versionId={row.id}
                mine={false}
                otherName={t('client')}
                askedBy={t('client')}
                reason={row.reason}
                summary={row.summary}
                currency={row.booking.currency}
              />
            ) : (
              <div className="border-border/70 bg-surface flex flex-col gap-3 rounded-3xl border p-4">
                <StatusPill tone="brand">{t('waitingOnClient')}</StatusPill>
                <ChangeSummary summary={row.summary} currency={row.booking.currency} reason={row.reason} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
