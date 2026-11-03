'use client';

import { Banner, DropdownMenu, cn } from '@tiwa/ui';
import { ArrowRightLeft, FileText, GripVertical, Mail, Phone, Receipt } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { moveLeadAction } from '../clients/actions.js';

export const STAGES = ['ENQUIRY', 'PROPOSAL_SENT', 'WON', 'LOST'] as const;
type Stage = (typeof STAGES)[number];

export interface PipelineCard {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  stage: Stage;
  createdAt: string;
  proposals: number;
  invoices: number;
}

const ACCENT: Record<Stage, string> = {
  ENQUIRY: 'bg-brand',
  PROPOSAL_SENT: 'bg-warning',
  WON: 'bg-success',
  LOST: 'bg-muted',
};

/** Closed leads (won/lost) reopen as New first, never jump stages (server rule). */
function allowed(from: Stage, to: Stage) {
  if (from === to) return false;
  if (from === 'WON' || from === 'LOST') return to === 'ENQUIRY';
  return true;
}

/**
 * Planner pipeline (PLN-03): drag a card to another column on desktop, or use
 * "Move to" on any card (phones, keyboard). Moves show at once and roll back
 * if the server refuses.
 */
export function PipelineBoard({ cards }: { cards: PipelineCard[] }) {
  const t = useTranslations('planner');
  const router = useRouter();
  const [optimistic, setOptimistic] = React.useOptimistic(
    cards,
    (state: PipelineCard[], move: { id: string; stage: Stage }) =>
      state.map((card) => (card.id === move.id ? { ...card, stage: move.stage } : card)),
  );
  const [dragging, setDragging] = React.useState<string | null>(null);
  const [over, setOver] = React.useState<Stage | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [, startTransition] = React.useTransition();

  function move(card: PipelineCard, stage: Stage) {
    if (!allowed(card.stage, stage)) {
      if (card.stage !== stage) setError(t('pipelineClosed'));
      return;
    }
    setError(null);
    startTransition(async () => {
      setOptimistic({ id: card.id, stage });
      const result = await moveLeadAction({ clientId: card.id, stage });
      if (!result.ok) setError(t('errors.generic'));
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <Banner tone="warning">{error}</Banner>}
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0">
        {STAGES.map((stage) => {
          const column = optimistic.filter((card) => card.stage === stage);
          return (
            <section
              key={stage}
              aria-label={t(`stages.${stage}`)}
              onDragOver={(e) => {
                if (!dragging) return;
                e.preventDefault();
                setOver(stage);
              }}
              onDragLeave={() => setOver((current) => (current === stage ? null : current))}
              onDrop={(e) => {
                e.preventDefault();
                const card = optimistic.find((row) => row.id === dragging);
                setOver(null);
                setDragging(null);
                if (card) move(card, stage);
              }}
              className={cn(
                'bg-surface-2/60 border-border/60 flex w-[78vw] max-w-xs shrink-0 snap-start flex-col gap-2 rounded-3xl border p-3 transition md:w-auto md:max-w-none',
                over === stage && 'border-brand ring-brand/20 bg-brand/5 ring-4',
              )}
            >
              <header className="flex items-center gap-2 px-1 pb-1">
                <span className={cn('size-2.5 rounded-full', ACCENT[stage])} aria-hidden />
                <h2 className="flex-1 text-sm font-semibold">{t(`stages.${stage}`)}</h2>
                <span className="bg-bg text-muted rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums">
                  {column.length}
                </span>
              </header>
              {column.length === 0 && (
                <p className="text-muted border-border/70 rounded-2xl border border-dashed px-3 py-6 text-center text-xs">
                  {t('pipelineEmptyColumn')}
                </p>
              )}
              <ul className="flex flex-col gap-2">
                {column.map((card) => (
                  <li
                    key={card.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move';
                      setDragging(card.id);
                    }}
                    onDragEnd={() => {
                      setDragging(null);
                      setOver(null);
                    }}
                    className={cn(
                      'bg-bg border-border/70 group flex flex-col gap-2 rounded-2xl border p-3 shadow-[var(--shadow-1)] transition hover:shadow-[var(--shadow-2)]',
                      dragging === card.id && 'opacity-50',
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <GripVertical
                        className="text-muted mt-0.5 hidden size-4 shrink-0 cursor-grab md:block"
                        aria-hidden
                      />
                      <Link href={`/clients/${card.id}`} className="min-w-0 flex-1 font-semibold hover:underline">
                        {card.name}
                      </Link>
                      <DropdownMenu
                        label={t('moveTo')}
                        align="end"
                        trigger={
                          <button
                            type="button"
                            aria-label={t('moveCard', { name: card.name })}
                            className="text-muted hover:bg-surface-2 hover:text-text -m-1 rounded-full p-1.5"
                          >
                            <ArrowRightLeft className="size-4" aria-hidden />
                          </button>
                        }
                        items={STAGES.filter((target) => target !== card.stage).map((target) => ({
                          label: t(`stages.${target}`),
                          disabled: !allowed(card.stage, target),
                          onSelect: () => move(card, target),
                        }))}
                      />
                    </div>
                    {(card.phone || card.email) && (
                      <p className="text-muted flex min-w-0 items-center gap-1.5 text-xs">
                        {card.phone ? (
                          <Phone className="size-3 shrink-0" aria-hidden />
                        ) : (
                          <Mail className="size-3 shrink-0" aria-hidden />
                        )}
                        <span className="truncate">{card.phone ?? card.email}</span>
                      </p>
                    )}
                    <div className="text-muted flex items-center gap-3 text-xs">
                      <span className="inline-flex items-center gap-1">
                        <FileText className="size-3" aria-hidden />
                        {card.proposals}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Receipt className="size-3" aria-hidden />
                        {card.invoices}
                      </span>
                      <span className="ml-auto">
                        {new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short' }).format(
                          new Date(card.createdAt),
                        )}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
