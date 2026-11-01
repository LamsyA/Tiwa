import {
  budgetAlerts,
  budgetSummary,
  listContributions,
  listExpenses,
  listPaymentSchedule,
  OTHER_KEY,
} from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { Banner, Card, EmptyState, MoneyText, StatCard, StatusPill } from '@tiwa/ui';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { can, EventFrame, Forbidden, loadEventPage } from '@/components/event-frame.js';
import { LiveRefresh } from '@/components/live-refresh.js';
import {
  AddContributionDialog,
  AddExpenseDialog,
  AllocationsDialog,
  ContributionActions,
  ExpenseActions,
} from './money-editors.js';
import { MoneyTabbar } from './money-tabbar.js';

const TABS = ['budget', 'payments', 'contributions', 'expenses', 'income'] as const;
type Tab = (typeof TABS)[number];
const SECURED = ['PAID_DIRECT', 'HELD', 'RELEASED', 'CONFIRMED_OFFLINE'];

/**
 * Money (UF-20, BUD-01–BUD-08; D-X28): five figures, a Planned/Committed/Paid
 * bar (plain CSS, no chart library), and tabs Budget / Payments /
 * Contributions / Expenses / Income. Guarded by money.view (UF-20-3).
 */
export default async function EventMoneyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const { ctx, access, allowed, invitesOn, momentsOn } = await loadEventPage(id, '/money', 'money.view');
  const t = await getTranslations('events.money');
  const event = await prisma.event.findUniqueOrThrow({ where: { id }, select: { name: true } });
  const active: Tab = TABS.includes(tab as Tab) ? (tab as Tab) : 'budget';

  const frame = (children: React.ReactNode) => (
    <EventFrame
      eventId={id}
      userId={ctx.actor.userId}
      access={access}
      invitesOn={invitesOn}
      momentsOn={momentsOn}
      active="money"
      title={event.name}
    >
      {children}
    </EventFrame>
  );
  if (!allowed) return frame(<Forbidden eventId={id} />);

  const summary = await budgetSummary(ctx.actor, { eventId: id }, access);
  const { totals, currency } = summary;
  const canEdit = can(access, ctx.actor.userId, 'money.edit');
  const max = [totals.plannedMinor, totals.committedMinor, totals.paidMinor].reduce((a, b) => (b > a ? b : a), 1n);
  const pct = (value: bigint) => Number((value * 1000n) / max) / 10;
  const categoryOptions = summary.lines
    .filter((line) => line.label !== null)
    .map((line) => ({ key: line.key, label: line.label as string, plannedMinor: line.plannedMinor.toString() }));
  const money = (value: bigint | string) => <MoneyText value={value.toString()} currency={currency} />;

  const [schedule, expenses, contributions] = await Promise.all([
    listPaymentSchedule(ctx.actor, { eventId: id }, access),
    active === 'expenses' ? listExpenses(ctx.actor, { eventId: id }, access) : Promise.resolve([]),
    active === 'contributions' || active === 'income'
      ? listContributions(ctx.actor, { eventId: id }, access)
      : Promise.resolve([]),
  ]);

  const alerts = budgetAlerts(summary, schedule);

  return frame(
    <div className="flex flex-col gap-4 py-2">
      <LiveRefresh />
      {alerts.length > 0 && (
        <div className="flex flex-col gap-2" role="status">
          {alerts.map((alert) =>
            alert.kind === 'over_budget' ? (
              <Banner key={`over-${alert.key ?? 'total'}`} tone="warning">
                {alert.key === null ? t('alerts.overTotal') : t('alerts.overLine', { line: alert.label ?? alert.key })}{' '}
                {money(alert.overMinor)}
              </Banner>
            ) : (
              <Banner key={alert.milestoneId} tone={alert.within === '1d' ? 'danger' : 'info'}>
                <Link href={`/events/${id}/bookings/${alert.bookingId}?tab=payments`} className="underline">
                  {t(alert.within === '1d' ? 'alerts.dueDay' : 'alerts.dueWeek', {
                    vendor: alert.vendorName,
                    label: alert.label,
                    date: alert.dueAt.toLocaleDateString(),
                  })}
                </Link>{' '}
                {money(alert.amountMinor)}
              </Banner>
            ),
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label={t('planned')} value={money(totals.plannedMinor)} />
        <StatCard label={t('committed')} value={money(totals.committedMinor)} />
        <StatCard label={t('paid')} value={money(totals.paidMinor)} />
        <StatCard label={t('outstanding')} value={money(totals.outstandingMinor)} />
        <StatCard
          className="col-span-2 lg:col-span-1"
          label={t('uncommitted')}
          value={money(totals.uncommittedMinor)}
          {...(totals.uncommittedMinor < 0n ? { delta: { tone: 'danger' as const, text: t('overBudget') } } : {})}
        />
      </div>

      <Card className="flex flex-col gap-2 p-4" aria-label={t('barLabel')}>
        {(
          [
            ['planned', totals.plannedMinor, 'bg-border'],
            ['committed', totals.committedMinor, 'bg-brand-soft'],
            ['paid', totals.paidMinor, 'bg-brand'],
          ] as const
        ).map(([key, value, tone]) => (
          <div key={key} className="flex items-center gap-3 text-sm">
            <span className="text-muted w-24 shrink-0">{t(key)}</span>
            <div className="bg-surface-2 h-3 flex-1 overflow-hidden rounded-full">
              <div className={`${tone} h-full rounded-full`} style={{ width: `${pct(value)}%` }} />
            </div>
          </div>
        ))}
      </Card>

      <div className="flex flex-wrap justify-end gap-2 text-sm">
        <a href={`/events/${id}/money/export`} className="underline">
          {t('exportCsv')}
        </a>
        <Link href={`/events/${id}/money/print`} className="underline">
          {t('exportPdf')}
        </Link>
      </div>
      <MoneyTabbar eventId={id} active={active} items={TABS.map((value) => ({ value, label: t(`tabs.${value}`) }))} />

      {active === 'budget' && canEdit && (
        <div className="flex justify-end">
          <AllocationsDialog
            eventId={id}
            currency={currency}
            plannedTotalMinor={totals.plannedMinor.toString()}
            categories={categoryOptions}
          />
        </div>
      )}
      {active === 'budget' && (
        <Card className="p-2 sm:p-4">
          {summary.lines.length === 0 ? (
            <EmptyState title={t('empty')} body="" />
          ) : (
            <ul className="divide-border divide-y text-sm">
              {summary.lines.map((line) => (
                <li key={line.key}>
                  <details className="group">
                    <summary className="flex cursor-pointer list-none flex-col gap-1 px-2 py-3 sm:flex-row sm:items-center">
                      <span className="flex-1 font-medium">
                        {line.key === OTHER_KEY ? t('otherLine') : (line.label ?? line.key)}
                        {line.uncommittedMinor < 0n && (
                          <StatusPill tone="danger" className="ml-2">
                            {t('overBudget')}
                          </StatusPill>
                        )}
                      </span>
                      <span className="text-muted grid grid-cols-3 gap-3 sm:w-96">
                        <span>
                          <span className="block text-xs">{t('planned')}</span>
                          {money(line.plannedMinor)}
                        </span>
                        <span>
                          <span className="block text-xs">{t('committed')}</span>
                          {money(line.committedMinor)}
                        </span>
                        <span>
                          <span className="block text-xs">{t('paid')}</span>
                          {money(line.paidMinor)}
                        </span>
                      </span>
                    </summary>
                    <ul className="text-muted flex flex-col gap-1 px-4 pb-3">
                      {line.bookings.length + line.expenses.length === 0 && <li>{t('nothingYet')}</li>}
                      {line.bookings.map((row) => (
                        <li key={row.id} className="flex gap-2">
                          <Link href={`/events/${id}/bookings/${row.id}`} className="flex-1 underline">
                            {row.vendorName}
                          </Link>
                          {money(row.committedMinor)}
                        </li>
                      ))}
                      {line.expenses.map((row) => (
                        <li key={row.id} className="flex gap-2">
                          <span className="flex-1">{row.description}</span>
                          {money(row.amountMinor)}
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              ))}
            </ul>
          )}
          {summary.unallocatedMinor !== 0n && (
            <p className="text-muted px-2 pt-2 text-sm">
              {t('unallocated')}: {money(summary.unallocatedMinor)}
            </p>
          )}
        </Card>
      )}

      {active === 'payments' && (
        <Card className="p-2 sm:p-4">
          {schedule.length === 0 ? (
            <EmptyState title={t('noPayments')} body={t('noPaymentsBody')} />
          ) : (
            <ul className="divide-border divide-y text-sm">
              {schedule.map((row) => (
                <li key={row.id} className="flex flex-col gap-1 px-2 py-3 sm:flex-row sm:items-center">
                  <Link href={`/events/${id}/bookings/${row.bookingId}?tab=payments`} className="flex-1">
                    <span className="font-medium">{row.vendorName}</span>
                    <span className="text-muted"> · {row.label}</span>
                  </Link>
                  <span className="text-muted">
                    {row.dueAt ? t('dueOn', { date: new Date(row.dueAt).toLocaleDateString() }) : ''}
                  </span>
                  <span className="font-medium">{money(row.amountMinor)}</span>
                  <StatusPill tone={SECURED.includes(row.state) ? 'success' : 'neutral'}>
                    {t(
                      `state.${SECURED.includes(row.state) ? 'paid' : row.state === 'RECORDED_OFFLINE' ? 'awaiting' : 'due'}`,
                    )}
                  </StatusPill>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {active === 'contributions' && canEdit && (
        <div className="flex justify-end">
          <AddContributionDialog eventId={id} currency={currency} />
        </div>
      )}
      {active === 'contributions' && (
        <Card className="p-2 sm:p-4">
          {contributions.filter((row) => !['sponsor', 'other_income'].includes(row.kind)).length === 0 ? (
            <EmptyState title={t('noContributions')} body={t('noContributionsBody')} />
          ) : (
            <ul className="divide-border divide-y text-sm">
              {contributions
                .filter((row) => !['sponsor', 'other_income'].includes(row.kind))
                .map((row) => (
                  <li key={row.id} className="flex flex-col gap-1 px-2 py-3 sm:flex-row sm:items-center">
                    <span className="flex-1 font-medium">{row.contributorName}</span>
                    <span className="text-muted">{t(`kinds.${row.kind}`)}</span>
                    <span>
                      {money(row.receivedMinor)} / {money(row.pledgedMinor)}
                    </span>
                    {canEdit && <ContributionActions contributionId={row.id} currency={currency} />}
                  </li>
                ))}
            </ul>
          )}
        </Card>
      )}

      {active === 'expenses' && canEdit && (
        <div className="flex justify-end">
          <AddExpenseDialog eventId={id} currency={currency} categories={categoryOptions} />
        </div>
      )}
      {active === 'expenses' && (
        <Card className="p-2 sm:p-4">
          {expenses.length === 0 ? (
            <EmptyState title={t('noExpenses')} body={t('noExpensesBody')} />
          ) : (
            <ul className="divide-border divide-y text-sm">
              {expenses.map((row) => (
                <li key={row.id} className="flex flex-col gap-1 px-2 py-3 sm:flex-row sm:items-center">
                  <span className="flex-1 font-medium">{row.description}</span>
                  <span className="text-muted">
                    {summary.lines.find((line) => line.key === row.categoryKey)?.label ?? t('otherLine')}
                  </span>
                  <span className="font-medium">{money(row.amountMinor)}</span>
                  <StatusPill tone={row.paidAt ? 'success' : 'neutral'}>
                    {row.paidAt ? t('state.paid') : t('state.due')}
                  </StatusPill>
                  {canEdit && <ExpenseActions expenseId={row.id} paid={!!row.paidAt} />}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {active === 'income' && canEdit && (
        <div className="flex justify-end">
          <AddContributionDialog eventId={id} currency={currency} income />
        </div>
      )}
      {active === 'income' && (
        <Card className="flex flex-col gap-3 p-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label={t('incomeExpected')} value={money(summary.incomeTotals.pledgedMinor)} />
            <StatCard label={t('incomeReceived')} value={money(summary.incomeTotals.receivedMinor)} />
          </div>
          <ul className="divide-border divide-y">
            {summary.income.map((row) => (
              <li key={row.kind} className="flex items-center gap-2 py-2">
                <span className="flex-1">{t(`kinds.${row.kind}`)}</span>
                {money(row.receivedMinor)} / {money(row.pledgedMinor)}
              </li>
            ))}
            {contributions
              .filter((row) => row.kind === 'sponsor' || row.kind === 'other_income')
              .map((row) => (
                <li key={row.id} className="flex flex-wrap items-center gap-2 py-2 pl-4">
                  <span className="text-muted flex-1">{row.contributorName}</span>
                  {money(row.receivedMinor)} / {money(row.pledgedMinor)}
                  {canEdit && <ContributionActions contributionId={row.id} currency={currency} />}
                </li>
              ))}
            <li className="text-muted flex items-center gap-2 py-2">
              <span className="flex-1">{t('kinds.tickets')}</span>
              {t('ticketsLater')}
            </li>
          </ul>
        </Card>
      )}
      {canEdit ? null : <p className="text-muted text-sm">{t('viewOnly')}</p>}
    </div>,
  );
}
