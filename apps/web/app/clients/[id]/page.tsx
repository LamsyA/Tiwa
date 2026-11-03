import { eventTypeCards } from '@tiwa/config';
import { getClient } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { Avatar, DateText, MoneyText, StatusPill } from '@tiwa/ui';
import { CalendarDays, ChevronRight, FileText, Mail, Phone } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppFrame } from '@/components/app-frame.js';
import { requirePageUser } from '@/lib/ctx.js';
import { ProposalForm } from './proposal-form.js';
import { StageButtons } from './stage-buttons.js';
import { StartClientEvent } from './start-event.js';

const TONE = { ENQUIRY: 'brand', PROPOSAL_SENT: 'warning', WON: 'success', LOST: 'neutral' } as const;
const PROPOSAL_TONE: Record<string, 'neutral' | 'warning' | 'success' | 'danger'> = {
  DRAFT: 'neutral',
  SENT: 'warning',
  ACCEPTED: 'success',
  DECLINED: 'danger',
};

/** Client detail (P10-T03/T04, D-X47): contact, stage, their events, proposals. */
export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePageUser(`/clients/${id}`);
  const t = await getTranslations('planner');
  let data;
  try {
    data = await getClient(ctx.actor, id);
  } catch {
    notFound();
  }
  const events = await prisma.event.findMany({
    where: { clientId: id, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, status: true, startsAt: true, timezone: true },
  });
  const { client } = data;

  return (
    <AppFrame userId={ctx.actor.userId} active="clients" title={client.name}>
      <div className="flex flex-col gap-5 py-2">
        <section className="border-border/70 bg-surface relative overflow-hidden rounded-3xl border p-5 shadow-[var(--shadow-1)] sm:p-7">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 -right-20 size-64 rounded-full bg-[var(--brand)]/10 blur-3xl"
          />
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <Avatar name={client.name} size="lg" />
              <div>
                <h2 className="font-display text-2xl font-bold tracking-tight">{client.name}</h2>
                <div className="text-muted mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {client.phone && (
                    <a href={`tel:${client.phone}`} className="inline-flex items-center gap-1.5 hover:underline">
                      <Phone aria-hidden className="size-3.5" />
                      {client.phone}
                    </a>
                  )}
                  {client.email && (
                    <a href={`mailto:${client.email}`} className="inline-flex items-center gap-1.5 hover:underline">
                      <Mail aria-hidden className="size-3.5" />
                      {client.email}
                    </a>
                  )}
                </div>
              </div>
            </div>
            <StatusPill tone={TONE[client.stage]}>{t(`stages.${client.stage}`)}</StatusPill>
          </div>
          {client.notes && <p className="text-muted mt-4 max-w-prose text-sm whitespace-pre-line">{client.notes}</p>}
          <div className="border-border/60 mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <StageButtons clientId={client.id} stage={client.stage} />
            {client.stage !== 'LOST' && (
              <StartClientEvent
                clientId={client.id}
                clientName={client.name}
                types={eventTypeCards().map((card) => ({ key: card.key, label: card.label, blurb: card.blurb }))}
              />
            )}
          </div>
        </section>

        <section aria-labelledby="client-events" className="flex flex-col gap-3">
          <h3 id="client-events" className="font-display text-lg font-bold tracking-tight">
            {t('clientEvents')}
          </h3>
          {events.length === 0 ? (
            <p className="border-border/70 text-muted rounded-2xl border border-dashed p-4 text-sm">
              {t('clientEventsEmpty')}
            </p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {events.map((event) => (
                <li key={event.id}>
                  <Link
                    href={event.status === 'DRAFT' ? `/events/new?id=${event.id}` : `/events/${event.id}`}
                    className="border-border/70 bg-surface hover:border-brand/40 group flex items-center gap-3 rounded-2xl border p-4 transition hover:shadow-[var(--shadow-1)]"
                  >
                    <span className="bg-brand-soft text-brand-strong grid size-10 shrink-0 place-items-center rounded-xl">
                      <CalendarDays aria-hidden className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{event.name}</span>
                      <span className="text-muted block text-xs">
                        {event.startsAt ? (
                          <DateText value={event.startsAt} format="date" timeZone={event.timezone} />
                        ) : (
                          t('noDateYet')
                        )}
                      </span>
                    </span>
                    {event.status === 'DRAFT' && <StatusPill tone="warning">{t('draft')}</StatusPill>}
                    <ChevronRight aria-hidden className="text-muted size-4 transition group-hover:translate-x-0.5" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="client-proposals" className="flex flex-col gap-3">
          <h3 id="client-proposals" className="font-display text-lg font-bold tracking-tight">
            {t('proposals')}
          </h3>
          {data.proposals.length === 0 ? (
            <p className="text-muted text-sm">{t('emptyProposals')}</p>
          ) : (
            <ul className="divide-border/60 border-border/70 bg-surface flex flex-col divide-y overflow-hidden rounded-2xl border">
              {data.proposals.map((proposal) => (
                <li key={proposal.id}>
                  <Link
                    href={`/clients/${client.id}/proposals/${proposal.id}`}
                    className="hover:bg-surface-2/60 flex items-center gap-3 px-4 py-3 transition"
                  >
                    <FileText aria-hidden className="text-muted size-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate font-medium">{proposal.title}</span>
                    <MoneyText
                      value={proposal.totalMinor}
                      currency={proposal.currency}
                      className="text-sm font-semibold"
                    />
                    <StatusPill tone={PROPOSAL_TONE[proposal.status] ?? 'neutral'}>
                      {t.has(`proposalStatus.${proposal.status}`)
                        ? t(`proposalStatus.${proposal.status}`)
                        : proposal.status}
                    </StatusPill>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <ProposalForm orgId={client.orgId} clientId={client.id} />
        </section>
      </div>
    </AppFrame>
  );
}
