import { eventTypeLabel } from '@tiwa/config';
import {
  authorize,
  budgetAlerts,
  budgetSummary,
  eventActivity,
  eventDecisions,
  eventOrders,
  galleryCodeForEvent,
  getEventOverview,
  listPaymentSchedule,
  utcToZoned,
} from '@tiwa/core';
import { Avatar, Banner, DateText, MoneyText, RelativeTime, StatusPill, buttonClasses } from '@tiwa/ui';
import { prisma } from '@tiwa/db';
import {
  Activity,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  FileText,
  Flag,
  Images,
  LayoutDashboard,
  Mail,
  MapPin,
  Settings,
  Store,
  Ticket,
  Users,
  UsersRound,
  Wallet,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type * as React from 'react';
import { EventFrame, loadEventPage, visibleSections, type EventSection } from '@/components/event-frame.js';

const SECTION_ICONS: Record<EventSection, typeof Users> = {
  overview: LayoutDashboard,
  plan: ClipboardList,
  money: Wallet,
  documents: FileText,
  guests: Users,
  invites: Mail,
  moments: Images,
  vendors: Store,
  tickets: Ticket,
  day: CalendarClock,
  close: Flag,
  settings: Settings,
};

/** EVT-05 / Frontend.md §6.3: header, progress, next deadlines, money, vendors, guests, moments, team. */

/** Human-readable audit action ("day.item.late" -> "Item late"). Runtime
 * transform, so no per-action catalogue strings to maintain. */
function prettyAction(action: string): string {
  const last = action.split('.').pop() ?? action;
  const words = last.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
export default async function EventOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ welcome?: string }>;
}) {
  const { id } = await params;
  const { welcome } = await searchParams;
  const { ctx, access, invitesOn, momentsOn, ticketsOn } = await loadEventPage(id, '');
  const t = await getTranslations('events');
  const overview = await getEventOverview(ctx.actor, id, new Date(), access);
  const { event, progress, deadlines, team } = overview;
  const typeLabel = eventTypeLabel(event);
  const firstDay = event.days[0];
  const canSeeMoney = (() => {
    try {
      authorize(ctx.actor, 'money.view', { eventId: id, access });
      return true;
    } catch {
      return false;
    }
  })();
  const canModerateMoments = (() => {
    try {
      authorize(ctx.actor, 'moments.moderate', { eventId: id, access });
      return true;
    } catch {
      return false;
    }
  })();
  const [galleryCode, money, orders, replies, decisions, activity] = await Promise.all([
    event.momentsEnabled ? galleryCodeForEvent(id) : Promise.resolve(null),
    canSeeMoney
      ? Promise.all([
          budgetSummary(ctx.actor, { eventId: id }, access),
          listPaymentSchedule(ctx.actor, { eventId: id }, access),
        ])
      : Promise.resolve(null),
    eventOrders(ctx.actor, { eventId: id }).catch(() => null),
    prisma.guest.groupBy({ by: ['rsvp'], where: { eventId: id, deletedAt: null }, _count: { _all: true } }),
    eventDecisions(ctx.actor, id, 5).catch(() => []),
    eventActivity(ctx.actor, id, 10).catch(() => ({ entries: [] })),
  ]);
  const replyCount = (key: string) => replies.find((row) => row.rsvp === key)?._count._all ?? 0;
  const guestTotal = replies.reduce((sum, row) => sum + row._count._all, 0);
  const tabs = await getTranslations('events.tabs');
  const quickLinks = visibleSections(access, ctx.actor.userId, { invitesOn, momentsOn, ticketsOn })
    .filter((section) => section.key !== 'overview')
    .map((section) => ({ key: section.key, href: `/events/${id}${section.path}`, icon: SECTION_ICONS[section.key] }));
  const percent = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const moneyAlerts = money ? budgetAlerts(money[0], money[1]).length : 0;
  const now = new Date();

  return (
    <EventFrame
      eventId={id}
      userId={ctx.actor.userId}
      access={access}
      invitesOn={invitesOn}
      momentsOn={momentsOn}
      ticketsOn={ticketsOn}
      hideTabs
      active="overview"
      title={event.name}
    >
      <div className="flex flex-col gap-4 py-2">
        {welcome && event.status === 'ACTIVE' && (
          <Banner tone="info" title={t('overview.welcomeTitle')}>
            {t('overview.welcomeBody')}
          </Banner>
        )}
        {event.status === 'DRAFT' && (
          <Banner tone="warning" title={t('overview.draftBanner')}>
            <Link href={`/events/new?id=${id}`} className="font-medium underline">
              {t('overview.continueSetup')}
            </Link>
          </Banner>
        )}
        {event.status === 'CANCELLED' && <Banner tone="danger">{t('overview.cancelledBanner')}</Banner>}

        <header
          className="relative isolate overflow-hidden rounded-3xl px-5 py-6 text-white shadow-[0_20px_50px_-24px_rgb(0_0_0/0.45)] sm:px-8 sm:py-8"
          style={{
            background: `radial-gradient(120% 140% at 100% 0%, color-mix(in oklab, ${event.themeColor ?? 'var(--brand)'} 70%, white 0%) 0%, transparent 55%), linear-gradient(135deg, color-mix(in oklab, ${event.themeColor ?? 'var(--brand-strong)'} 85%, black) 0%, #1a0f0a 100%)`,
          }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 -right-16 -z-10 size-72 rounded-full bg-white/10 blur-3xl"
          />
          <div className="flex flex-wrap items-center gap-2">
            {typeLabel && (
              <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold ring-1 ring-white/20 backdrop-blur-md">
                {typeLabel}
              </span>
            )}
            <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold ring-1 ring-white/20 backdrop-blur-md">
              {t(`roles.${overview.myRole}`)}
            </span>
            {event.status !== 'ACTIVE' && (
              <span className="rounded-full bg-black/30 px-3 py-1 text-xs font-semibold">
                {t(`status.${event.status}`)}
              </span>
            )}
          </div>
          <p className="font-display mt-4 text-3xl leading-tight font-bold tracking-[-0.02em] sm:text-4xl lg:hidden">
            {event.name}
          </p>
          <div className="mt-4 flex flex-col gap-2 text-[15px] text-white/85 sm:flex-row sm:items-center sm:gap-6">
            <p className="flex flex-wrap items-center gap-2">
              <CalendarDays aria-hidden className="size-4" />
              {event.startsAt ? (
                <DateText value={event.startsAt} format="datetime" timeZone={event.timezone} />
              ) : (
                t('overview.noDate')
              )}
            </p>
            {firstDay?.venueName && (
              <p className="flex items-center gap-2">
                <MapPin aria-hidden className="size-4" />
                {firstDay.venueName}
              </p>
            )}
          </div>
          {event.startsAt && event.startsAt > now && (
            <p className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-sm font-semibold text-black">
              <span className="size-1.5 rounded-full bg-[var(--brand-strong)]" />
              <RelativeTime value={event.startsAt} />
            </p>
          )}
        </header>

        <nav aria-label={t('overview.quickLinks')} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <ul className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
            {quickLinks.map(({ key, href, icon: Icon }) => (
              <li key={key}>
                <Link
                  href={href}
                  className="border-border/70 bg-surface hover:border-brand/40 group flex items-center gap-2 rounded-full border py-1.5 pr-4 pl-1.5 text-sm font-medium whitespace-nowrap transition hover:shadow-[var(--shadow-1)]"
                >
                  <span className="bg-brand-soft text-brand-strong grid size-7 place-items-center rounded-full transition group-hover:scale-105">
                    <Icon aria-hidden className="size-4" />
                  </span>
                  {tabs(key)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="grid items-start gap-4 lg:grid-cols-3">
          <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
            <Panel
              icon={ClipboardList}
              title={t('overview.progressHeading')}
              action={{ href: `/events/${id}/plan`, label: t('overview.openPlan') }}
            >
              <div className="flex items-end justify-between gap-3">
                <p className="text-muted text-sm" data-testid="progress-counts">
                  {t('overview.progressCounts', { done: progress.done, total: progress.total })}
                </p>
                <p className="font-display text-4xl leading-none font-bold tabular-nums">
                  {percent}
                  <span className="text-muted text-lg">%</span>
                </p>
              </div>
              <div
                role="progressbar"
                aria-label={t('overview.progressLabel')}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                className="bg-surface-2 h-2.5 w-full overflow-hidden rounded-full"
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[var(--brand)] to-[var(--accent)] transition-[width] duration-700"
                  style={{ width: `${Math.max(percent, progress.done > 0 ? 4 : 0)}%` }}
                />
              </div>
              <dl className="grid grid-cols-3 gap-2">
                {(
                  [
                    ['outstanding', progress.outstanding, ''],
                    ['overdue', progress.overdue, progress.overdue > 0 ? 'text-danger' : ''],
                    ['blocked', progress.blocked, progress.blocked > 0 ? 'text-warning' : ''],
                  ] as const
                ).map(([key, value, tone]) => (
                  <div key={key} className="bg-surface-2/70 rounded-2xl px-3 py-2.5">
                    <dt className="text-muted text-xs">{t(`overview.${key}`)}</dt>
                    <dd className={`font-display text-xl font-bold tabular-nums ${tone}`}>{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="border-border/60 flex flex-col gap-1 border-t pt-3">
                <p className="text-muted text-xs font-semibold tracking-wide uppercase">
                  {t('overview.deadlinesHeading')}
                </p>
                {deadlines.length === 0 ? (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-muted text-sm">{t('overview.deadlinesEmpty')}</p>
                    {progress.total === 0 && (
                      <Link
                        href={`/events/${id}/plan`}
                        className={buttonClasses({ size: 'sm', className: 'rounded-full' })}
                      >
                        {t('overview.startPlan')}
                      </Link>
                    )}
                  </div>
                ) : (
                  <ul className="divide-border/60 divide-y">
                    {deadlines.map((task) => {
                      const overdue = task.dueAt !== null && task.dueAt < now;
                      return (
                        <li key={task.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                          <span className="min-w-0 truncate">{task.title}</span>
                          {task.dueAt && (
                            <span
                              className={
                                overdue
                                  ? 'bg-danger/10 text-danger shrink-0 rounded-full px-2 py-0.5 text-xs font-medium'
                                  : 'bg-surface-2 text-muted shrink-0 rounded-full px-2 py-0.5 text-xs font-medium'
                              }
                            >
                              {utcToZoned(task.dueAt, event.timezone).date}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </Panel>

            <Panel
              icon={Store}
              title={t('overview.vendorsHeading')}
              action={{ href: `/events/${id}/vendors`, label: t('overview.vendorsOpen') }}
            >
              {orders && orders.rows.some((row) => row.stage !== 'closed') ? (
                <>
                  <dl className="grid grid-cols-3 gap-2">
                    {(['quoted', 'booked', 'confirmed'] as const).map((stage) => (
                      <div key={stage} className="bg-surface-2/70 rounded-2xl px-3 py-2.5">
                        <dt className="text-muted text-xs">{t(`overview.vendorStage.${stage}`)}</dt>
                        <dd className="font-display text-xl font-bold tabular-nums">{orders.counts[stage]}</dd>
                      </div>
                    ))}
                  </dl>
                  <ul className="divide-border/60 divide-y text-sm">
                    {orders.rows
                      .filter((row) => row.stage !== 'closed')
                      .slice(0, 4)
                      .map((row) => (
                        <li key={row.id} className="flex items-center justify-between gap-2 py-2">
                          <span className="min-w-0 truncate font-medium">{row.counterparty}</span>
                          <span className="text-muted shrink-0 text-xs">{row.category}</span>
                        </li>
                      ))}
                  </ul>
                </>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-muted max-w-md text-sm">{t('overview.vendorsEmpty')}</p>
                  <Link
                    href={`/events/${id}/vendors`}
                    className={buttonClasses({ variant: 'secondary', size: 'sm', className: 'rounded-full' })}
                  >
                    {t('overview.vendorsFind')}
                  </Link>
                </div>
              )}
            </Panel>

            <Panel icon={Activity} title={t('overview.activityHeading')}>
              {activity.entries.length === 0 ? (
                <p className="text-muted text-sm">{t('overview.activityEmpty')}</p>
              ) : (
                <ul className="border-border/70 ml-1.5 flex flex-col gap-3 border-l pl-4">
                  {activity.entries.map((row) => (
                    <li
                      key={row.id}
                      className="before:bg-brand relative flex items-baseline justify-between gap-2 text-sm before:absolute before:top-1.5 before:-left-[21px] before:size-2 before:rounded-full"
                    >
                      <span className="min-w-0 truncate">
                        {prettyAction(row.action)}
                        {row.actorName ? ` · ${row.actorName}` : ''}
                      </span>
                      <span className="text-muted shrink-0 text-xs">
                        <RelativeTime value={row.createdAt} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            {money && (
              <Panel
                icon={Wallet}
                title={t('overview.moneyHeading')}
                action={{ href: `/events/${id}/money`, label: t('overview.moneyOpen') }}
                badge={
                  moneyAlerts > 0 ? (
                    <StatusPill tone="warning">{t('overview.moneyAlerts', { count: moneyAlerts })}</StatusPill>
                  ) : null
                }
              >
                <div>
                  <p className="text-muted text-xs">{t('overview.moneyBudget')}</p>
                  <p className="font-display text-2xl font-bold">
                    <MoneyText value={money[0].totals.plannedMinor.toString()} currency={event.currency} />
                  </p>
                </div>
                {money[0].totals.plannedMinor > 0n && (
                  <div className="bg-surface-2 h-2 overflow-hidden rounded-full" aria-hidden>
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[var(--brand)] to-[var(--accent)]"
                      style={{
                        width: `${Math.min(100, Number((money[0].totals.committedMinor * 100n) / money[0].totals.plannedMinor))}%`,
                      }}
                    />
                  </div>
                )}
                <dl className="divide-border/60 flex flex-col divide-y text-sm">
                  {(['committed', 'paid', 'outstanding'] as const).map((key) => (
                    <div key={key} className="flex items-center justify-between py-1.5">
                      <dt className="text-muted">{t(`money.${key}`)}</dt>
                      <dd className="font-semibold tabular-nums">
                        <MoneyText value={money[0].totals[`${key}Minor`].toString()} currency={event.currency} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </Panel>
            )}

            <Panel
              icon={Users}
              title={t('overview.guestsHeading')}
              action={{ href: `/events/${id}/guests`, label: t('overview.guestsOpen', { count: guestTotal }) }}
            >
              {event.expectedGuests !== null && (
                <p className="text-sm font-medium">{t('overview.guestsExpected', { count: event.expectedGuests })}</p>
              )}
              {guestTotal > 0 ? (
                <dl className="grid grid-cols-3 gap-2">
                  {(['YES', 'MAYBE', 'NO'] as const).map((key) => (
                    <div key={key} className="bg-surface-2/70 rounded-2xl px-3 py-2.5">
                      <dt className="text-muted text-xs">{t(`overview.rsvp.${key}`)}</dt>
                      <dd className="font-display text-xl font-bold tabular-nums">{replyCount(key)}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-muted text-sm">{t('overview.guestsEmpty')}</p>
              )}
            </Panel>

            {event.momentsEnabled && (
              <Panel icon={Images} title={t('overview.momentsHeading')}>
                {canModerateMoments ? (
                  <Link
                    href={`/events/${id}/moments`}
                    className={buttonClasses({ variant: 'secondary', size: 'sm', className: 'w-fit rounded-full' })}
                  >
                    {t('overview.momentsManage')}
                  </Link>
                ) : galleryCode ? (
                  <Link
                    href={`/m/${galleryCode}`}
                    className={buttonClasses({ variant: 'secondary', size: 'sm', className: 'w-fit rounded-full' })}
                  >
                    {t('overview.momentsView')}
                  </Link>
                ) : (
                  <p className="text-muted text-sm">{t('overview.momentsComingSoon')}</p>
                )}
              </Panel>
            )}

            <Panel
              icon={UsersRound}
              title={t('overview.teamHeading')}
              action={{ href: `/events/${id}/settings/members`, label: t('overview.manageTeam') }}
            >
              <ul className="flex flex-col gap-2.5">
                {team.map((member) => (
                  <li key={member.userId} className="flex items-center gap-2.5">
                    <Avatar
                      size="sm"
                      name={member.name ?? t(`roles.${member.role}`)}
                      {...(member.image ? { src: member.image } : {})}
                    />
                    <span className="min-w-0 text-sm">
                      <span className="block truncate font-medium">{member.name ?? t(`roles.${member.role}`)}</span>
                      <span className="text-muted block text-xs">
                        {t(`roles.${member.role}`)}
                        {!member.joined && ` · ${t('overview.teamPending')}`}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              {['HOST', 'CO_HOST', 'PLANNER', 'PLANNER_STAFF'].includes(overview.myRole) && (
                <div className="border-border/60 flex flex-col gap-2 border-t pt-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-muted text-xs font-semibold tracking-wide uppercase">
                      {t('overview.decisionsHeading')}
                    </p>
                    <Link href={`/events/${id}/chat`} className="text-brand-strong text-xs font-semibold">
                      {t('overview.teamChat')}
                    </Link>
                  </div>
                  {decisions.length === 0 ? (
                    <p className="text-muted text-xs">{t('overview.decisionsEmpty')}</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {decisions.map((row) => (
                        <li key={row.id} className="border-brand/40 border-l-2 pl-3 text-sm">
                          <p className="font-medium">{row.body ?? '—'}</p>
                          <p className="text-muted text-xs">
                            {row.authorName ? t('overview.decisionsBy', { name: row.authorName }) : ''}
                            {row.authorName ? ' · ' : ''}
                            <RelativeTime value={row.createdAt} />
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </Panel>
          </div>
        </div>
      </div>
    </EventFrame>
  );
}

/** One overview card: icon, title, optional badge and action link, then content. */
function Panel({
  icon: Icon,
  title,
  action,
  badge,
  children,
}: {
  icon: typeof Users;
  title: string;
  action?: { href: string; label: string };
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-border/70 bg-surface flex flex-col gap-4 rounded-3xl border p-5 shadow-[var(--shadow-1)]">
      <header className="flex items-center gap-2.5">
        <span className="bg-brand-soft text-brand-strong grid size-9 shrink-0 place-items-center rounded-xl">
          <Icon aria-hidden className="size-[18px]" />
        </span>
        <h2 className="font-display min-w-0 flex-1 truncate text-lg font-bold">{title}</h2>
        {badge}
        {action && (
          <Link href={action.href} className="text-brand-strong shrink-0 text-sm font-semibold hover:underline">
            {action.label}
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}
