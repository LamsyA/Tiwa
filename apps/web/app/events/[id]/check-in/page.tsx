import { checkinStats } from '@tiwa/core';
import { Card } from '@tiwa/ui';
import { getTranslations } from 'next-intl/server';
import { EventFrame, Forbidden, loadEventPage } from '@/components/event-frame.js';
import { CheckinClient } from './checkin-client.js';

/** `/events/[id]/check-in` — live counter, scanner, manual search, offline (UF-23). */
export default async function CheckinPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, access, allowed, invitesOn, momentsOn, ticketsOn } = await loadEventPage(
    id,
    '/check-in',
    'checkin.scan',
  );
  const t = await getTranslations('checkin');
  if (!allowed) {
    return (
      <EventFrame
        eventId={id}
        userId={ctx.actor.userId}
        access={access}
        invitesOn={invitesOn}
        momentsOn={momentsOn}
        ticketsOn={ticketsOn}
        active="overview"
        title={t('title')}
      >
        <Forbidden eventId={id} />
      </EventFrame>
    );
  }
  let stats = { ticketsTotal: 0, ticketsIn: 0, guestsIn: 0, expected: 0 };
  try {
    stats = await checkinStats(ctx.actor, id);
  } catch {
    // Empty events (or revoked access) render the shell with zeroed counters.
  }
  const initial = t('counter', { tin: stats.ticketsIn, gin: stats.guestsIn, expected: stats.expected });
  return (
    <EventFrame
      eventId={id}
      userId={ctx.actor.userId}
      access={access}
      invitesOn={invitesOn}
      momentsOn={momentsOn}
      ticketsOn={ticketsOn}
      active="overview"
      title={t('title')}
    >
      <Card className="mt-2 p-4">
        <p className="font-display text-2xl font-bold" data-testid="checkin-counter">
          {initial}
        </p>
      </Card>
      <CheckinClient eventId={id} initial={initial} />
    </EventFrame>
  );
}
