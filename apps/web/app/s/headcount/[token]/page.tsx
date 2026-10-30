import { env } from '@tiwa/config';
import { headcountForVendor, verifyHeadcountToken } from '@tiwa/core';
import { Card, EmptyState, GuestShell } from '@tiwa/ui';
import { Users } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export const metadata: Metadata = { robots: 'noindex, nofollow' };
export const dynamic = 'force-dynamic';

/**
 * GST-17 / UF-06-3: public vendor headcount link. Stateless HMAC token
 * (90-day expiry); the payload is aggregates only — names, phones and
 * emails can never leak because the query doesn't select them.
 */
export default async function SharedHeadcountPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getTranslations('shared.headcount');
  const secret = env.AUTH_SECRET;
  const eventId = secret ? verifyHeadcountToken(decodeURIComponent(token), secret) : null;
  if (!eventId) {
    return (
      <GuestShell title={t('title')}>
        <EmptyState title={t('title')} body={t('invalid')} icon={<Users aria-hidden />} />
      </GuestShell>
    );
  }
  const report = await headcountForVendor(eventId);
  return (
    <GuestShell title={`${t('title')} · ${report.eventName}`}>
      <div className="flex flex-col gap-4 py-4">
        <p className="text-muted text-sm">{t('forEvent', { event: report.eventName })}</p>
        <Card className="p-4 text-center">
          <p className="text-muted text-sm">{t('expected')}</p>
          <p className="font-display text-4xl font-bold">{report.expectedAttendance}</p>
        </Card>
        <Section
          title={t('byRsvp')}
          rows={[
            { label: t('rsvpYes'), count: report.rsvp.yes },
            { label: t('rsvpNo'), count: report.rsvp.no },
            { label: t('rsvpMaybe'), count: report.rsvp.maybe },
            { label: t('rsvpNone'), count: report.rsvp.none },
          ]}
        />
        <Section title={t('byMeal')} rows={report.meals.map((row) => ({ label: row.meal, count: row.count }))} />
        <Section title={t('byDietary')} rows={report.dietary.map((row) => ({ label: row.need, count: row.count }))} />
        <Section title={t('byGroup')} rows={report.groups.map((row) => ({ label: row.name, count: row.total }))} />
        <Section
          title={t('byTable')}
          rows={report.tables.map((row) => ({
            label: `${row.name} (${row.assigned}/${row.capacity})`,
            count: row.assigned,
          }))}
        />
        {report.unseated > 0 && (
          <Section title={t('unseated')} rows={[{ label: t('unseated'), count: report.unseated }]} />
        )}
        <p className="text-muted text-center text-xs">
          {t('updated', { date: new Date(report.generatedAt).toLocaleString() })}
        </p>
      </div>
    </GuestShell>
  );
}

function Section({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  if (rows.length === 0) return null;
  return (
    <Card className="flex flex-col gap-1 p-4">
      <h2 className="mb-1 font-medium">{title}</h2>
      {rows.map((row) => (
        <div key={row.label} className="flex items-baseline justify-between gap-2 py-1">
          <span className="text-sm">{row.label}</span>
          <span className="font-medium tabular-nums">{row.count}</span>
        </div>
      ))}
    </Card>
  );
}
