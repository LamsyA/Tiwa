'use client';

import type { HeadcountReport } from '@tiwa/core';
import { Banner, Button, Card } from '@tiwa/ui';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { shareHeadcount } from './actions.js';

export function HeadcountPanel({ eventId, report }: { eventId: string; report: HeadcountReport }) {
  const t = useTranslations('events.guests');
  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <p className="text-muted text-sm">{t('headcount.expected')}</p>
        <p className="font-display text-3xl font-bold">{report.expectedAttendance}</p>
        <p className="text-muted text-sm">{t('headcount.expectedHint')}</p>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <ReportSection title={t('headcount.byRsvp')}>
          <Row label={t('rsvpLabels.YES')} value={report.rsvp.yes} />
          <Row label={t('rsvpLabels.NO')} value={report.rsvp.no} />
          <Row label={t('rsvpLabels.MAYBE')} value={report.rsvp.maybe} />
          <Row label={t('rsvpLabels.NONE')} value={report.rsvp.none} />
        </ReportSection>
        <ReportSection title={t('headcount.byMeal')}>
          <Breakdown
            rows={report.meals.map((row) => ({ label: row.meal, count: row.count }))}
            empty={t('headcount.none')}
          />
        </ReportSection>
        <ReportSection title={t('headcount.byDietary')}>
          <Breakdown
            rows={report.dietary.map((row) => ({ label: row.need, count: row.count }))}
            empty={t('headcount.none')}
          />
        </ReportSection>
        <ReportSection title={t('headcount.byGroup')}>
          <Breakdown
            rows={report.groups.map((row) => ({
              label: `${row.name} (${t('rsvpLabels.YES')}: ${row.yes})`,
              count: row.total,
            }))}
            empty={t('headcount.none')}
          />
        </ReportSection>
        <ReportSection title={t('headcount.byTable')}>
          <Breakdown
            rows={report.tables.map((row) => ({
              label: `${row.name} (${row.assigned}/${row.capacity})`,
              count: row.assigned,
            }))}
            empty={t('headcount.none')}
          />
          {report.unseated > 0 && <Row label={t('headcount.unseated')} value={report.unseated} />}
        </ReportSection>
        <ShareCard eventId={eventId} />
      </div>
    </div>
  );
}

function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <h3 className="mb-1 font-medium">{title}</h3>
      {children}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-1">
      <span className="text-sm">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

function Breakdown({ rows, empty }: { rows: { label: string; count: number }[]; empty: string }) {
  if (rows.length === 0) return <p className="text-muted text-sm">{empty}</p>;
  return (
    <>
      {rows.map((row) => (
        <Row key={row.label} label={row.label} value={row.count} />
      ))}
    </>
  );
}

function ShareCard({ eventId }: { eventId: string }) {
  const t = useTranslations('events.guests');
  const te = useTranslations('events.guests.errors');
  const [link, setLink] = React.useState<{ url: string; expiresAt: string } | undefined>();
  const [copied, setCopied] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();

  return (
    <Card className="flex flex-col gap-2 p-4">
      <h3 className="font-medium">{t('headcount.share')}</h3>
      <p className="text-muted text-sm">{t('headcount.shareHint')}</p>
      {error && <Banner tone="danger">{error}</Banner>}
      {!link ? (
        <div>
          <Button
            variant="secondary"
            loading={busy}
            onClick={() => {
              setBusy(true);
              setError(undefined);
              void shareHeadcount({ eventId }).then((result) => {
                setBusy(false);
                if (result.ok) setLink(result.data);
                else {
                  try {
                    setError(te(result.code));
                  } catch {
                    setError(te('generic'));
                  }
                }
              });
            }}
          >
            {t('headcount.share')}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Banner tone="info">
            {t('headcount.linkReady')} ·{' '}
            {t('headcount.expires', { date: new Date(link.expiresAt).toLocaleDateString() })}
          </Banner>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                void navigator.clipboard.writeText(link.url).then(() => setCopied(true));
              }}
            >
              {copied ? t('headcount.copied') : t('headcount.copy')}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
