import { listClients, listMyOrgs } from '@tiwa/core';
import { Avatar, EmptyState, StatusPill, buttonClasses } from '@tiwa/ui';
import { ChevronRight, Layers, Plus, Users } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppFrame } from '@/components/app-frame.js';
import { requirePageUser } from '@/lib/ctx.js';
import { AddClientDialog } from './add-client-dialog.js';

const STAGES = ['ENQUIRY', 'PROPOSAL_SENT', 'WON', 'LOST'] as const;
const TONE = { ENQUIRY: 'brand', PROPOSAL_SENT: 'warning', WON: 'success', LOST: 'neutral' } as const;

/** Planner CRM (PLN-02): every client with stage and activity; the board lives at /pipeline. */
export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const ctx = await requirePageUser('/clients');
  const t = await getTranslations('planner');
  const { view } = await searchParams;
  if (view === 'pipeline') redirect('/pipeline');
  const orgs = await listMyOrgs(ctx.actor.userId);
  const plannerOrg = orgs.find((r) => r.org.kind === 'PLANNER')?.org;
  if (!plannerOrg) {
    return (
      <AppFrame userId={ctx.actor.userId} active="clients" title={t('clientsTitle')}>
        <EmptyState icon={<Users className="size-8" aria-hidden />} title={t('plannerOnly')} body="" />
      </AppFrame>
    );
  }
  const clients = await listClients(ctx.actor, { orgId: plannerOrg.id });
  const count = (stage: (typeof STAGES)[number]) => clients.filter((c) => c.stage === stage).length;

  return (
    <AppFrame userId={ctx.actor.userId} active="clients" title={t('clientsTitle')}>
      <div className="flex flex-col gap-5 py-2">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">{t('clientsTitle')}</h1>
            <p className="text-muted text-sm">{t('clientsBody', { count: clients.length })}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/pipeline" className={buttonClasses({ variant: 'secondary', className: 'rounded-full' })}>
              <Layers className="size-4" aria-hidden />
              {t('pipeline')}
            </Link>
            <AddClientDialog orgId={plannerOrg.id} />
          </div>
        </header>

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {STAGES.map((stage) => (
            <div key={stage} className="border-border/70 bg-surface rounded-2xl border p-4">
              <dt className="text-muted text-xs font-medium">{t(`stages.${stage}`)}</dt>
              <dd className="font-display mt-1 text-2xl font-bold tabular-nums">{count(stage)}</dd>
            </div>
          ))}
        </dl>

        {clients.length === 0 ? (
          <EmptyState
            icon={<Users className="size-8" aria-hidden />}
            title={t('emptyClients')}
            body={t('emptyClientsBody')}
          />
        ) : (
          <ul className="divide-border/60 border-border/70 bg-surface flex flex-col divide-y overflow-hidden rounded-3xl border">
            {clients.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/clients/${c.id}`}
                  className="hover:bg-surface-2/60 flex items-center gap-3 px-4 py-3 transition"
                >
                  <Avatar name={c.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{c.name}</p>
                    <p className="text-muted truncate text-xs">
                      {[
                        c.phone ?? c.email,
                        t('activity', { proposals: c._count.proposals, invoices: c._count.invoices }),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <StatusPill tone={TONE[c.stage]}>{t(`stages.${c.stage}`)}</StatusPill>
                  <ChevronRight className="text-muted size-4 shrink-0" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}

        <Link href="/events/new" className={buttonClasses({ variant: 'ghost', className: 'self-start rounded-full' })}>
          <Plus aria-hidden className="size-4" />
          {t('newEvent')}
        </Link>
      </div>
    </AppFrame>
  );
}
