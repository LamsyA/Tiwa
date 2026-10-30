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

export type EventSection = 'overview' | 'plan' | 'money' | 'documents' | 'guests' | 'invites' | 'settings';

const SECTIONS: { key: EventSection; path: string; needs: Action; needsInvites?: boolean }[] = [
  { key: 'overview', path: '', needs: 'event.view' },
  { key: 'plan', path: '/plan', needs: 'event.view' },
  { key: 'money', path: '/money', needs: 'money.view' },
  { key: 'documents', path: '/documents', needs: 'event.view' },
  // All members see the list (contacts redacted without guests.contacts.view);
  // edits still require guests.manage, enforced in every action (P4-T03).
  { key: 'guests', path: '/guests', needs: 'event.view' },
  // Invitations are optional and off by default (GST-04, UF-07-6): the tab
  // only shows while the host has them on.
  { key: 'invites', path: '/invites', needs: 'event.view', needsInvites: true },
  { key: 'settings', path: '/settings', needs: 'event.view' },
];

function can(access: EventAccess, userId: string, action: Action): boolean {
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
  if (access.role !== 'HOST') await markAccepted(eventId, ctx.actor.userId);
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { invitesEnabled: true } });
  return { ctx, access, allowed: can(access, ctx.actor.userId, needs), invitesOn: event.invitesEnabled };
}

/** First visit by an invited member accepts the invitation (UF-04 step 2). */
async function markAccepted(eventId: string, userId: string): Promise<void> {
  await prisma.eventParticipant.updateMany({
    where: { eventId, userId, removedAt: null, acceptedAt: null },
    data: { acceptedAt: new Date() },
  });
}

export async function EventFrame({
  eventId,
  userId,
  access,
  active,
  title,
  invitesOn = false,
  children,
}: {
  eventId: string;
  userId: string;
  access: EventAccess;
  active: EventSection;
  title: string;
  invitesOn?: boolean;
  children: React.ReactNode;
}) {
  const t = await getTranslations('events.tabs');
  const tabs = SECTIONS.filter((section) => can(access, userId, section.needs) && (!section.needsInvites || invitesOn));
  return (
    <AppFrame
      userId={userId}
      active="events"
      title={title}
      sectionTabs={
        <nav aria-label={t('sections')} className="flex gap-1">
          {tabs.map((tab) => (
            <Link
              key={tab.key}
              href={`/events/${eventId}${tab.path}`}
              aria-current={active === tab.key ? 'page' : undefined}
              className={cn(
                'flex min-h-11 shrink-0 items-center border-b-2 px-3 text-sm font-medium',
                active === tab.key ? 'border-brand-strong text-text' : 'text-muted hover:text-text border-transparent',
              )}
            >
              {t(tab.key)}
            </Link>
          ))}
        </nav>
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
