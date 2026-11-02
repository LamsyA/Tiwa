import { authorize, loadEventAccess, type Action, type EventAccess } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { EmptyState, buttonClasses, cn } from '@tiwa/ui';
import { ShieldAlert } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type * as React from 'react';
import { requirePageUser } from '@/lib/ctx.js';
import { AppFrame } from './app-frame.js';

export type EventSection =
  | 'overview'
  | 'plan'
  | 'money'
  | 'documents'
  | 'guests'
  | 'invites'
  | 'moments'
  | 'vendors'
  | 'tickets'
  | 'day'
  | 'close'
  | 'settings';

const SECTIONS: {
  key: EventSection;
  path: string;
  needs: Action;
  needsInvites?: boolean;
  needsMoments?: boolean;
  needsTickets?: boolean;
}[] = [
  { key: 'overview', path: '', needs: 'event.view' },
  { key: 'plan', path: '/plan', needs: 'event.view' },
  { key: 'money', path: '/money', needs: 'money.view' },
  { key: 'documents', path: '/documents', needs: 'event.view' },
  // All members see the list (contacts redacted without guests.contacts.view);
  // edits still require guests.manage, enforced in every action (P4-T03).
  { key: 'guests', path: '/guests', needs: 'event.view' },
  // Invitations are optional and off by default (GST-04, UF-07-6): the tab
  // only shows while the host has them on. Same for Moments (P5-T08).
  { key: 'invites', path: '/invites', needs: 'event.view', needsInvites: true },
  { key: 'moments', path: '/moments', needs: 'event.view', needsMoments: true },
  // Vendor search and shortlisting for the event (P6-T07); quoting states arrive with P7.
  { key: 'vendors', path: '/vendors', needs: 'event.view' },
  // Tickets are optional like invites (TKT-01, P11-T02): the tab shows while
  // the host has them on.
  { key: 'tickets', path: '/tickets', needs: 'event.view', needsTickets: true },
  // Run-of-show (P12): every event gets a day timeline.
  { key: 'day', path: '/day', needs: 'event.view' },
  // Close (P14): only the host (event.close) sees it.
  { key: 'close', path: '/close', needs: 'event.close' },
  { key: 'settings', path: '/settings', needs: 'event.view' },
];

export function can(access: EventAccess, userId: string, action: Action): boolean {
  try {
    authorize({ kind: 'user', userId, isAdmin: false }, action, { eventId: access.eventId, access });
    return true;
  } catch {
    return false;
  }
}

/**
 * Loads the caller's live access for an event page. Non-members get a 404
 * (ids can't be probed); members without `needs` see a 403 page (UF-04-1).
 * Access is re-read on every request, so removal applies immediately (UF-04-3).
 */
export async function loadEventPage(eventId: string, path: string, needs: Action = 'event.view') {
  const ctx = await requirePageUser(`/events/${eventId}${path}`);
  const access = await loadEventAccess(ctx.actor.userId, eventId);
  if (!access) notFound();
  // Acceptance marking is a no-op UPDATE for already-accepted members, but it
  // must not block the page: run it alongside the event fetch instead of
  // serially before it.
  const [event] = await Promise.all([
    prisma.event.findUniqueOrThrow({
      where: { id: eventId },
      select: { invitesEnabled: true, momentsEnabled: true, ticketsEnabled: true },
    }),
    access.role !== 'HOST' ? markAccepted(eventId, ctx.actor.userId) : Promise.resolve(),
  ]);
  return {
    ctx,
    access,
    allowed: can(access, ctx.actor.userId, needs),
    invitesOn: event.invitesEnabled,
    momentsOn: event.momentsEnabled,
    ticketsOn: event.ticketsEnabled,
  };
}

/** First visit by an invited member accepts the invitation (UF-04 step 2). */
async function markAccepted(eventId: string, userId: string): Promise<void> {
  await prisma.eventParticipant.updateMany({
    where: { eventId, userId, removedAt: null, acceptedAt: null },
    data: { acceptedAt: new Date() },
  });
}

/** Sections this member can open, in tab order (also the overview's section grid). */
export function visibleSections(
  access: EventAccess,
  userId: string,
  flags: { invitesOn?: boolean; momentsOn?: boolean; ticketsOn?: boolean },
): { key: EventSection; path: string }[] {
  return SECTIONS.filter(
    (section) =>
      can(access, userId, section.needs) &&
      (!section.needsInvites || Boolean(flags.invitesOn)) &&
      (!section.needsMoments || Boolean(flags.momentsOn)) &&
      (!section.needsTickets || Boolean(flags.ticketsOn)),
  ).map(({ key, path }) => ({ key, path }));
}

export async function EventFrame({
  eventId,
  userId,
  access,
  active,
  title,
  invitesOn = false,
  momentsOn = false,
  ticketsOn = false,
  hideTabs = false,
  children,
}: {
  eventId: string;
  userId: string;
  access: EventAccess;
  active: EventSection;
  title: string;
  invitesOn?: boolean;
  momentsOn?: boolean;
  ticketsOn?: boolean;
  /** The overview shows every section as its own grid, so the strip would repeat it. */
  hideTabs?: boolean;
  children: React.ReactNode;
}) {
  const t = await getTranslations('events.tabs');
  const tabs = visibleSections(access, userId, { invitesOn, momentsOn, ticketsOn });
  return (
    <AppFrame
      userId={userId}
      active="events"
      title={title}
      sectionTabs={
        hideTabs ? undefined : (
          <nav aria-label={t('sections')} className="flex gap-1">
            {tabs.map((tab) => (
              <Link
                key={tab.key}
                href={`/events/${eventId}${tab.path}`}
                aria-current={active === tab.key ? 'page' : undefined}
                className={cn(
                  'flex h-9 shrink-0 items-center rounded-full px-3.5 text-sm font-medium transition-colors',
                  active === tab.key ? 'bg-text text-bg' : 'text-muted hover:text-text hover:bg-surface-2',
                )}
              >
                {t(tab.key)}
              </Link>
            ))}
          </nav>
        )
      }
    >
      {children}
    </AppFrame>
  );
}

/** Rendered in place of a section the member may not open (HTTP-wise the page still loads; the data never does). */
export async function Forbidden({ eventId }: { eventId: string }) {
  const t = await getTranslations('events');
  return (
    <EmptyState
      icon={<ShieldAlert className="size-8" aria-hidden />}
      title={t('forbiddenTitle')}
      body={t('forbiddenBody')}
      action={
        <Link href={`/events/${eventId}`} className={buttonClasses({ variant: 'secondary' })}>
          {t('backToEvent')}
        </Link>
      }
    />
  );
}
