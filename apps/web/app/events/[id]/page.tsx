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
import { Avatar, Banner, Card, DateText, MoneyText, RelativeTime, StatusPill, buttonClasses } from '@tiwa/ui';
import { prisma } from '@tiwa/db';
import {
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
  Wallet,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
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

        <nav
          aria-label={t('overview.quickLinks')}
          className="grid grid-cols-[repeat(auto-fill,minmax(6.25rem,1fr))] gap-2"
        >
          {quickLinks.map(({ key, href, icon: Icon }) => (
            <Link
              key={key}
              href={href}
              className="border-border/70 bg-surface group flex flex-col items-center gap-2 rounded-2xl border px-2 py-3 text-center text-sm font-medium transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-1)]"
            >
              <span className="bg-brand-soft text-brand-strong flex size-10 items-center justify-center rounded-xl transition group-hover:scale-105">
                <Icon aria-hidden className="size-5" />
              </span>
              <span className="w-full truncate text-xs sm:text-sm">{tabs(key)}</span>
            </Link>
          ))}
        </nav>

        <div className="grid gap-4 lg:grid-cols-12">
          <Card className="relative flex flex-col gap-4 overflow-hidden p-5 lg:col-span-4">
            <div
              aria-hidden
              className="bg-brand/10 pointer-events-none absolute -top-16 -right-16 size-44 rounded-full blur-2xl"
            />
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold">{t('overview.progressHeading')}</h2>
                <p className="text-muted text-sm" data-testid="progress-counts">
                  {t('overview.progressCounts', { done: progress.done, total: progress.total })}
                </p>
              </div>
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
              className="bg-surface-2 h-3 w-full overflow-hidden rounded-full"
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-[var(--brand)] to-[var(--brand-strong)] transition-[width] duration-700"
                style={{ width: `${Math.max(percent, progress.done > 0 ? 4 : 0)}%` }}
              />
            </div>
            <dl className="grid grid-cols-3 gap-2 text-center">
              {(
                [
                  ['outstanding', progress.outstanding, ''],
                  ['overdue', progress.overdue, progress.overdue > 0 ? 'text-danger' : ''],
                  ['blocked', progress.blocked, progress.blocked > 0 ? 'text-warning' : ''],
                ] as const
              ).map(([key, value, tone]) => (
                <div key={key} className="bg-surface-2 rounded-2xl px-2 py-2.5">
                  <dd className={`font-display text-xl font-bold tabular-nums ${tone}`}>{value}</dd>
                  <dt className="text-muted text-xs">{t(`overview.${key}`)}</dt>
                </div>
              ))}
            </dl>
            <Link
              href={`/events/${id}/plan`}
              className={buttonClasses({
                variant: progress.total === 0 ? 'primary' : 'secondary',
                size: 'sm',
                className: 'w-fit rounded-full',
              })}
            >
              {progress.total === 0 ? t('overview.startPlan') : t('overview.openPlan')}
            </Link>
          </Card>

          <Card className="flex flex-col gap-3 p-5 lg:col-span-8">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-lg font-bold">{t('overview.deadlinesHeading')}</h2>
              <Link href={`/events/${id}/plan`} className="text-brand-strong text-sm font-medium">
                {t('overview.openPlan')}
              </Link>
            </div>
            {deadlines.length === 0 ? (
              <p className="text-muted text-sm">{t('overview.deadlinesEmpty')}</p>
            ) : (
              <ul className="divide-border divide-y">
                {deadlines.map((task) => {
                  const overdue = task.dueAt !== null && task.dueAt < now;
                  return (
                    <li key={task.id} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0 truncate">{task.title}</span>
                      {task.dueAt && (
                        <span className={overdue ? 'text-danger shrink-0 text-sm' : 'text-muted shrink-0 text-sm'}>
                          {utcToZoned(task.dueAt, event.timezone).date}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {money && (
            <Card className="flex flex-col gap-3 p-5 lg:col-span-4">
              <div className="flex items-center gap-2">
                <h2 className="flex-1 font-medium">{t('overview.moneyHeading')}</h2>
                {moneyAlerts > 0 && (
                  <StatusPill tone="warning">{t('overview.moneyAlerts', { count: moneyAlerts })}</StatusPill>
                )}
              </div>
              <dl className="grid grid-cols-3 gap-2 text-sm">
                {(['committed', 'paid', 'outstanding'] as const).map((key) => (
                  <div key={key}>
                    <dt className="text-muted">{t(`money.${key}`)}</dt>
                    <dd className="font-display font-bold">
                      <MoneyText value={money[0].totals[`${key}Minor`].toString()} currency={event.currency} />
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="text-muted text-sm">
                {t('overview.moneyBudget')}:{' '}
                <MoneyText value={money[0].totals.plannedMinor.toString()} currency={event.currency} />
              </p>
              <Link href={`/events/${id}/money`} className="text-sm underline">
                {t('overview.moneyOpen')}
              </Link>
            </Card>
          )}

          <Card className="flex flex-col gap-3 p-5 lg:col-span-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-lg font-bold">{t('overview.vendorsHeading')}</h2>
              <Link href={`/events/${id}/vendors`} className="text-brand-strong text-sm font-medium">
                {t('overview.vendorsOpen')}
              </Link>
            </div>
            {orders && orders.rows.some((row) => row.stage !== 'closed') ? (
              <>
                <dl className="grid grid-cols-3 gap-2 text-center">
                  {(['quoted', 'booked', 'confirmed'] as const).map((stage) => (
                    <div key={stage} className="bg-surface-2 rounded-2xl p-2">
                      <dd className="font-display text-xl font-bold">{orders.counts[stage]}</dd>
                      <dt className="text-muted text-xs">{t(`overview.vendorStage.${stage}`)}</dt>
                    </div>
                  ))}
                </dl>
                <ul className="flex flex-col gap-1.5 text-sm">
                  {orders.rows
                    .filter((row) => row.stage !== 'closed')
                    .slice(0, 3)
                    .map((row) => (
                      <li key={row.id} className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate font-medium">{row.counterparty}</span>
                        <span className="text-muted shrink-0 text-xs">{row.category}</span>
                      </li>
                    ))}
                </ul>
              </>
            ) : (
              <>
                <p className="text-muted text-sm">{t('overview.vendorsEmpty')}</p>
                <Link
                  href={`/events/${id}/vendors`}
                  className={buttonClasses({ variant: 'secondary', size: 'sm', className: 'w-fit rounded-full' })}
                >
                  {t('overview.vendorsFind')}
                </Link>
              </>
            )}
          </Card>

          {
            <Card className="flex flex-col gap-2 p-5 lg:col-span-4">
              <h2 className="font-display text-lg font-bold">{t('overview.guestsHeading')}</h2>
              {event.expectedGuests !== null && (
                <p className="font-medium">{t('overview.guestsExpected', { count: event.expectedGuests })}</p>
              )}
              {guestTotal > 0 ? (
                <dl className="grid grid-cols-3 gap-2 text-center">
                  {(['YES', 'MAYBE', 'NO'] as const).map((key) => (
                    <div key={key} className="bg-surface-2 rounded-2xl p-2">
                      <dd className="font-display text-xl font-bold">{replyCount(key)}</dd>
                      <dt className="text-muted text-xs">{t(`overview.rsvp.${key}`)}</dt>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-muted text-sm">{t('overview.guestsEmpty')}</p>
              )}
              <Link href={`/events/${id}/guests`} className="text-brand-strong text-sm font-medium">
                {t('overview.guestsOpen', { count: guestTotal })}
              </Link>
            </Card>
          }

          {event.momentsEnabled && (
            <Card className="flex flex-col gap-2 p-5 lg:col-span-4">
              <h2 className="font-display text-lg font-bold">{t('overview.momentsHeading')}</h2>
              {canModerateMoments ? (
                <Link href={`/events/${id}/moments`} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
                  {t('overview.momentsManage')}
                </Link>
              ) : galleryCode ? (
                <Link href={`/m/${galleryCode}`} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
                  {t('overview.momentsView')}
                </Link>
              ) : (
                <p className="text-muted text-sm">{t('overview.momentsComingSoon')}</p>
              )}
            </Card>
          )}

          <Card className="flex flex-col gap-3 p-5 lg:col-span-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-lg font-bold">{t('overview.decisionsHeading')}</h2>
              <Link href={`/events/${id}/chat`} className="text-brand-strong text-sm font-medium">
                {t('overview.decisionsOpen')}
              </Link>
            </div>
            {decisions.length === 0 ? (
              <p className="text-muted text-sm">{t('overview.decisionsEmpty')}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {decisions.map((row) => (
                  <li key={row.id} className="border-border border-l-2 pl-3 text-sm">
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
          </Card>

          <Card className="flex flex-col gap-3 p-5 lg:col-span-4">
            <h2 className="font-display text-lg font-bold">{t('overview.activityHeading')}</h2>
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
          </Card>

          <Card className="flex flex-col gap-3 p-5 lg:col-span-8">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-lg font-bold">{t('overview.teamHeading')}</h2>
              <div className="flex gap-1">
                {['HOST', 'CO_HOST', 'PLANNER', 'PLANNER_STAFF'].includes(overview.myRole) && (
                  <Link href={`/events/${id}/chat`} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
                    {t('overview.teamChat')}
                  </Link>
                )}
                <Link
                  href={`/events/${id}/settings/members`}
                  className={buttonClasses({ variant: 'ghost', size: 'sm' })}
                >
                  {t('overview.manageTeam')}
                </Link>
              </div>
            </div>
            <ul className="flex flex-wrap gap-3">
              {team.map((member) => (
                <li key={member.userId} className="flex items-center gap-2">
                  <Avatar
                    name={member.name ?? t(`roles.${member.role}`)}
                    {...(member.image ? { src: member.image } : {})}
                  />
                  <span className="text-sm">
                    <span className="block font-medium">{member.name ?? t(`roles.${member.role}`)}</span>
                    <span className="text-muted block">
                      {t(`roles.${member.role}`)}
                      {!member.joined && ` · ${t('overview.teamPending')}`}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </EventFrame>
  );
}
