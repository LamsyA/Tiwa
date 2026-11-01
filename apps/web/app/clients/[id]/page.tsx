import { getClient } from '@tiwa/core';
import { Badge, Card, buttonClasses } from '@tiwa/ui';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppFrame } from '@/components/app-frame.js';
import { requirePageUser } from '@/lib/ctx.js';
import { ProposalForm } from './proposal-form.js';
import { StageButtons } from './stage-buttons.js';

/** Client detail (P10-T03/T04): notes, stage, proposals. */
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
  return (
    <AppFrame userId={ctx.actor.userId} active="clients" title={data.client.name}>
      <div className="flex flex-col gap-4 py-2">
        <Card className="flex flex-wrap items-center justify-between gap-2 p-4">
          <div>
            <h2 className="text-lg font-semibold">{data.client.name}</h2>
            <p className="text-muted text-sm">
              {[data.client.phone, data.client.email].filter(Boolean).join(' · ') || '—'}
            </p>
          </div>
          <Badge>{t(`stages.${data.client.stage}`)}</Badge>
        </Card>

        <StageButtons clientId={data.client.id} stage={data.client.stage} />

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{t('proposals')}</h3>
            {data.proposals.length > 0 && (
              <Link
                href={`/clients/${data.client.id}/proposals/${data.proposals[0]?.id}`}
                className={buttonClasses({ variant: 'ghost' })}
              >
                {t('viewAll')}
              </Link>
            )}
          </div>
          {data.proposals.length === 0 ? (
            <p className="text-muted text-sm">{t('emptyProposals')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.proposals.map((p) => (
                <li key={p.id}>
                  <Card className="flex items-center justify-between gap-2 p-3">
                    <Link href={`/clients/${data.client.id}/proposals/${p.id}`} className="font-medium">
                      {p.title}
                    </Link>
                    <Badge>{p.status}</Badge>
                  </Card>
                </li>
              ))}
            </ul>
          )}
          <ProposalForm orgId={data.client.orgId} clientId={data.client.id} />
        </section>
      </div>
    </AppFrame>
  );
}
