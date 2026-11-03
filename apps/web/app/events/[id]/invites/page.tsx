import { env } from '@tiwa/config';
import { authorize, batchDeliveries, isEnabled, freeModeQueue, listBatches, listGroups, listGuests } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { Banner, Card, buttonClasses } from '@tiwa/ui';
import { CheckCircle2, CircleHelp, Mail, MailWarning, Send, Users, XCircle } from 'lucide-react';
import Link from 'next/link';
import type * as React from 'react';
import { getTranslations } from 'next-intl/server';
import { EventFrame, loadEventPage } from '@/components/event-frame.js';
import { AiComposer } from './ai-composer.js';
import { Composer } from './composer.js';
import { FreeQueue } from './free-queue.js';
import { InvitesSwitch } from './invites-switch.js';
import { PolicyToggles } from './policy-toggles.js';
import { ShareSection } from './share-section.js';
import { TrackingSection } from './tracking-table.js';

/** P4-T05–T07: invitations switch + Share section + composer + live tracking. */
export default async function InvitesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ batch?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const { ctx, access, allowed, invitesOn, momentsOn, ticketsOn } = await loadEventPage(id, '/invites', 'event.view');
  const t = await getTranslations('events.invites');
  if (!allowed) {
    const tf = await getTranslations('events');
    return (
      <EventFrame
        eventId={id}
        userId={ctx.actor.userId}
        access={access}
        invitesOn={invitesOn}
        momentsOn={momentsOn}
        ticketsOn={ticketsOn}
        active="invites"
        title={t('title')}
      >
        <Banner tone="warning">{tf('forbiddenBody')}</Banner>
      </EventFrame>
    );
  }
  const canManage = await (async () => {
    try {
      authorize(ctx.actor, 'guests.manage', { eventId: id, access });
      return true;
    } catch {
      return false;
    }
  })();
  const event = await prisma.event.findUniqueOrThrow({
    where: { id },
    select: {
      name: true,
      slug: true,
      currency: true,
      sharedLinkEnabled: true,
      countryCode: true,
      remindersEnabled: true,
      allowForwarding: true,
      startsAt: true,
      timezone: true,
      days: { orderBy: { date: 'asc' }, take: 1, select: { venueName: true } },
    },
  });
  // Spelled out once for the ready-made messages ("Saturday, 14 November at 4:00 PM").
  const whenText = event.startsAt
    ? new Intl.DateTimeFormat('en', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: event.timezone,
      }).format(event.startsAt)
    : '';
  // UF-27-3 / UF-27-6: AI shows only when the flag is on and the user may manage guests and use AI.
  const aiOn =
    invitesOn &&
    canManage &&
    (await isEnabled('ai.enabled', event.countryCode).catch(() => false)) &&
    (() => {
      try {
        authorize(ctx.actor, 'ai.draftMessage', { eventId: id, access });
        return true;
      } catch {
        return false;
      }
    })();
  const shareUrl = `${env.APP_URL.replace(/\/$/, '')}/e/${event.slug}/rsvp`;
  const [listed, groups, batches, queue] =
    invitesOn && canManage
      ? await Promise.all([
          listGuests(ctx.actor, { eventId: id, take: 500 }, access),
          listGroups(ctx.actor, id, access),
          listBatches(ctx.actor, { eventId: id }, access),
          freeModeQueue(ctx.actor, { eventId: id, appUrl: env.APP_URL }, access),
        ])
      : [{ guests: [], total: 0, redacted: false, nextCursor: null }, [], [], { items: [] }];
  const [replies, unreachable] = await Promise.all([
    prisma.guest.groupBy({ by: ['rsvp'], where: { eventId: id, deletedAt: null }, _count: { _all: true } }),
    prisma.guest.count({ where: { eventId: id, deletedAt: null, email: null, phone: null } }),
  ]);
  const replyCount = (key: string) => replies.find((row) => row.rsvp === key)?._count._all ?? 0;
  const totalGuests = replies.reduce((sum, row) => sum + row._count._all, 0);
  const sentCount = batches.reduce((sum, batch) => sum + (batch.status === 'DRAFT' ? 0 : batch.total), 0);
  // Local/dev: emails land in the test inbox until a real provider is configured.
  const testInbox = env.EMAIL_PROVIDER === 'fake' && process.env.NODE_ENV !== 'production';
  const selectedBatch = query.batch ?? batches[0]?.id ?? null;
  const detail =
    invitesOn && canManage && selectedBatch ? await batchDeliveries(ctx.actor, { batchId: selectedBatch }) : null;

  return (
    <EventFrame
      eventId={id}
      userId={ctx.actor.userId}
      access={access}
      invitesOn={invitesOn}
      momentsOn={momentsOn}
      ticketsOn={ticketsOn}
      active="invites"
      title={event.name}
    >
      <div className="flex flex-col gap-6 py-2">
        <section
          className="relative overflow-hidden rounded-3xl p-6 text-white shadow-[var(--shadow-2)] sm:p-8"
          style={{
            background:
              'linear-gradient(135deg, color-mix(in oklab, var(--brand) 88%, black 6%), color-mix(in oklab, var(--accent) 60%, var(--brand)))',
          }}
        >
          <div aria-hidden className="tiwa-grid-bg absolute inset-0 opacity-20" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-white/80">{t('title')}</p>
              <h2 className="font-display mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{t('heroTitle')}</h2>
              <p className="mt-1 max-w-lg text-sm text-white/80">{t('heroBody')}</p>
            </div>
            {invitesOn && canManage && (
              <div className="flex flex-wrap items-center gap-2 [&_button]:rounded-full">
                {aiOn && <AiComposer eventId={id} currency={event.currency} appUrl={env.APP_URL.replace(/\/$/, '')} />}
                <Composer
                  eventId={id}
                  eventName={event.name}
                  whenText={whenText}
                  venueName={event.days[0]?.venueName ?? ''}
                  currency={event.currency}
                  appUrl={env.APP_URL.replace(/\/$/, '')}
                  guests={listed.guests.map((guest) => ({ id: guest.id, name: guest.name }))}
                  groups={groups}
                />
              </div>
            )}
          </div>
          <dl className="relative mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {(
              [
                ['guests', totalGuests, Users],
                ['sent', sentCount, Send],
                ['yes', replyCount('YES'), CheckCircle2],
                ['maybe', replyCount('MAYBE'), CircleHelp],
                ['no', replyCount('NO'), XCircle],
              ] as [string, number, React.ComponentType<{ className?: string }>][]
            ).map(([key, value, Icon]) => (
              <div key={key} className="rounded-2xl bg-white/12 p-3 ring-1 ring-white/15 backdrop-blur-md">
                <dt className="flex items-center gap-1.5 text-xs font-medium text-white/75">
                  <Icon aria-hidden className="size-3.5" />
                  {t(`stat.${key}`)}
                </dt>
                <dd className="font-display mt-1 text-2xl font-bold">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {!invitesOn && (
          <Card className="flex flex-col gap-3 rounded-3xl p-6">
            <h3 className="font-display text-lg font-bold">{t('off.title')}</h3>
            <p className="text-muted text-sm">{t('off.body')}</p>
            {canManage && <InvitesSwitch eventId={id} enabled={false} />}
          </Card>
        )}

        {invitesOn && canManage && (
          <>
            {testInbox && <Banner tone="info">{t('testInbox')}</Banner>}
            {unreachable > 0 && (
              <div className="border-warning/40 bg-warning-soft flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3">
                <MailWarning aria-hidden className="text-warning size-5 shrink-0" />
                <p className="min-w-0 flex-1 text-sm">{t('unreachable', { count: unreachable })}</p>
                <Link
                  href={`/events/${id}/guests`}
                  className={buttonClasses({ variant: 'secondary', size: 'sm', className: 'rounded-full' })}
                >
                  {t('addContacts')}
                </Link>
              </div>
            )}
            <ol className="grid gap-3 sm:grid-cols-3">
              {(
                [
                  ['add', Users, `/events/${id}/guests`],
                  ['send', Mail, null],
                  ['track', CheckCircle2, '#tracking'],
                ] as [string, React.ComponentType<{ className?: string }>, string | null][]
              ).map(([key, Icon, href], index) => {
                const done =
                  key === 'add' ? totalGuests > 0 : key === 'send' ? sentCount > 0 : replyCount('NONE') < totalGuests;
                const body = (
                  <>
                    <span
                      className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${
                        done ? 'bg-success text-white' : 'bg-brand-soft text-brand-strong'
                      }`}
                    >
                      {done ? <CheckCircle2 aria-hidden className="size-4" /> : <Icon aria-hidden className="size-4" />}
                    </span>
                    <span className="min-w-0">
                      <span className="text-muted block text-xs font-semibold">{t('stepN', { n: index + 1 })}</span>
                      <span className="block font-semibold">{t(`steps.${key}`)}</span>
                    </span>
                  </>
                );
                const className =
                  'border-border/70 bg-surface flex items-center gap-3 rounded-2xl border p-4 transition hover:shadow-[var(--shadow-1)]';
                return (
                  <li key={key}>
                    {href ? (
                      <Link href={href} className={className}>
                        {body}
                      </Link>
                    ) : (
                      <div className={className}>{body}</div>
                    )}
                  </li>
                );
              })}
            </ol>
            {queue.items.length > 0 && <FreeQueue items={queue.items} />}
            <div id="tracking" className="border-border/70 bg-surface rounded-3xl border p-4 sm:p-6">
              <TrackingSection
                eventId={id}
                batches={batches}
                selectedId={selectedBatch}
                deliveries={detail?.deliveries ?? []}
              />
            </div>
          </>
        )}
        <div className="border-border/70 bg-surface rounded-3xl border p-4 sm:p-6">
          <ShareSection
            eventId={id}
            eventName={event.name}
            shareUrl={shareUrl}
            sharedOn={event.sharedLinkEnabled}
            canManage={canManage}
          />
        </div>
        {invitesOn && canManage && (
          <div className="border-border/70 bg-surface flex flex-col gap-4 rounded-3xl border p-4 sm:p-6">
            <h3 className="font-display text-lg font-bold">{t('settingsHeading')}</h3>
            <PolicyToggles eventId={id} remindersOn={event.remindersEnabled} forwardingOn={event.allowForwarding} />
            <InvitesSwitch eventId={id} enabled />
          </div>
        )}
      </div>
    </EventFrame>
  );
}
