import { getEventType } from '@tiwa/config';
import {
  authorize,
  budgetAlerts,
  budgetSummary,
  galleryCodeForEvent,
  getEventOverview,
  listPaymentSchedule,
  utcToZoned,
} from '@tiwa/core';
import {
  Avatar,
  Banner,
  Card,
  DateText,
  MoneyText,
  ProgressRing,
  RelativeTime,
  StatusPill,
  buttonClasses,
} from '@tiwa/ui';
import { CalendarDays, MapPin } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { EventFrame, loadEventPage } from '@/components/event-frame.js';

/** EVT-05 / Frontend.md §6.3: header, progress, next deadlines, money, vendors, guests, moments, team. */
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
  const template = getEventType(event.type);
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
  const [galleryCode, money] = await Promise.all([
    event.momentsEnabled ? galleryCodeForEvent(id) : Promise.resolve(null),
    canSeeMoney
      ? Promise.all([
          budgetSummary(ctx.actor, { eventId: id }, access),
          listPaymentSchedule(ctx.actor, { eventId: id }, access),
        ])
      : Promise.resolve(null),
  ]);
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
            {template && (
              <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold ring-1 ring-white/20 backdrop-blur-md">
                {template.label}
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

        <div className="grid gap-4 lg:grid-cols-12">
          <Card className="flex items-center gap-5 p-5 lg:col-span-4">
            <ProgressRing
              value={progress.done}
              max={Math.max(progress.total, 1)}
              label={t('overview.progressLabel')}
              showValue
            />
            <div className="flex flex-col gap-1">
              <h2 className="font-display text-lg font-bold">{t('overview.progressHeading')}</h2>
              <p className="text-muted text-sm" data-testid="progress-counts">
                {t('overview.progressCounts', { done: progress.done, total: progress.total })}
              </p>
              <dl className="flex gap-3 text-sm">
                <div>
                  <dt className="text-muted">{t('overview.outstanding')}</dt>
                  <dd className="font-medium">{progress.outstanding}</dd>
                </div>
                <div>
                  <dt className="text-muted">{t('overview.overdue')}</dt>
                  <dd className={progress.overdue > 0 ? 'text-danger font-medium' : 'font-medium'}>
                    {progress.overdue}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">{t('overview.blocked')}</dt>
                  <dd className="font-medium">{progress.blocked}</dd>
                </div>
              </dl>
            </div>
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

          <Card className="flex flex-col gap-2 p-5 lg:col-span-4">
            <h2 className="font-display text-lg font-bold">{t('overview.vendorsHeading')}</h2>
            <p className="text-muted text-sm">{t('overview.vendorsComingSoon')}</p>
          </Card>

          {event.invitesEnabled && (
            <Card className="flex flex-col gap-2 p-5 lg:col-span-4">
              <h2 className="font-display text-lg font-bold">{t('overview.guestsHeading')}</h2>
              {event.expectedGuests !== null && (
                <p className="font-medium">{t('overview.guestsExpected', { count: event.expectedGuests })}</p>
              )}
              <p className="text-muted text-sm">{t('overview.guestsComingSoon')}</p>
            </Card>
          )}

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
