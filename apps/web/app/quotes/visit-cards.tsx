'use client';

import { Banner, Button, Card, Input, StatusPill } from '@tiwa/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import {
  cancelSiteVisitAction,
  completeSiteVisitAction,
  confirmSiteVisitAction,
  declineSiteVisitAction,
} from './actions.js';

export interface VisitRow {
  id: string;
  eventId: string | null;
  proposedTimes: (string | Date)[];
  confirmedAt: string | Date | null;
  status: string;
  notes: string | null;
  event?: { name: string; startsAt: string | Date | null } | null;
}

/** Venue site visit decisions (P7-T11): confirm one proposed time, decline, complete, cancel. */
export function VisitCards({ visits }: { visits: VisitRow[] }) {
  const t = useTranslations('quotes');
  const te = useTranslations('quotes.errors');
  const router = useRouter();
  const [picked, setPicked] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);

  async function run(action: Promise<{ ok: boolean; code?: string }>) {
    const result = await action;
    if (!result.ok) setError(te(result.code as 'VALIDATION'));
    else router.refresh();
  }

  if (visits.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <h2 className="font-medium">{t('visitsHeading')}</h2>
      {error && <Banner tone="danger">{error}</Banner>}
      <ul className="flex flex-col gap-2">
        {visits.map((visit) => (
          <li key={visit.id}>
            <Card>
              <div className="flex flex-col gap-2 p-4 text-sm">
                <div className="flex items-center gap-2">
                  <p className="flex-1 font-medium">{visit.event?.name ?? t('visitsHeading')}</p>
                  <StatusPill tone={visit.status === 'CONFIRMED' ? 'success' : 'neutral'}>{visit.status}</StatusPill>
                </div>
                <p className="text-muted">
                  {visit.proposedTimes.map((time) => new Date(time).toLocaleString()).join(' · ')}
                </p>
                {visit.notes && <p className="text-muted">{visit.notes}</p>}
                {visit.status === 'REQUESTED' && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      aria-label={t('confirmLabel')}
                      type="datetime-local"
                      value={picked[visit.id] ?? ''}
                      onChange={(e) => setPicked({ ...picked, [visit.id]: e.target.value })}
                    />
                    <Button
                      disabled={!picked[visit.id]}
                      onClick={() =>
                        void run(
                          confirmSiteVisitAction({
                            visitId: visit.id,
                            confirmedAt: new Date(picked[visit.id] as string).toISOString(),
                          }),
                        )
                      }
                    >
                      {t('confirmVisit')}
                    </Button>
                    <Button variant="secondary" onClick={() => void run(declineSiteVisitAction({ visitId: visit.id }))}>
                      {t('decline')}
                    </Button>
                  </div>
                )}
                {visit.status === 'CONFIRMED' && (
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => void run(completeSiteVisitAction({ visitId: visit.id }))}
                    >
                      {t('completeVisit')}
                    </Button>
                    <Button variant="secondary" onClick={() => void run(cancelSiteVisitAction({ visitId: visit.id }))}>
                      {t('cancelVisit')}
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
