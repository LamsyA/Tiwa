import type { OrderStage } from '@tiwa/core';
import { Check } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type * as React from 'react';

// One order's progress (D-X35) for the booking and quote pages: five steps,
// the current one highlighted, and a plain sentence on what happens next for
// whoever is looking.

const STEPS: OrderStage[] = ['requested', 'quoted', 'booked', 'confirmed', 'completed'];

function position(stage: OrderStage): number {
  if (stage === 'delivered') return 3.5;
  if (stage === 'closed') return -1;
  return STEPS.indexOf(stage);
}

export async function OrderTimeline({
  stage,
  side,
  title,
  subtitle,
  aside,
}: {
  stage: OrderStage;
  side: 'vendor' | 'client';
  title: string;
  subtitle?: React.ReactNode;
  /** Right-hand slot: amount, status pill, actions. */
  aside?: React.ReactNode;
}) {
  const t = await getTranslations('orders');
  const at = position(stage);
  return (
    <section className="border-border/70 bg-surface flex flex-col gap-5 rounded-3xl border p-5 shadow-[var(--shadow-1)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-bold tracking-tight sm:text-2xl">{title}</h2>
          {subtitle && <div className="text-muted mt-1 text-sm">{subtitle}</div>}
        </div>
        {aside && <div className="flex shrink-0 flex-col items-end gap-1 text-right">{aside}</div>}
      </div>

      {stage === 'closed' ? (
        <p className="bg-surface-2 text-muted rounded-2xl px-4 py-3 text-sm">{t('timeline.closed')}</p>
      ) : (
        <>
          <ol className="grid grid-cols-5 gap-1.5" aria-label={t('stagesLabel')}>
            {STEPS.map((key, index) => {
              const done = index < at || (index === at && stage === 'completed');
              const current = index === Math.floor(at) && stage !== 'completed';
              return (
                <li
                  key={key}
                  className="flex flex-col items-center gap-2 text-center"
                  aria-current={current ? 'step' : undefined}
                >
                  <span className="flex w-full items-center">
                    <span
                      className={`h-0.5 flex-1 ${index === 0 ? 'opacity-0' : index <= at ? 'bg-brand' : 'bg-border'}`}
                    />
                    <span
                      className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition ${
                        done
                          ? 'bg-brand text-on-brand'
                          : current
                            ? 'bg-brand-soft text-brand-strong ring-brand ring-2 ring-offset-2 ring-offset-[var(--surface)]'
                            : 'bg-surface-2 text-muted'
                      }`}
                    >
                      {done ? <Check aria-hidden className="size-4" /> : index + 1}
                    </span>
                    <span
                      className={`h-0.5 flex-1 ${index === STEPS.length - 1 ? 'opacity-0' : index < at ? 'bg-brand' : 'bg-border'}`}
                    />
                  </span>
                  <span
                    className={`text-[11px] leading-tight sm:text-xs ${done || current ? 'font-semibold' : 'text-muted'}`}
                  >
                    {t(`stage.${key}`)}
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="bg-brand-soft/60 text-text rounded-2xl px-4 py-3 text-sm">
            <span className="font-semibold">{t(`next.${side}.${stage}`)}.</span> {t(`timeline.${side}.${stage}`)}
          </p>
        </>
      )}
    </section>
  );
}
