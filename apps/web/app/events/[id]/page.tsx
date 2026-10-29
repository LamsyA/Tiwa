import { getEventType } from '@tiwa/config';
import { authorize, getEventOverview, utcToZoned } from '@tiwa/core';
import {
  Avatar,
  Badge,
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
  const { ctx, access } = await loadEventPage(id, '');
  const t = await getTranslations('events');
  const overview = await getEventOverview(ctx.actor, id);
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
  const now = new Date();

  return (
    <EventFrame eventId={id} userId={ctx.actor.userId} access={access} active="overview" title={event.name}>
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
          className="border-border flex flex-col gap-2 overflow-hidden rounded-lg border p-4"
          style={{ borderTop: `6px solid ${event.themeColor ?? 'var(--brand)'}` }}
        >
          <div className="flex flex-wrap items-center gap-2">
            {template && <Badge>{template.label}</Badge>}
            <Badge tone="brand">{t(`roles.${overview.myRole}`)}</Badge>
            {event.status !== 'ACTIVE' && <StatusPill tone="neutral">{t(`status.${event.status}`)}</StatusPill>}
          </div>
          <p className="font-display text-2xl font-bold lg:hidden">{event.name}</p>
          <p className="text-muted flex flex-wrap items-center gap-2">
            <CalendarDays aria-hidden className="size-4" />
            {event.startsAt ? (
              <>
                <DateText value={event.startsAt} format="datetime" timeZone={event.timezone} />
                {event.startsAt > now && (
                  <span>
                    · <RelativeTime value={event.startsAt} />
                  </span>
                )}
              </>
            ) : (
              t('overview.noDate')
            )}
          </p>
          {firstDay?.venueName && (
            <p className="text-muted flex items-center gap-2">
              <MapPin aria-hidden className="size-4" />
              {firstDay.venueName}
            </p>
          )}
        </header>

        <div className="grid gap-4 lg:grid-cols-12">
          <Card className="flex items-center gap-4 p-4 lg:col-span-4">
            <ProgressRing
              value={progress.done}
              max={Math.max(progress.total, 1)}
              label={t('overview.progressLabel')}
              showValue
            />
            <div className="flex flex-col gap-1">
              <h2 className="font-medium">{t('overview.progressHeading')}</h2>
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

          <Card className="flex flex-col gap-3 p-4 lg:col-span-8">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-medium">{t('overview.deadlinesHeading')}</h2>
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

          {canSeeMoney && (
            <Card className="flex flex-col gap-2 p-4 lg:col-span-4">
              <h2 className="font-medium">{t('overview.moneyHeading')}</h2>
              <p className="text-muted text-sm">{t('overview.moneyBudget')}</p>
              <p className="font-display text-xl font-bold">
                <MoneyText value={event.plannedBudgetMinor.toString()} currency={event.currency} />
              </p>
              <p className="text-muted text-sm">{t('overview.moneyComingSoon')}</p>
            </Card>
          )}

          <Card className="flex flex-col gap-2 p-4 lg:col-span-4">
            <h2 className="font-medium">{t('overview.vendorsHeading')}</h2>
            <p className="text-muted text-sm">{t('overview.vendorsComingSoon')}</p>
          </Card>

          {event.invitesEnabled && (
            <Card className="flex flex-col gap-2 p-4 lg:col-span-4">
              <h2 className="font-medium">{t('overview.guestsHeading')}</h2>
              {event.expectedGuests !== null && (
                <p className="font-medium">{t('overview.guestsExpected', { count: event.expectedGuests })}</p>
              )}
              <p className="text-muted text-sm">{t('overview.guestsComingSoon')}</p>
            </Card>
          )}

          {event.momentsEnabled && (
            <Card className="flex flex-col gap-2 p-4 lg:col-span-4">
              <h2 className="font-medium">{t('overview.momentsHeading')}</h2>
              <p className="text-muted text-sm">{t('overview.momentsComingSoon')}</p>
            </Card>
          )}

          <Card className="flex flex-col gap-3 p-4 lg:col-span-8">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-medium">{t('overview.teamHeading')}</h2>
              <Link href={`/events/${id}/settings/members`} className={buttonClasses({ variant: 'ghost', size: 'sm' })}>
                {t('overview.manageTeam')}
              </Link>
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
