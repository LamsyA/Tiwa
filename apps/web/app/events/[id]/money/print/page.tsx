import { budgetSummary } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { MoneyText } from '@tiwa/ui';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Forbidden, loadEventPage } from '@/components/event-frame.js';
import { PrintButton } from './print-button.js';

/**
 * Print-ready budget (P9-T06, D-X28): the browser's "Save as PDF" makes the
 * PDF, so no worker is needed. Plain table, no app chrome, money.view only.
 */
export default async function MoneyPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, access, allowed } = await loadEventPage(id, '/money/print', 'money.view');
  if (!allowed) return <Forbidden eventId={id} />;
  const t = await getTranslations('events.money');
  const [summary, event] = await Promise.all([
    budgetSummary(ctx.actor, { eventId: id }, access),
    prisma.event.findUniqueOrThrow({ where: { id }, select: { name: true } }),
  ]);
  const money = (value: bigint) => <MoneyText value={value.toString()} currency={summary.currency} />;

  return (
    <main className="bg-bg text-text mx-auto flex max-w-3xl flex-col gap-4 p-4 sm:p-8 print:max-w-none print:p-0">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link href={`/events/${id}/money`} className="text-muted flex-1 text-sm underline">
          {t('backToMoney')}
        </Link>
        <PrintButton label={t('savePdf')} />
      </div>
      <header>
        <h1 className="font-display text-2xl font-bold">{event.name}</h1>
        <p className="text-muted text-sm">
          {t('heading')} · {new Date().toLocaleDateString()}
        </p>
      </header>
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
        {(['planned', 'committed', 'paid', 'outstanding', 'uncommitted'] as const).map((key) => (
          <div key={key} className="border-border rounded-md border p-2">
            <dt className="text-muted">{t(key)}</dt>
            <dd className="font-medium">{money(summary.totals[`${key}Minor`])}</dd>
          </div>
        ))}
      </dl>
      <table className="w-full text-left text-sm">
        <thead className="border-border border-b">
          <tr>
            <th className="py-2">{t('category')}</th>
            <th className="py-2 text-right">{t('planned')}</th>
            <th className="py-2 text-right">{t('committed')}</th>
            <th className="py-2 text-right">{t('paid')}</th>
          </tr>
        </thead>
        <tbody className="divide-border divide-y">
          {summary.lines.map((line) => (
            <tr key={line.key} className="break-inside-avoid">
              <td className="py-2">{line.label ?? t('otherLine')}</td>
              <td className="py-2 text-right">{money(line.plannedMinor)}</td>
              <td className="py-2 text-right">{money(line.committedMinor)}</td>
              <td className="py-2 text-right">{money(line.paidMinor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {summary.income.length > 0 && (
        <section className="text-sm">
          <h2 className="mb-1 font-medium">{t('tabs.income')}</h2>
          <ul className="divide-border divide-y">
            {summary.income.map((row) => (
              <li key={row.kind} className="flex justify-between py-1">
                <span>{t.has(`kinds.${row.kind}`) ? t(`kinds.${row.kind}`) : row.kind}</span>
                <span>
                  {money(row.receivedMinor)} / {money(row.pledgedMinor)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
